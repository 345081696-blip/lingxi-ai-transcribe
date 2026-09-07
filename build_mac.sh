#!/bin/bash
# macOS 版「零析AI 转写」构建脚本
#
# 作用：准备独立 Python 运行时 + 转写依赖 + ffmpeg/ffprobe + 模型，然后打出 dmg。
#
# 为什么不用 .venv：venv 会在 pyvenv.cfg 里写死「创建它的那台机器」的解释器绝对路径，
# 装到没装过 Python 的电脑上会报 No Python at ... （Windows 版已踩过，见打包复盘坑20）。
# 这里改用 python-build-standalone 的独立 Python，路径无关；ffmpeg/ffprobe 也随包分发，
# 不依赖目标机装过 Homebrew。clone 下来直接跑本脚本即可打包。

set -e
cd "$(dirname "$0")"

PY_VER="3.11.9"
STANDALONE="python-standalone"
STANDALONE_TAG="20240814"

# 1) 独立 Python
if [ ! -x "$STANDALONE/bin/python3" ]; then
  echo "[1/5] 下载独立 Python $PY_VER ..."
  ARCH="$(uname -m)"
  if [ "$ARCH" = "arm64" ]; then
    FILE="cpython-${PY_VER}+${STANDALONE_TAG}-aarch64-apple-darwin-install_only.tar.gz"
  else
    FILE="cpython-${PY_VER}+${STANDALONE_TAG}-x86_64-apple-darwin-install_only.tar.gz"
  fi
  URL="https://github.com/astral-sh/python-build-standalone/releases/download/${STANDALONE_TAG}/${FILE}"
  curl -fL -o /tmp/py-standalone.tar.gz "$URL"
  mkdir -p "$STANDALONE"
  tar -xzf /tmp/py-standalone.tar.gz -C "$STANDALONE" --strip-components=1
  rm -f /tmp/py-standalone.tar.gz
else
  echo "[1/5] 独立 Python 已存在，跳过"
fi

# 2) 转写依赖
echo "[2/5] 安装转写依赖（faster-whisper / python-docx / imageio-ffmpeg）..."
"$STANDALONE/bin/python3" -m pip install --upgrade faster-whisper python-docx imageio-ffmpeg

# 3) ffmpeg / ffprobe 随包分发
# 注意：evermeet.cx 提供的是 x86_64 静态构建，Intel Mac 原生运行，
# Apple Silicon 通过 Rosetta 运行（首次会提示安装 Rosetta）。
echo "[3/5] 准备 ffmpeg / ffprobe ..."
mkdir -p extra/ffmpeg
if [ ! -x extra/ffmpeg/ffmpeg ]; then
  curl -fL -o /tmp/ffm.zip "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"
  unzip -o -j /tmp/ffm.zip -d extra/ffmpeg
  rm -f /tmp/ffm.zip
fi
if [ ! -x extra/ffmpeg/ffprobe ]; then
  curl -fL -o /tmp/ffp.zip "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"
  unzip -o -j /tmp/ffp.zip -d extra/ffmpeg
  rm -f /tmp/ffp.zip
fi
chmod +x extra/ffmpeg/ffmpeg extra/ffmpeg/ffprobe
# 去掉下载隔离属性，否则目标机上会被 Gatekeeper 拦下
xattr -dr com.apple.quarantine extra/ffmpeg 2>/dev/null || true

# 4) 转写模型（随包，让目标机首次使用无需联网）
echo "[4/5] 拉取 small 模型（已存在则跳过）..."
"$STANDALONE/bin/python3" - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("Systran/faster-whisper-small", local_dir="python/models/small")
PY

# 5) 打包
echo "[5/5] 安装 npm 依赖并打包 dmg（输出到 ../../outputs/release）..."
npm install
npx electron-builder --mac dmg

echo "完成。安装包位于 ../../outputs/release"
