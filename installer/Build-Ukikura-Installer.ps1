# ==============================================================================
# Build Script Installer Ukikura (浮き蔵) — Inno Setup Compiler Wrapper
# ==============================================================================

$ErrorActionPreference = 'Stop'
$rootDir = Split-Path -Parent $PSScriptRoot
$issFile = Join-Path $PSScriptRoot "Ukikura-Setup.iss"
$distDir = Join-Path $rootDir "dist"

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

# Cari ISCC.exe (Inno Setup 6 Compiler) di lokasi standar Windows
$isccCandidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)

$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Host "[Ukikura Builder] Inno Setup 6 (ISCC.exe) belum terpasang di lokasi standar." -ForegroundColor Yellow
    Write-Host "Silakan pasang Inno Setup 6 melalui winget:" -ForegroundColor Cyan
    Write-Host "  winget install -e --id JRSoftware.InnoSetup" -ForegroundColor White
    Write-Host "Atau buka file '$issFile' langsung di aplikasi Inno Setup Compiler lalu tekan Ctrl+F9 (Compile)." -ForegroundColor Cyan
    exit 1
}

Write-Host "[Ukikura Builder] Mengompilasi installer Ukikura menggunakan: $iscc" -ForegroundColor Cyan
& $iscc $issFile
if ($LASTEXITCODE -eq 0) {
    Write-Host "[Ukikura Builder] Selesai! File installer siap didistribusikan di folder: $distDir" -ForegroundColor Green
}
