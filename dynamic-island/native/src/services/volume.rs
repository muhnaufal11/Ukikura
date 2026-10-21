//! Kontrol Master Volume Windows via CoreAudio (IAudioEndpointVolume).

use windows::core::Result;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

fn get_endpoint_volume() -> Result<IAudioEndpointVolume> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
        Ok(endpoint)
    }
}

pub fn get_volume() -> f32 {
    if let Ok(ep) = get_endpoint_volume() {
        unsafe { ep.GetMasterVolumeLevelScalar().unwrap_or(0.0) }
    } else {
        0.0
    }
}

pub fn set_volume(level: f32) {
    if let Ok(ep) = get_endpoint_volume() {
        let safe = level.clamp(0.0, 1.0);
        unsafe {
            let _ = ep.SetMasterVolumeLevelScalar(safe, std::ptr::null());
        }
    }
}

pub fn change_volume(delta: f32) -> f32 {
    let cur = get_volume();
    let next = (cur + delta).clamp(0.0, 1.0);
    set_volume(next);
    next
}

pub fn get_mute() -> bool {
    if let Ok(ep) = get_endpoint_volume() {
        unsafe { ep.GetMute().map(|b| b.as_bool()).unwrap_or(false) }
    } else {
        false
    }
}

pub fn set_mute(mute: bool) {
    if let Ok(ep) = get_endpoint_volume() {
        unsafe {
            let _ = ep.SetMute(mute, std::ptr::null());
        }
    }
}

pub fn toggle_mute() -> bool {
    let cur = get_mute();
    let next = !cur;
    set_mute(next);
    next
}
