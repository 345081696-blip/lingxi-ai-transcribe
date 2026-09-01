@echo off
setlocal
cd /d %~dp0

where node >nul 2>&1 || (echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 并重启终端。 & pause & exit /b 1)
where python >nul 2>&1 || (echo [错误] 未检测到 Python 3.10+，请先安装并勾选“Add to PATH”。 & pause & exit /b 1)

set PY_VER=3.11.9
set EMBED_ZIP=python-%PY_VER%-embed-amd64.zip

REM 便携 Python：随包分发，不依赖目标机是否安装过 Python。
REM 不用 venv —— venv 的 pyvenv.cfg 会写死“创建它的那台机器”的解释器绝对路径，
REM 装到别的电脑上就会报 No Python at ... 。

if not exist "python-embed\python.exe" (
  echo [1/6] 下载并解压便携 Python %PY_VER% ...
  curl -L -o "%EMBED_ZIP%" "https://www.python.org/ftp/python/%PY_VER%/%EMBED_ZIP%" || (echo [错误] 下载便携 Python 失败，请检查网络。 & pause & exit /b 1)
  mkdir python-embed 2>nul
  tar -xf "%EMBED_ZIP%" -C python-embed || (echo [错误] 解压便携 Python 失败。 & pause & exit /b 1)
  del "%EMBED_ZIP%"
)

echo [2/6] 写入模块搜索路径配置 python311._pth ...
mkdir python-embed\site-packages 2>nul
> python-embed\python311._pth (
  echo python311.zip
  echo .
  echo site-packages
  echo import site
)

echo [3/6] 安装转写依赖到便携环境（faster-whisper / python-docx / imageio-ffmpeg）...
python -m pip install --target python-embed\site-packages --upgrade faster-whisper python-docx imageio-ffmpeg || (echo [错误] 依赖安装失败。 & pause & exit /b 1)

echo [4/6] 校验便携环境可用 ...
python-embed\python.exe -c "import faster_whisper, docx; print('便携环境校验通过')" || (echo [错误] 便携 Python 依赖校验失败。 & pause & exit /b 1)

echo [5/6] 拉取转写模型 small（已存在则跳过）+ 安装 npm 依赖 ...
REM 用便携 Python 拉模型：它的 site-packages 里已带 huggingface_hub，
REM 换成系统 python 会因缺少该依赖而中断（&& 链断裂，打包就不跑了）。
python-embed\python.exe scripts\fetch_models.py small
call npm install

echo [6/6] 打包 Windows NSIS 安装包（输出到 outputs/release）...
npm run dist:win

echo 完成。安装包位于 outputs/release。
pause
