@echo off
setlocal
set "SRC=%USERPROFILE%\.openpet-private\neon"
set "DST=%~dp0public\pets\neon"

if not exist "%SRC%\pet.json" (
  echo Missing private Neon config: %SRC%\pet.json
  pause
  exit /b 1
)
if not exist "%SRC%\spritesheet.webp" (
  echo Missing private Neon artwork: %SRC%\spritesheet.webp
  pause
  exit /b 1
)

mkdir "%DST%" 2>nul
copy /Y "%SRC%\pet.json" "%DST%\pet.json" >nul
copy /Y "%SRC%\spritesheet.webp" "%DST%\spritesheet.webp" >nul

echo Private Neon assets synced locally to:
echo   %DST%
echo.
echo They are ignored by Git and will not be committed to this public fork.
pause
