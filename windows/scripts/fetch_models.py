#!/usr/bin/env python3
"""构建前拉取 faster-whisper 模型到 python/models/<size>，已存在则跳过。

用法：
    python3 scripts/fetch_models.py [small] [base] [medium] [...]
默认拉取 small（与 transcribe.py 的默认模型一致）。

模型不入库（见 .gitignore），靠本脚本在构建机上现拉；
也可手动把 Systran/faster-whisper-<size> 的文件放进 python/models/<size>。
"""
import sys
from pathlib import Path

REPO_PREFIX = "Systran/faster-whisper-"
DEFAULT_SIZES = ["small"]


def main():
    sizes = sys.argv[1:] or DEFAULT_SIZES
    base = Path(__file__).resolve().parent.parent  # windows/
    models_dir = base / "python" / "models"
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("未安装 huggingface_hub，请先：python3 -m pip install huggingface_hub")
        sys.exit(1)
    for size in sizes:
        target = models_dir / size
        if target.exists() and any(target.iterdir()):
            print(f"[skip] 模型已存在：{target}")
            continue
        repo = f"{REPO_PREFIX}{size}"
        print(f"[fetch] {repo} -> {target}")
        snapshot_download(repo, local_dir=str(target))
        print(f"[ok] {target}")


if __name__ == "__main__":
    main()
