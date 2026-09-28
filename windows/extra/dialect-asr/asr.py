# -*- coding: utf-8 -*-
"""方言语音转写 —— Qwen3-ASR（支持云南话等 22 种中文方言）

用法：
    python asr.py <音频文件> [输出txt] [language]
例：
    python asr.py D:\\采访\\audio.wav
    python asr.py D:\\采访\\audio.wav out.txt Chinese
"""
import sys
import time
from pathlib import Path

import torch

sys.stdout.reconfigure(encoding="utf-8")

MODEL_DIR = r"D:\Qwen3ASR\models\Qwen3-ASR-0.6B-hf"
DEFAULT_AUDIO = r"C:\Users\黄鶯\Documents\TranscribeStudio\2026-09-17T15-07-11-679Z-0a56d2b5fa4f01580fa46caf96ea96b3\audio.wav"

RAW_INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(DEFAULT_AUDIO)
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"D:\Qwen3ASR\out_昆明话转写.txt")
FORCE_LANG = sys.argv[3] if len(sys.argv) > 3 else None
FFMPEG = r"D:\零创智能转写器\local-transcribe-studio\resources\ffmpeg\ffmpeg.exe"

import subprocess

if not RAW_INPUT.exists():
    raise SystemExit(f"找不到文件：{RAW_INPUT}")

if RAW_INPUT.suffix.lower() == ".wav":
    AUDIO = str(RAW_INPUT)
else:
    # 手机拍的 mp4/m4a/mp3 先统一转 16k 单声道 wav
    TMP_DIR = Path(r"D:\Qwen3ASR\tmp")
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    converted = TMP_DIR / (RAW_INPUT.stem + ".16k.wav")
    subprocess.run(
        [FFMPEG, "-y", "-i", str(RAW_INPUT), "-vn", "-ac", "1", "-ar", "16000", str(converted)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
    )
    AUDIO = str(converted)

logs = []


def log(text=""):
    print(text, flush=True)
    logs.append(str(text))


t0 = time.time()
log("正在加载方言模型（Qwen3-ASR）...")
from transformers import AutoProcessor, Qwen3ASRForConditionalGeneration

processor = AutoProcessor.from_pretrained(MODEL_DIR)
model = Qwen3ASRForConditionalGeneration.from_pretrained(MODEL_DIR, dtype=torch.float32)
model.eval()
log(f"模型加载完成，用时 {time.time() - t0:.0f} 秒")

# 直接读成数组传入，避免依赖 librosa
import numpy as np
import soundfile as sf

audio_array, sample_rate = sf.read(AUDIO, dtype="float32")
if audio_array.ndim > 1:
    audio_array = audio_array.mean(axis=1)
if sample_rate != 16000:
    from scipy.signal import resample_poly

    audio_array = resample_poly(audio_array, 16000, sample_rate).astype("float32")
    sample_rate = 16000
log(f"音频：{len(audio_array) / sample_rate:.1f} 秒，采样率 {sample_rate}")

# 先自动检测，再强制中文；带热词提示可显著改善方言专有词
attempts = []
if FORCE_LANG:
    attempts.append((FORCE_LANG, None))
else:
    attempts.append((None, None))
    attempts.append(("Chinese", None))
    attempts.append(("Chinese", "云南昆明方言采访录音，说话人讲昆明话。"))

for language, prompt in attempts:
    t1 = time.time()
    try:
        inputs = processor.apply_transcription_request(
            audio=audio_array, language=language, prompt=prompt
        )
        with torch.no_grad():
            generated = model.generate(**inputs, max_new_tokens=2048)
        parsed = processor.decode(generated[0], return_format="parsed")
        elapsed = time.time() - t1
        log("")
        log("=" * 62)
        log(f"language={language} | prompt={prompt} | 耗时 {elapsed:.0f} 秒")
        log("=" * 62)
        log(f"[检测语言] {parsed.get('language')}")
        log(parsed.get("transcription", "").strip())
    except Exception as error:
        log(f"language={language} 失败：{type(error).__name__}: {error}")

OUT.write_text("\n".join(logs), encoding="utf-8")
log("")
log(f"结果已写入：{OUT}")
