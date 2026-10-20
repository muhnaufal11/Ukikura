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

$setupUrl = "https://github.com/muhnaufal11/Ukikura/releases/download/v1.0.1/Ukikura-Setup-v1.0.1.exe"
$tempExe = Join-Path $env:TEMP "Ukikura-Setup-v1.0.1.exe"

Write-Host "[1/3] Mengunduh Ukikura-Setup-v1.0.1.exe dari GitHub Release..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $setupUrl -OutFile $tempExe -UseBasicParsing

Write-Host "[2/3] Menghapus blokir SmartScreen (Zone.Identifier)..." -ForegroundColor Yellow
Unblock-File -Path $tempExe -ErrorAction SilentlyContinue

Write-Host "[3/3] Menjalankan Installer Ukikura..." -ForegroundColor Green
Start-Process -FilePath $tempExe -Wait
Write-Host "Instalasi Ukikura selesai!" -ForegroundColor Green
