# AI 调用说明（零析AI 转写 / 零创智能转写器）

> 本文件面向 AI agent 与自动化脚本。产品随包提供命令行入口，**装完即可被 AI 调用**，无需安装 Python / ffmpeg / 模型。

## 一、入口在哪

### macOS
```
/Applications/零析AI 转写.app/Contents/Resources/bin/lingxi-transcribe
```

### Windows
```
%LOCALAPPDATA%\Programs\零创智能转写器\resources\bin\lingxi-transcribe.cmd
```
（若安装时改了目录，把上面的安装根目录换掉即可。）

### 加到 PATH（可选，一次即可）
macOS：
```bash
sudo ln -sf "/Applications/零析AI 转写.app/Contents/Resources/bin/lingxi-transcribe" /usr/local/bin/lingxi-transcribe
```
Windows（PowerShell，当前用户）：
```powershell
$dir = "$env:LOCALAPPDATA\Programs\零创智能转写器\resources\bin"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$dir", "User")
```

## 二、给 AI 的一句话

> 用 `lingxi-transcribe --input <视频> --output-dir <目录> --language zh` 转写，读 stdout 最后一行的 JSON 拿产物路径。

## 三、参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `--input` | 是 | 视频/音频路径（ffmpeg 能读的格式都行） |
| `--output-dir` | 是 | 输出目录，不存在会自动创建 |
| `--language` | 否 | `zh`（默认）或 `auto` |
| `--model` | 否 | 默认用随包 `small` 模型（离线）；也可传模型名或绝对路径 |
| `--organizer` | 否 | `local`（默认，纯本机）/ `openclaw` / `localai` / `cloudai` |
| `--subtitle-mode` | 否 | `off`（默认）/ `auto`（对画面硬字幕做 OCR 辅助校正） |
| `--dedupe-mode` | 否 | `off` / `normal`（默认）/ `strong` |
| `--document-template` | 否 | `general`（默认）/ `live_recap` / `course_notes` / `material_extract` / `sales_script` / `quotes` |

## 四、输出契约

**stdout**：最后一行是一个 JSON 对象，字段如下（路径均为绝对路径）：

```json
{
  "output_dir": "/abs/out",
  "markdown": "/abs/out/转写文档.md",
  "txt": "/abs/out/转写文档.txt",
  "docx": "/abs/out/转写文档.docx",
  "srt": "/abs/out/转写字幕.srt",
  "segments": "/abs/out/segments.json",
  "summary": "一句话摘要",
  "language": "zh",
  "organizer": "local",
  "processing_report": { "...": "..." },
  "dedupe": { "mode": "normal", "removed": 0, "notes": [] },
  "subtitles": "/abs/out/字幕参考.txt",
  "subtitle_count": 0
}
```

**stderr**：进度事件，逐行输出，前缀 `__LC_PROGRESS__`，其后是 JSON，例如：
```
__LC_PROGRESS__{"stage":"transcribe","percent":45,"message":"正在进行 AI 语音识别...","current":12.3,"total":60.0}
```
解析建议：只读 stdout 的最后一行；stderr 可按 `__LC_PROGRESS__` 前缀挑出进度。

## 五、示例

macOS：
```bash
"/Applications/零析AI 转写.app/Contents/Resources/bin/lingxi-transcribe" \
  --input "/Users/me/video.mp4" \
  --output-dir "/Users/me/out" \
  --language zh --organizer local --subtitle-mode auto
```

Windows：
```bat
"%LOCALAPPDATA%\Programs\零创智能转写器\resources\bin\lingxi-transcribe.cmd" ^
  --input "C:\Users\me\video.mp4" --output-dir "C:\Users\me\out" --language zh
```

## 六、隐私

- `--organizer local`（默认）全程本机：音频抽取、识别、整理都在本地完成，**音视频不出机器**。
- 只有显式选择 `cloudai` 时，才会把**文字**发到云端整理（音频仍不上传）。

## 七、常见问题

| 现象 | 处理 |
|---|---|
| `Permission denied`（macOS） | `chmod +x "/Applications/零析AI 转写.app/Contents/Resources/bin/lingxi-transcribe"` |
| 找不到命令（Windows） | 用完整 `.cmd` 路径，或按第一节把 `bin` 加进 PATH |
| 提示没有音频轨 | 视频本身无音轨（如纯录屏），无法转写 |
| 首次很慢 | 模型加载需要几秒；长视频按长度线性增长 |

---

真源：本文件随产品仓库分发；命令行入口见 `cli/lingxi-transcribe`（macOS）与 `cli/lingxi-transcribe.cmd`（Windows）。
