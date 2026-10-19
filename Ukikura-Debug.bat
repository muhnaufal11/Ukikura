@echo off
title Ukikura Dynamic Island - Console & Debug Mode
echo ==============================================================================
echo  UKIKURA (浮倉) - DEBUG & LOGGING RUNNER
echo  Membuka Ukikura dengan Developer Tools (F12) dan Live Console Output...
echo ==============================================================================
echo.

set UKIKURA_DEBUG=1
set ELECTRON_ENABLE_LOGGING=true

set "INSTALLED_EXE=%LOCALAPPDATA%\Programs\Ukikura\runtime\electron.exe"
if exist "%INSTALLED_EXE%" (
    echo [Ukikura Debug] Menjalankan runtime terpasang: "%INSTALLED_EXE%"
    if exist "%~dp0dynamic-island\main.js" (
        "%INSTALLED_EXE%" "%~dp0dynamic-island\main.js" --ukikura-debug
    ) else (
        "%INSTALLED_EXE%" "%LOCALAPPDATA%\Programs\Ukikura\dynamic-island\main.js" --ukikura-debug
    )
    goto :end
)

set "LOCAL_ELECTRON=%~dp0node_modules\electron\dist\electron.exe"
if exist "%LOCAL_ELECTRON%" (
    echo [Ukikura Debug] Menjalankan Electron lokal proyek...
    "%LOCAL_ELECTRON%" "%~dp0dynamic-island\main.js" --ukikura-debug
    goto :end
)

echo [Ukikura Debug] Menjalankan via npx electron...
npx electron "%~dp0dynamic-island\main.js" --ukikura-debug

:end
echo.
echo [Ukikura Debug] Tekan F12 pada Dynamic Island untuk toggle DevTools.
echo File log tersimpan di: %LOCALAPPDATA%\Ukikura\logs\ukikura-debug.log
pause
