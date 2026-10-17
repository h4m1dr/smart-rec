@echo off
title Smart-Rec GitHub Auto-Installer & Updater
color 0B

echo ========================================================
echo   [1/3] Downloading latest version from GitHub...
echo   Repo: https://github.com/h4m1dr/smart-rec
echo ========================================================

powershell -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/h4m1dr/smart-rec/archive/refs/heads/main.zip' -OutFile 'latest.zip'"

echo.
echo ========================================================
echo   [2/3] Extracting & updating extension files...
echo ========================================================

powershell -Command "Expand-Archive -Path 'latest.zip' -DestinationPath 'temp_ext' -Force; Copy-Item -Path 'temp_ext\smart-rec-main\*' -Destination '.' -Recurse -Force; Remove-Item 'temp_ext' -Recurse -Force; Remove-Item 'latest.zip' -Force"

echo.
echo ========================================================
echo   [3/3] Launching Chrome with Updated Extension...
echo ========================================================

set EXT_DIR=%~dp0extension
start "" "chrome.exe" --load-extension="%EXT_DIR%" "chrome://extensions"

echo.
echo [SUCCESS] Extension files updated!
echo Press the Reload icon inside chrome://extensions if Chrome was already open.
timeout /t 5
