# 方言识别组件（Qwen3-ASR）

给「零创智能转写器」加方言（昆明话 / 云南话等）识别能力的配套文件。
**注意：这里只有脚本，模型和运行环境不在这个目录里**，见下面「三、完整目录长什么样」。

## 一、为什么需要它

原始程序用 faster-whisper（`small` 模型）识别。对西南官话基本无能：
「事情」→「死情」、「花叶」→「活业」、「愿意」→「演艺」，整篇读不通。

阿里 **Qwen3-ASR-0.6B** 支持 22 种中文方言（含云南方言），实测同一段昆明话
能做到逐句基本正确，106 秒素材 => 约 1 分钟出稿（纯 CPU，约 1.2 倍实时）。

## 二、两个脚本分别干嘛

| 文件 | 用途 | 谁用 |
|---|---|---|
| `asr_worker.py` | 转写器的**方言引擎 worker**。分块 + 打时间戳，输出 JSON segments | 由 `python/transcribe.py` 通过子进程调用，正常不用手动跑 |
| `asr.py` | 单文件突击用。丢一个音视频进去，直接出 txt | 调试 / 救急 |

### asr_worker.py 的行为

- **分块**：用 ffmpeg `silencedetect` 找静音点下刀，目标 45 秒/块，上限 75 秒，
  音频短于 75 秒就单块（Qwen3-ASR 不适合一口气吃超长音频）。
- **时间戳**：块边界精确，块内按标点切句后**按字数比例**分配。
  → 段落级定位够用，但不是词级精确。要词级精确得另装
  `Qwen3-ASR-ForcedAligner` + `decode_forced_alignment`。
- **切句保护**：过短句并入上一句；超长句按逗号再拆；仍超过长按 110 字硬切。
  （因为 `transcribe.py` 的 `clean_segments` 会丢掉长度 <= 1 的片段）
- **进度协议**：stdout 逐行输出 `##PROGRESS## 42|消息`，由 transcribe.py 映射到总进度的 24–74%。

### 命令行用法

```powershell
# 单文件跑（最快出稿）
$env:HF_HUB_OFFLINE = "1"; $env:TRANSFORMERS_OFFLINE = "1"
& "D:\Qwen3ASR\venv\Scripts\python.exe" "D:\Qwen3ASR\asr.py" "素材.mp4" "输出.txt"

# worker 跑（和转写器里调用的方式一致）
& "D:\Qwen3ASR\venv\Scripts\python.exe" asr_worker.py --audio "素材.wav" `
    --out "_out.json" --ffmpeg "<...>\resources\ffmpeg\ffmpeg.exe"
```

> 控制台中文会乱码，**不要看日志判断结果**，看输出文件。

## 三、完整目录长什么样

本机部署位置 `D:\Qwen3ASR\`，拷到新机器建议保持这个结构：

```
D:\Qwen3ASR\
  venv\                      运行环境（Python 3.13 + torch 2.14 CPU 版，约 1.3G）
    Scripts\python.exe
  models\Qwen3-ASR-0.6B-hf\  模型权重（1.5G）
    model.safetensors
    config.json / tokenizer.json ...
  asr.py                     ← 本目录里的文件，复制到这
  asr_worker.py              ← 本目录里的文件，复制到这
  tmp\                       TEMP 目录（跑的时候设到这里）
```

> venv 里的 `Scripts\activate.bat` / `pyvenv.cfg` 写的是当前绝对路径。
> **整目录拷过去、路径不变就没问题**；换到别的盘符/目录建议重开 venv。

## 四、接到转写器上

`python/transcribe.py` 里已经内置方言分支，通过下面两个环境变量定位本套组件，
**不设的话默认找 `D:\Qwen3ASR\`**：

| 环境变量 | 默认值 |
|---|---|
| `TRANSCRIBE_STUDIO_DIALECT_WORKER` | `D:\Qwen3ASR\asr_worker.py` |
| `TRANSCRIBE_STUDIO_DIALECT_PYTHON` | `D:\Qwen3ASR\venv\Scripts\python.exe` |

界面上的用法（装好后在**「模型」下拉**里选 **「方言：昆明话等（较慢）」**即可）：

```
界面下拉 ──> main.js ──(--model dialect)──> resources\python\transcribe.py
                                              │ is_dialect_model() 判断
                                              ↓ 子进程（CREATE_NO_WINDOW）
                                        D:\Qwen3ASR\asr_worker.py
                                              ↓
                                        Qwen3-ASR 分块识别 → JSON segments
                                              ↓
                                        回灌原有后处理 → md/txt/docx/srt/segments.json
```

**为什么绕一层子进程**：转写器自带的便携 Python 里没有、也不该塞 torch（太大），
方言模型必须跑在自己的 venv 里，所以用 worker 桥接。

另有一条暗号：在「专有词与错词修正」框里写一行 `#方言`，
其余行会被当作**热词**喂给方言模型（人名、地名这类专有词靠它提准）。

## 五、踩过的坑（别再踩一遍）

1. **必须用 `-hf` 版模型**。ModelScope 上的 `Qwen/Qwen3-ASR-0.6B` 是原生格式
   （权重前缀 `thinker.*`），transformers 期望 `model.language_model.*`，
   加载后全部参数随机初始化 → 输出全是垃圾。要用 `Qwen/Qwen3-ASR-0.6B-hf`。
2. **librosa 没装**，`processor.apply_transcription_request(audio="路径")` 会报
   `load_audio requires the librosa library`。解法：用 soundfile 读成 numpy 数组再传。
3. **正确入口是 `apply_transcription_request(audio, language=, prompt=)`**，
   不是 `__call__`（后者签名 `(text, audio)`，只传 audio 会报缺 text）。
4. **`pip install qwen-asr` 会拖进 gradio 全家桶**（80+ 包）。别装，
   直接用 transformers 原生 API 就行。
5. **中文路径会让 pip 参数乱码**，目录一律放英文路径。
6. **wheel 不能重命名**，必须保留 `torch-2.14.0-cp313-cp313-win_amd64.whl` 这种规范名。
7. **每个任务都要重新加载模型**，固定卡 27 秒左右才动起来，不是死机。
8. **一次只跑一个方言任务**。程序支持并发 2，但方言模式吃 CPU，两个一起跑只会互相拖。

## 六、下载源速度参考（2026-09 实测）

| 源 | 速度 | 备注 |
|---|---|---|
| ModelScope | 10.5 MB/s | 下模型首选 |
| 华为云 PyPI | 10.8 MB/s | pip 可用，本环境用的就是这个 |
| 清华 PyPI | 12.6 MB/s | pip 索引会报错，改用 curl 直下 wheel 再本地装 |
| hf-mirror | 471 KB/s | 慢，别用来下大模型 |
| 阿里云 PyPI | 200 KB/s | 慢 |

## 七、还能升级

- 换 `Qwen3-ASR-1.7B-hf`（3.9G）：更准，但更慢。
- 装 `Qwen3-ASR-ForcedAligner`：补齐词级精确时间戳。
- 给 worker 加文件锁：避免并发两个方言任务抢 CPU / 内存。
