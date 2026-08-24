@echo off
setlocal
cd /d %~dp0

where node >nul 2>&1 || (echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 并重启终端。 & pause & exit /b 1)
where python >nul 2>&1 || (echo [错误] 未检测到 Python 3.10+，请先安装并勾选“Add to PATH”。 & pause & exit /b 1)

if not exist ".venv" (
  echo [1/5] 创建 Python 虚拟环境 .venv ...
  python -m venv .venv
)

call .venv\Scripts\activate.bat
echo [2/5] 升级 pip 并安装依赖（faster-whisper / python-docx / imageio-ffmpeg）...
python -m pip install -U pip
pip install faster-whisper python-docx imageio-ffmpeg openai-whisper

echo [3/5] 拉取转写模型 small（已存在则跳过）...
python scripts\fetch_models.py small

echo [4/5] 安装 npm 依赖...
call npm install

echo [5/5] 打包 Windows NSIS 安装包（输出到 outputs/release）...
npm run dist:win

echo 完成。安装包位于 outputs/release。
pause
