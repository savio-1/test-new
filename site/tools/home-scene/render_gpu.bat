@echo off
setlocal enabledelayedexpansion
rem Renders the Alaro home sequence at 1920x1080 on this computer's GPU, then zips the frames.
rem Double-click to run. Rendering again later resumes where it stopped.
rem Extra options are passed through, e.g.:  render_gpu.bat --start 0 --end 119

cd /d "%~dp0"

set "BLENDER="
for /f "delims=" %%B in ('where blender 2^>nul') do if not defined BLENDER set "BLENDER=%%B"
if not defined BLENDER (
  for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do if exist "%%D\blender.exe" set "BLENDER=%%D\blender.exe"
)
if not defined BLENDER (
  if exist "%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe" set "BLENDER=%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe"
)
if not defined BLENDER (
  echo Could not find Blender.
  set /p "BLENDER=Drag blender.exe into this window and press Enter: "
  set "BLENDER=!BLENDER:"=!"
)

echo Using Blender: "%BLENDER%"
echo Rendering 240 frames at 1920x1080. This window shows progress; leave it open.
echo.
"%BLENDER%" -b -P "%~dp0build_home.py" -- --render --final --gpu %*
if errorlevel 1 (
  echo.
  echo Blender stopped with an error. Scroll up for the message, or send it to Claude.
  pause
  exit /b 1
)

echo.
echo Zipping the frames...
powershell -NoProfile -Command "Compress-Archive -Path 'frames\hd\*' -DestinationPath 'alaro-frames-hd.zip' -Force"
echo.
echo Done. Send this file back:  %~dp0alaro-frames-hd.zip
pause
