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
    $exePath = Join-Path $PSScriptRoot "Ukikura-Setup-v1.0.0.exe"
    if (Test-Path $exePath) {
        $certSubject = "CN=Nauflix (Ukikura Open Source), O=Nauflix, C=ID"
        $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1
        if (-not $cert) {
            $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $certSubject -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
        }
        Set-AuthenticodeSignature -FilePath $exePath -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com" | Out-Null
        Write-Host "[Ukikura Builder] Installer berhasil ditandatangani (Authenticode SHA-256 + DigiCert Timestamp)." -ForegroundColor Green
    }
    Write-Host "[Ukikura Builder] Selesai! File installer siap didistribusikan: $exePath" -ForegroundColor Green
}
