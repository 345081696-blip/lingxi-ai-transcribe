# 零创AI 智能转写器

这是一个本机优先的录屏转写与音视频转写桌面应用，当前版本为 `v0.2.21`。

目标是实现两种核心流程：

- 录屏后抽取语音，AI 转写并整理成文档。
- 上传短视频或音频，抽取语音，AI 转写并整理成文档。
- 录屏时每秒保存一次录制分片，意外中断时可在输出目录找到已写入的录制文件。
- 录屏开始后显示置顶半透明悬浮控制条，可暂停、继续和停止。
- macOS 上优先使用 ScreenCaptureKit 原生录屏，录制屏幕和系统音频。
- 默认独立运行；可手动启用 OpenClaw/Qwen 增强整理接口，也可直连 Ollama、LM Studio、llama.cpp server 等本地大模型服务。
- 支持字幕辅助识别、重复内容去重、定时录制、按播放倍速自动计算录制时长。
- Markdown、TXT、DOCX 会写入处理报告，记录智能整理实际使用状态和失败原因。

输出文件会保存到 `~/Documents/TranscribeStudio`，每个任务生成：

- `转写文档.md`
- `转写文档.txt`
- `转写文档.docx`
- `segments.json`

## AI 流程

当前采用两段式流程：

1. 录屏/音频 -> Whisper 本机语音识别。
2. Whisper 文本 -> 本机规则整理、OpenClaw/Qwen 增强整理，或本地大模型直连整理 -> 输出简体中文文档。

应用优先调用工程内 `.venv` 的 Python Whisper 引擎。建议安装：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install faster-whisper python-docx opencc-python-reimplemented
```

如需使用 OpenAI Whisper：

```bash
python3 -m pip install openai-whisper python-docx
```

还需要本机有 `ffmpeg`。当前机器已检测到 `/opt/homebrew/bin/ffmpeg`。

## 开发运行

```bash
npm install
npm start
```

## 打包

```bash
npm run dist
```

打包产物会输出到当前 Codex 任务的 `outputs/release` 目录。

## 产品化规划

macOS 版当前已具备独立安装基础。Windows 版需要单独补齐 Windows 录屏/系统声音后端、平台专用 Python/Whisper 环境和 ffmpeg 打包方式；应用层会继续保持跨平台 Electron 架构。

## 开发过程

详细开发过程见 `docs/DEVELOPMENT_PROCESS.md`。

## 录屏声音说明

macOS 上优先使用 ScreenCaptureKit 原生录屏。新版 macOS 的“屏幕与系统音频录制”权限可提供系统音频；如果录屏文件没有声音，优先到系统设置中授权本应用。导入已下载的视频/音频文件不受这个限制。

如果原生录制不可用，应用会退回 Electron 兼容录制，并尝试启用麦克风兜底录音。此时测试抖音直播/短视频请使用电脑外放播放声音，不要戴耳机。
