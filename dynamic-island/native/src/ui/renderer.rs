//! Tumpukan grafis GPU: D3D11 -> DXGI swapchain komposisi (alpha premultiplied)
//! -> Direct2D device context -> DirectComposition visual pada HWND.
//! Jendela dibuat dengan WS_EX_NOREDIRECTIONBITMAP sehingga DWM langsung
//! mengomposisikan swapchain tanpa salinan bitmap tambahan.

use windows::core::{Interface, Result};
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::DirectComposition::*;
use windows::Win32::Graphics::DirectWrite::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;

pub struct Gpu {
    pub d2d_factory: ID2D1Factory1,
    pub dwrite: IDWriteFactory,
    pub dc: ID2D1DeviceContext,
    swapchain: IDXGISwapChain1,
    _dcomp: IDCompositionDevice,
    _target: IDCompositionTarget,
    _visual: IDCompositionVisual,
    target_bitmap: Option<ID2D1Bitmap1>,
    pub width: u32,
    pub height: u32,
}

impl Gpu {
    pub fn new(hwnd: HWND, width: u32, height: u32) -> Result<Self> {
        unsafe {
            crate::log_append("Gpu::new a: D3D11CreateDevice");
            let mut d3d: Option<ID3D11Device> = None;
            let hr = D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut d3d),
                None,
                None,
            );

            let d3d = match hr {
                Ok(_) if d3d.is_some() => d3d.unwrap(),
                _ => {
                    crate::log_append("Gpu::new a-fallback: WARP");
                    let mut warp: Option<ID3D11Device> = None;
                    D3D11CreateDevice(
                        None,
                        windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_WARP,
                        HMODULE::default(),
                        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                        None,
                        D3D11_SDK_VERSION,
                        Some(&mut warp),
                        None,
                        None,
                    )?;
                    warp.unwrap()
                }
            };
            crate::log_append("Gpu::new b: dxgi_device cast");
            let dxgi_device: IDXGIDevice = d3d.cast()?;

            crate::log_append("Gpu::new c: CreateDXGIFactory2");
            let dxgi_factory: IDXGIFactory2 = CreateDXGIFactory2(DXGI_CREATE_FACTORY_FLAGS(0))?;
            let desc = DXGI_SWAP_CHAIN_DESC1 {
                Width: width.max(1),
                Height: height.max(1),
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                Stereo: false.into(),
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                BufferCount: 2,
                Scaling: DXGI_SCALING_STRETCH,
                SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
                AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
                Flags: 0,
            };
            crate::log_append("Gpu::new d: CreateSwapChainForComposition");
            let swapchain = dxgi_factory.CreateSwapChainForComposition(&d3d, &desc, None)?;

            crate::log_append("Gpu::new e: D2D1CreateFactory");
            let opts = D2D1_FACTORY_OPTIONS { debugLevel: D2D1_DEBUG_LEVEL_NONE };
            let d2d_factory: ID2D1Factory1 =
                D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, Some(&opts))?;
            let d2d_device = d2d_factory.CreateDevice(&dxgi_device)?;
            let dc = d2d_device.CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE)?;
            dc.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);

            crate::log_append("Gpu::new f: DWriteCreateFactory");
            let dwrite: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;

            crate::log_append("Gpu::new g: DCompositionCreateDevice");
            let dcomp: IDCompositionDevice = DCompositionCreateDevice(&dxgi_device)?;
            let target = dcomp.CreateTargetForHwnd(hwnd, true)?;
            let visual = dcomp.CreateVisual()?;
            visual.SetContent(&swapchain)?;
            target.SetRoot(&visual)?;
            dcomp.Commit()?;

            crate::log_append("Gpu::new h: bind_target");
            let mut gpu = Self {
                d2d_factory,
                dwrite,
                dc,
                swapchain,
                _dcomp: dcomp,
                _target: target,
                _visual: visual,
                target_bitmap: None,
                width,
                height,
            };
            gpu.bind_target()?;
            crate::log_append("Gpu::new i: Done!");
            Ok(gpu)
        }
    }

    fn bind_target(&mut self) -> Result<()> {
        unsafe {
            let surface: IDXGISurface = self.swapchain.GetBuffer(0)?;
            let props = D2D1_BITMAP_PROPERTIES1 {
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                },
                dpiX: 96.0,
                dpiY: 96.0,
                bitmapOptions: D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
                colorContext: core::mem::ManuallyDrop::new(None),
            };
            let bmp = self.dc.CreateBitmapFromDxgiSurface(&surface, Some(&props))?;
            self.dc.SetTarget(&bmp);
            self.target_bitmap = Some(bmp);
            Ok(())
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) -> Result<()> {
        if width == self.width && height == self.height {
            return Ok(());
        }
        unsafe {
            self.dc.SetTarget(None::<&ID2D1Image>);
            self.target_bitmap = None;
            self.swapchain.ResizeBuffers(
                2,
                width.max(1),
                height.max(1),
                DXGI_FORMAT_B8G8R8A8_UNORM,
                DXGI_SWAP_CHAIN_FLAG(0),
            )?;
        }
        self.width = width;
        self.height = height;
        self.bind_target()
    }

    pub fn begin(&self) {
        unsafe {
            self.dc.BeginDraw();
            let _ = self.dc.Clear(Some(&D2D1_COLOR_F { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }));
        }
    }

    /// Menyelesaikan frame & menyerahkannya ke DWM (sinkron vsync).
    pub fn end(&self) -> Result<()> {
        unsafe {
            self.dc.EndDraw(None, None)?;
            self.swapchain.Present(1, DXGI_PRESENT(0)).ok()
        }
    }

    pub fn brush(&self, r: f32, g: f32, b: f32, a: f32) -> Result<ID2D1SolidColorBrush> {
        unsafe { self.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r, g, b, a }, None) }
    }
}
