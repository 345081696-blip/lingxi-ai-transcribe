# 本机语音转写工坊

这是一个本机 Electron 应用（Windows / macOS 共用核心；录制在 Windows 上走 Electron 兼容录制）。目标是实现两种流程：

- 录屏后抽取语音，AI 转写并整理成文档。
- 上传短视频或音频，抽取语音，AI 转写并整理成文档。
- 录屏时每秒保存一次录制分片，意外中断时可在输出目录找到已写入的录制文件。
- 录屏开始后显示置顶半透明悬浮控制条，可暂停、继续和停止。
- macOS 上优先使用原生录屏；不支持原生录屏的平台（如 Windows）会自动退回 Electron 兼容录制（系统选择器选屏幕/窗口）。

输出文件会保存到 `~/Documents/TranscribeStudio`，每个任务生成：

- `转写文档.md`
- `转写文档.txt`
- `转写文档.docx`
- `segments.json`

## 本机 AI 引擎

应用优先调用工程内 `.venv` 的 Python Whisper 引擎。建议安装：

```bash
# macOS
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install faster-whisper python-docx imageio-ffmpeg

# Windows（也可直接运行 build.bat 一键完成）
python -m venv .venv
.venv\Scripts\pip install -U pip
.venv\Scripts\pip install faster-whisper python-docx imageio-ffmpeg
```

如需使用 OpenAI Whisper：

```bash
python3 -m pip install openai-whisper python-docx
```

还需要本机有 `ffmpeg`。为免依赖系统安装，构建脚本会在 venv 中安装 `imageio-ffmpeg`，转写时自动使用 venv 内的 ffmpeg，无需单独安装。

## 转写模型（离线自带 + 联网下载）

转写使用 faster-whisper，默认模型 `small`。安装包**已自带** `small` 模型（`python/models/small/`，由构建脚本 `scripts/fetch_models.py` 拉取），首次使用**无需联网**即可离线转写。

行为规则（`transcribe.py` 的 `resolve_model_ref` / `load_engine`）：

- 若 `python/models/<名称>/` 目录存在且非空 → 优先加载本地模型（离线）。
- 若本地不存在（例如界面选了 `base` / `medium` / `large` 等未自带的尺寸）→ 回退为从 HuggingFace 联网下载，下载后缓存到本机，之后离线可用。

重新拉取/补充模型（需联网）：

```bash
npm run fetch:models                      # 拉取默认 small
python3 scripts/fetch_models.py base medium   # 自定义尺寸
```

## 开发运行

```bash
npm install
npm start
```

## 打包

macOS：

```bash
npm run dist
```

Windows（NSIS 安装包，推荐用一键脚本）：

在 `windows/` 目录下双击运行 `build.bat`（或在终端执行），脚本会自动创建 Python venv、安装 faster-whisper / python-docx / imageio-ffmpeg 等依赖、拉取 small 模型、安装 npm 依赖并打包到 `outputs/release`。

也可以手动分步执行：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install faster-whisper python-docx imageio-ffmpeg openai-whisper
python scripts/fetch_models.py small
npm install
npm run dist:win
```

打包产物会输出到 `outputs/release` 目录。

## 录屏声音说明

macOS 上优先使用 ScreenCaptureKit 原生录屏。Windows 上自动使用 Electron 兼容录制（系统选择器选择屏幕或窗口）。系统声音由系统捕获提供；如果录屏文件没有声音，优先到系统设置中授权本应用“屏幕录制/麦克风”权限。导入已下载的视频/音频文件不受这个限制。

如果原生录制不可用，应用会退回 Electron 兼容录制，并尝试启用麦克风兜底录音。此时测试直播/短视频请使用电脑外放播放声音，不要戴耳机。
