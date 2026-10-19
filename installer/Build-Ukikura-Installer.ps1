# ==============================================================================
# Build Script Installer Ukikura (浮き蔵) — Inno Setup Compiler Wrapper
# Mendukung Rilis Universal, Versi Publik (Stabil), dan Versi Debug (Pengembang)
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
    exit 1
}

$certSubject = "CN=Nauflix (Ukikura Open Source), O=Nauflix, C=ID"
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1
if (-not $cert) {
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $certSubject -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
}

$outputFile = "Ukikura-Setup-v1.0.0.exe"
$targetPath = Join-Path $PSScriptRoot $outputFile

Write-Host "[Ukikura Builder] Memulai kompilasi installer terpadu Ukikura v1.0.0 menggunakan: $iscc" -ForegroundColor Cyan
& $iscc $issFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Gagal mengompilasi installer Ukikura"
}

if (Test-Path $targetPath) {
    Start-Sleep -Milliseconds 1200
    Write-Host "[Ukikura Builder] Menandatangani digital (SHA-256)..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 5; $i++) {
        try {
            Set-AuthenticodeSignature -FilePath $targetPath -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com" | Out-Null
            break
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    Copy-Item $targetPath (Join-Path $distDir $outputFile) -Force
    
    $ukikuraInstallerDir = Join-Path $rootDir "Ukikura\installer"
    if (Test-Path $ukikuraInstallerDir) {
        Copy-Item $targetPath (Join-Path $ukikuraInstallerDir $outputFile) -Force
        Copy-Item $issFile (Join-Path $ukikuraInstallerDir "Ukikura-Setup.iss") -Force
    }
    
    # Hapus file split lama jika masih tersisa
    @("Ukikura-Setup-v1.0.0-public.exe", "Ukikura-Setup-v1.0.0-debug.exe") | ForEach-Object {
        $old1 = Join-Path $PSScriptRoot $_
        $old2 = Join-Path $distDir $_
        $old3 = Join-Path $ukikuraInstallerDir $_
        if (Test-Path $old1) { Remove-Item $old1 -Force }
        if (Test-Path $old2) { Remove-Item $old2 -Force }
        if (Test-Path $old3) { Remove-Item $old3 -Force }
    }
    
    Write-Host "`n[Ukikura Builder] Berhasil! Installer tunggal terpadu siap:" -ForegroundColor Green
    Write-Host "  -> $targetPath" -ForegroundColor White
    Write-Host "  -> $(Join-Path $distDir $outputFile)" -ForegroundColor White
}
