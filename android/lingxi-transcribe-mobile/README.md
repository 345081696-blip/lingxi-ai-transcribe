# 零析AI 转写 Android

## 项目定位

独立安卓 App，只负责把手机里的视频、音频、录音转成文稿。

流程：

1. 导入本地视频。
2. 提取音频。
3. 转为 16kHz mono PCM/WAV。
4. 调用本地 whisper.cpp 模型转写。
5. 可选字幕 OCR 辅助纠错。
6. 整理 TXT、DOCX、时间轴文稿。
7. 保存历史记录并导出到公共文件夹。

不做录屏，不做云端转写，不上传用户视频。

## 当前状态

- 包名：`com.lingchuang.lingxi`
- 应用名：`零析AI 转写`
- 副标题：`零析AI 转写`
- 当前版本：`v0.3.2-lingxi`
- 最低版本：Android 8.0，`minSdk 26`
- 目标版本：`targetSdk 35`
- UI：Kotlin + Jetpack Compose
- 构建：项目内 Gradle Wrapper + Android Gradle Plugin + Kotlin Android
- 转写：本地 whisper.cpp JNI，内置 `ggml-tiny.bin`
- 当前阶段：视频导入、音频导入、录音转写、音频提取、字幕辅助 OCR、TXT/DOCX 导出、本地历史记录已接入。
- 稳定性策略：手机端默认 2 线程转写，避免长视频触发系统高温保护。

## 权限清单

- `POST_NOTIFICATIONS`：长任务通知。
- `FOREGROUND_SERVICE`：前台服务。
- `FOREGROUND_SERVICE_MEDIA_PROCESSING`：媒体处理前台服务。
- `WAKE_LOCK`：长视频转写期间保持任务执行。
- `RECORD_AUDIO`：录音转写。

## 导入方式

- 系统文件选择器。
- 相册 / 文件管理器选择 `video/*`。
- 上传本地 `audio/*`。
- 外部 App 分享 `video/*` 或 `audio/*`。
- 文件管理器打开 `video/*` 或 `audio/*`。

## 主要功能

- 本地视频提取 WAV。
- 本地音频转 WAV。
- 手机录音后转写。
- 字幕辅助 OCR 捕捉，用于降低同音字和专有词错误。
- 专有词与错词纠正，支持 `错词=正确词`。
- 导出 `TXT` 和 `DOCX`。
- 公共导出目录：
  - `Downloads/零析AI 转写/文稿`
  - `Downloads/零析AI 转写/音频`
  - `Downloads/零析AI 转写/字幕辅助`
- 首页文件夹入口：`文稿文件夹`、`音频文件夹`。

## 安装包

```text
releases/零析AI 转写-v0.3.2-debug.apk
```

## 构建方式

本机使用 Android Studio 自带 JBR 和用户目录 Android SDK：

```bash
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME='/Users/lglmac/Library/Android/sdk' ./gradlew :app:assembleDebug
```

APK 输出：

```text
app/build/outputs/apk/debug/app-debug.apk
```

## 真机测试记录

- 设备：Xiaomi `21091116AC`，Android 13。
- `v0.3.2` 已通过 `:app:assembleDebug`。
- `v0.3.2` 已通过 `adb install -r` 覆盖安装。
- 首页显示 `零析AI 转写 · v0.3.2`。
- DOCX zip 结构校验通过。
- WAV 输出为 `16000Hz / mono / 16-bit`。
- 字幕辅助 OCR 已做二次降噪，过滤短视频平台 UI 文案。
