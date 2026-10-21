# ==============================================================================
# Ukikura (浮倉) — Zero-SmartScreen Direct Installer Script
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/muhnaufal11/Ukikura/main/installer/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Ukikura (浮倉) — Windows 11 Dynamic Island Installer" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$repo = "muhnaufal11/Ukikura"
$setupUrl = "https://github.com/$repo/releases/download/v1.0.6/Ukikura-Setup-v1.0.6.exe"
$fileName = "Ukikura-Setup-v1.0.6.exe"

try {
    $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing -TimeoutSec 10
    $exeAsset = $latest.assets | Where-Object { $_.name -like "Ukikura-Setup-*.exe" } | Select-Object -First 1
    if ($exeAsset) {
        $setupUrl = $exeAsset.browser_download_url
        $fileName = $exeAsset.name
    }
} catch {
    # Fallback ke default v1.0.6 jika API unreachable
}

$tempExe = Join-Path $env:TEMP $fileName

Write-Host "[1/3] Mengunduh $fileName dari GitHub Release ($setupUrl)..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $setupUrl -OutFile $tempExe -UseBasicParsing

Write-Host "[2/3] Menghapus blokir SmartScreen (Zone.Identifier)..." -ForegroundColor Yellow
Unblock-File -Path $tempExe -ErrorAction SilentlyContinue

Write-Host "[3/3] Menjalankan Installer Ukikura..." -ForegroundColor Green
Start-Process -FilePath $tempExe -Wait
Write-Host "Instalasi Ukikura selesai!" -ForegroundColor Green
