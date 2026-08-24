#!/usr/bin/env python3
import json
import shutil
import sys


def has_module(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False


print(json.dumps({
    "python": sys.executable,
    "ffmpeg": shutil.which("ffmpeg") or shutil.which("ffmpeg.exe") or "/opt/homebrew/bin/ffmpeg",
    "faster_whisper": has_module("faster_whisper"),
    "openai_whisper": has_module("whisper"),
    "python_docx": has_module("docx"),
}, ensure_ascii=False, indent=2))
