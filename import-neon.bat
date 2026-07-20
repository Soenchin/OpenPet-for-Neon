@echo off
setlocal
set "SRC=%~dp0..\outputs\neon-codex-pet"
set "DST=%USERPROFILE%\.codex\pets\neon"

if not exist "%SRC%\pet.json" (
  echo Missing %SRC%\pet.json
  pause
  exit /b 1
)
if not exist "%SRC%\spritesheet.webp" (
  echo Missing %SRC%\spritesheet.webp
  pause
  exit /b 1
)

mkdir "%DST%" 2>nul
copy /Y "%SRC%\pet.json" "%DST%\pet.json" >nul
copy /Y "%SRC%\spritesheet.webp" "%DST%\spritesheet.webp" >nul

echo Neon pet synced to:
echo   %DST%
echo.
echo OpenPet default storage is ~/.codex/pets
echo Restart OpenPet or refresh pet list, then select Neon.
pause
