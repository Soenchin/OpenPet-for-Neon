@echo off
setlocal
set "SETUP=%~dp0..\outputs\openpet\OpenPet_0.1.6_x64-setup.exe"
if not exist "%SETUP%" (
  echo Installer not found:
  echo   %SETUP%
  echo Download it first or re-run the setup script.
  pause
  exit /b 1
)

echo Installing OpenPet from:
echo   %SETUP%
echo.
echo Neon pet is already prepared at:
echo   %USERPROFILE%\.codex\pets\neon
echo.

"%SETUP%"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo Installer exited with code %ERR%
  pause
  exit /b %ERR%
)

echo.
echo Done. Start OpenPet, open Settings, choose pet "Neon".
pause
