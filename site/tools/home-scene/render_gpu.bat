@echo off
setlocal enabledelayedexpansion
rem Renders the Alaro home sequence (v2, clay statues) at 3840x2160 on this computer's GPU, then zips the
rem WebP frames + track.json + render-info.txt into alaro-frames-4k.zip.
rem Double-click to run. Running it again later resumes where it stopped.
rem Extra options are passed through, e.g.:
rem   render_gpu.bat --w 2560              (cheaper: 2560x1440, about 2.2x faster)
rem   render_gpu.bat --start 0 --end 119   (half the frames, for splitting across two computers)

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
echo Rendering 240 frames at 3840x2160 (512 samples). This window shows progress and a time estimate;
echo leave it open. Stopping is safe: run this again to continue.
echo.
"%BLENDER%" -b -P "%~dp0build_home.py" -- --render --final --gpu --w 3840 --samples 512 --set 4k --zip %*
if errorlevel 1 (
  echo.
  echo Blender stopped with an error. Scroll up for the message, or send it to Claude.
  pause
  exit /b 1
)

echo.
echo Done. Send this file back:  %~dp0alaro-frames-4k.zip
echo (The full-quality PNG masters stay in %~dp0frames\4k\.)
pause
