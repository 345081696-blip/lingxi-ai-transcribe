# 零析AI 转写

这是一个本机优先的录屏转写与音视频转写桌面应用，当前 macOS 版本为 `v0.2.29`。

GitHub 仓库名使用 `lingxi-ai-transcribe`，对应中文品牌“零创”。旧内部标识中的 `lingchuang` 仅保留在 macOS appId 和本机配置 key 中，用于兼容已安装版本的权限与历史设置。

## 仓库结构

- 根目录：macOS 电脑版 `零析AI 转写`。
- `android/lingxi-transcribe-mobile/`：Android 手机版 `零析AI 转写`。
- `android/lingxi-transcribe-mobile/releases/`：手机版 debug APK 安装包。
- `windows/`：Windows 电脑版 `零析AI 转写` 源码（Electron + electron-builder/NSIS 打包；安装包见 GitHub Release `v0.2.30`）。

目标是实现两种核心流程：

- 录屏后抽取语音，AI 转写并整理成文档。
- 上传短视频或音频，抽取语音，AI 转写并整理成文档。
- 录屏时每秒保存一次录制分片，意外中断时可在输出目录找到已写入的录制文件。
- 录屏开始后显示置顶半透明悬浮控制条，可暂停、继续和停止。
- macOS 上优先使用 ScreenCaptureKit 原生录屏，录制屏幕和系统音频。
- 默认独立运行；可手动启用 OpenClaw/Qwen 增强整理接口，也可直连 Ollama、LM Studio、llama.cpp server 等本地大模型服务，或通过 API Key 调用云端大模型。
- 支持字幕辅助识别、重复内容去重、定时录制、按播放倍速自动计算录制时长。
- 支持文档模板：通用整理、直播复盘、课程笔记、素材提取、成交话术、金句提取。
- 支持转写完成后“换模板生成”，复用已有 `segments.json` 重新整理，不重新跑 Whisper。
- 支持 1-5 个智能整理任务并发处理，其余任务自动排队，适合批量长视频无人值守整理。
- 支持专有词和错词修正、SRT 字幕导出、任务日志复制、运行诊断复制。
- 支持结束缓冲和预计录制完成时间提示。
- Markdown、TXT、DOCX 会写入处理报告，记录智能整理实际使用状态和失败原因。

输出文件会保存到 `~/Documents/TranscribeStudio`，每个任务生成：

- `转写文档.md`
- `转写文档.txt`
- `转写文档.docx`
- `转写字幕.srt`
- `segments.json`

## AI 流程

当前采用两段式流程：

1. 录屏/音频 -> Whisper 本机语音识别。
2. Whisper 文本 -> 本机规则整理、OpenClaw/Qwen 增强整理、本地大模型直连整理，或云端大模型 API 整理 -> 输出简体中文文档。

## 云端大模型 API

`v0.2.29` 支持 OpenAI 兼容云端 API 整理能力，并增加常用服务商预设。界面中选择“云端大模型 API”，先选服务商预设或自定义，再填写：

- API 地址：例如 `https://api.deepseek.com`、`https://api.openai.com`
- 模型名称：例如 `deepseek-v4-flash`、`deepseek-v4-pro`、`gpt-4.1-mini`、`qwen-plus`
- API Key：服务商后台生成的密钥

API Key 只保存在本机应用存储中，转写时通过进程环境变量传递给 Python，不写入命令行、日志、Markdown、TXT 或 DOCX。

如果检测模型列表失败，但“测试模型”成功，仍可正常使用。第三方中转平台以后台显示的 Base URL 和模型 ID 为准。

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

## 版本管理

以后以 GitHub 为唯一源码源头。电脑版和手机版的版本规则、拉取方式、发布方式见 `docs/VERSION_MANAGEMENT.md`。

## 录屏声音说明

macOS 上优先使用 ScreenCaptureKit 原生录屏。新版 macOS 的“屏幕与系统音频录制”权限可提供系统音频；如果录屏文件没有声音，优先到系统设置中授权本应用。导入已下载的视频/音频文件不受这个限制。

如果原生录制不可用，应用会退回 Electron 兼容录制，并尝试启用麦克风兜底录音。此时测试抖音直播/短视频请使用电脑外放播放声音，不要戴耳机。
