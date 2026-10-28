@echo off
rem 零析AI 转写 · AI/命令行调用入口（Windows）
rem 由产品随包分发，自动定位随包的 Python、转写脚本、ffmpeg 与模型。
rem 用法：lingxi-transcribe.cmd --input "C:\video.mp4" --output-dir "C:\out" --language zh
setlocal EnableExtensions

rem 资源根：resources\bin\ -> resources\
set "BIN_DIR=%~dp0"
for %%I in ("%BIN_DIR%..") do set "RES_DIR=%%~fI"

set "PY=%RES_DIR%\python-embed\python.exe"
set "SCRIPT=%RES_DIR%\python\transcribe.py"
set "MODEL_DIR=%RES_DIR%\python\models\small"
set "FFMPEG=%RES_DIR%\ffmpeg\ffmpeg.exe"

if not exist "%PY%" set "PY=python"
if not exist "%FFMPEG%" set "FFMPEG=ffmpeg"

rem 调用方未指定 --model 时，默认用随包模型，保证离线可跑
set "HAS_MODEL="
for %%A in (%*) do (
  if "%%~A"=="--model" set "HAS_MODEL=1"
)
set "EXTRA="
if not defined HAS_MODEL if exist "%MODEL_DIR%" set EXTRA=--model "%MODEL_DIR%"

rem 与 App 主进程保持同一套环境变量约定
set "TRANSCRIBE_STUDIO_PYTHON=%PY%"
if exist "%FFMPEG%" set "TRANSCRIBE_STUDIO_FFMPEG=%FFMPEG%"
set "PATH=%RES_DIR%\ffmpeg;%RES_DIR%\python-embed;%PATH%"

"%PY%" "%SCRIPT%" %* %EXTRA%
exit /b %ERRORLEVEL%
