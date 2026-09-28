# -*- coding: utf-8 -*-
"""方言转写 worker —— 供「零创智能转写器」内部调用（Qwen3-ASR）

做什么：
    吃一个音频文件 → 按静音点分块 → Qwen3-ASR 逐块转写 → 输出带时间戳的 segments JSON

用法：
    python asr_worker.py --audio audio.wav --out result.json
        [--language zh] [--prompt "热词提示"] [--ffmpeg ffmpeg.exe] [--model-dir DIR]

stdout 协议（给调用方读进度）：
    ##PROGRESS## 42|正在进行方言语音识别...
    ##RESULT## {"out": "..."}
stderr 用于普通日志。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SENT_END = "。！？!?；;…"
LANG_MAP = {
    "zh": "Chinese", "chinese": "Chinese", "中文": "Chinese",
    "en": "English", "english": "English",
    "auto": None, "": None, "none": None,
}


def log(msg):
    print(str(msg), file=sys.stderr, flush=True)


def progress(percent, message):
    print("##PROGRESS## {:.0f}|{}".format(percent, message), flush=True)


# ---------------------------------------------------------------- 音频处理

def detect_silences(ffmpeg, audio_path, noise_db=-35, min_dur=0.35, timeout=600):
    """用 ffmpeg 找出静音区间，返回 [(start, end), ...]"""
    if not ffmpeg or not Path(ffmpeg).exists():
        return []
    cmd = [
        ffmpeg, "-hide_banner", "-nostats", "-i", str(audio_path),
        "-af", "silencedetect=noise={}dB:d={}".format(noise_db, min_dur),
        "-f", "null", "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout)
        text = proc.stderr or ""
    except Exception as error:
        log("静音检测失败（不影响转写，改按固定时长分块）：{}".format(error))
        return []

    silences = []
    start = None
    for line in text.splitlines():
        hit = re.search(r"silence_start:\s*([0-9.]+)", line)
        if hit:
            start = float(hit.group(1))
            continue
        hit = re.search(r"silence_end:\s*([0-9.]+)", line)
        if hit and start is not None:
            silences.append((start, float(hit.group(1))))
            start = None
    return silences


def plan_chunks(duration, silences, target=45.0, max_len=75.0, min_len=12.0):
    """把 [0, duration] 切成若干块，优先在静音处下刀，返回 [(start, end), ...]"""
    if duration <= max_len:
        return [(0.0, float(duration))]

    cuts = []
    cursor = 0.0
    while duration - cursor > max_len:
        ideal = cursor + target
        best = None
        for silence_start, silence_end in silences:
            middle = (silence_start + silence_end) / 2.0
            if cursor + min_len <= middle <= cursor + max_len:
                if best is None or abs(middle - ideal) < abs(best - ideal):
                    best = middle
        if best is None:
            best = min(cursor + target, duration)
        cuts.append(best)
        cursor = best

    chunks = []
    prev = 0.0
    for cut in cuts:
        chunks.append((prev, cut))
        prev = cut
    chunks.append((prev, float(duration)))
    return chunks


def read_chunk(handle, sample_rate, start, end, target_sr=16000):
    """按时间区间读音频，必要时重采样到 16k"""
    import numpy as np
    begin = int(start * sample_rate)
    count = int((end - start) * sample_rate)
    handle.seek(begin)
    data = handle.read(count, dtype="float32", always_2d=True)
    data = data.mean(axis=1)
    if sample_rate != target_sr:
        from scipy.signal import resample_poly
        data = resample_poly(data, target_sr, sample_rate).astype("float32")
    return np.ascontiguousarray(data)


# ---------------------------------------------------------------- 文本切分

def split_sentences(text, min_len=6, hard_limit=110):
    text = (text or "").strip()
    if not text:
        return []

    pieces = []
    buffer = ""
    for char in text:
        buffer += char
        if char in SENT_END:
            if buffer.strip():
                pieces.append(buffer.strip())
            buffer = ""
    if buffer.strip():
        pieces.append(buffer.strip())

    merged = []
    for piece in pieces:
        if merged and len(merged[-1]) < min_len:
            merged[-1] = merged[-1] + piece
        else:
            merged.append(piece)

    # 超长句按逗号再拆，仍超长就按字数硬切
    final = []
    for piece in merged:
        if len(piece) <= hard_limit:
            final.append(piece)
            continue
        for part in re.split(r"[，,]", piece):
            part = part.strip()
            if not part:
                continue
            while len(part) > hard_limit:
                final.append(part[:hard_limit])
                part = part[hard_limit:]
            if part:
                final.append(part)
    return final


def allocate(chunk_start, chunk_end, sentences):
    """块内按字数比例分配时间轴"""
    total = sum(len(item) for item in sentences) or 1
    span = chunk_end - chunk_start
    output = []
    cursor = chunk_start
    for index, sentence in enumerate(sentences):
        share = span * len(sentence) / total
        output.append({
            "start": round(cursor, 2),
            "end": round(cursor + share, 2),
            "text": sentence,
        })
        cursor += share
    if output:
        output[-1]["end"] = round(chunk_end, 2)
    return output


# ---------------------------------------------------------------- 主流程

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--language", default="Chinese")
    parser.add_argument("--prompt", default="")
    parser.add_argument("--ffmpeg", default="")
    parser.add_argument("--model-dir", default=r"D:\Qwen3ASR\models\Qwen3-ASR-0.6B-hf")
    parser.add_argument("--target-chunk", type=float, default=45.0)
    parser.add_argument("--max-chunk", type=float, default=75.0)
    parser.add_argument("--max-tokens", type=int, default=2048)
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        raise SystemExit("找不到音频文件：{}".format(audio_path))

    started = time.time()
    language = LANG_MAP.get((args.language or "").strip().lower(), "Chinese")
    prompt = (args.prompt or "").strip() or "云南昆明方言采访录音，说话人讲昆明话。"

    progress(2, "正在加载方言模型（Qwen3-ASR）...")
    import torch
    import soundfile as sf
    from transformers import AutoProcessor, Qwen3ASRForConditionalGeneration

    processor = AutoProcessor.from_pretrained(args.model_dir)
    model = Qwen3ASRForConditionalGeneration.from_pretrained(args.model_dir, dtype=torch.float32)
    model.eval()
    log("方言模型加载完成，用时 {:.0f} 秒".format(time.time() - started))
    progress(12, "方言模型加载完成，正在分析音频...")

    with sf.SoundFile(str(audio_path)) as handle:
        sample_rate = handle.samplerate
        duration = handle.frames / float(sample_rate or 1)

        silences = detect_silences(args.ffmpeg, audio_path)
        chunks = plan_chunks(duration, silences, target=args.target_chunk, max_len=args.max_chunk)
        log("音频 {:.1f} 秒，检测到 {} 处静音，分 {} 块".format(duration, len(silences), len(chunks)))

        segments = []
        detected = None
        for index, (chunk_start, chunk_end) in enumerate(chunks, start=1):
            percent = 12 + int(80 * (index - 1) / max(len(chunks), 1))
            progress(percent, "正在进行方言语音识别...（第 {}/{} 块）".format(index, len(chunks)))
            try:
                samples = read_chunk(handle, sample_rate, chunk_start, chunk_end)
                if samples.size < 1600:
                    continue
                inputs = processor.apply_transcription_request(
                    audio=samples, language=language, prompt=prompt
                )
                with torch.no_grad():
                    generated = model.generate(**inputs, max_new_tokens=args.max_tokens)
                parsed = processor.decode(generated[0], return_format="parsed")
                detected = parsed.get("language") or detected
                sentences = split_sentences(parsed.get("transcription", ""))
                if not sentences:
                    continue
                segments.extend(allocate(chunk_start, chunk_end, sentences))
                log("第 {}/{} 块完成：{} 句".format(index, len(chunks), len(sentences)))
            except Exception as error:
                log("第 {}/{} 块失败（已跳过）：{}: {}".format(
                    index, len(chunks), type(error).__name__, error))

    progress(96, "正在整理转写结果...")
    full_text = "".join(item["text"] for item in segments)
    result = {
        "engine": "qwen3-asr-0.6b",
        "language": detected or "Chinese",
        "duration": round(duration, 2),
        "chunk_count": len(chunks),
        "segments": segments,
        "full_text": full_text,
        "elapsed": round(time.time() - started, 1),
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    progress(100, "方言语音识别完成。")
    print("##RESULT## " + json.dumps({
        "out": str(out_path),
        "segments": len(segments),
        "elapsed": result["elapsed"],
    }, ensure_ascii=False), flush=True)
    log("完成：{} 句，用时 {:.0f} 秒".format(len(segments), result["elapsed"]))


if __name__ == "__main__":
    main()
