#!/usr/bin/env python3
import argparse
import json
import time
import uuid
import urllib.request
from pathlib import Path


DEFAULT_PROMPT = (
    "A premium macOS app icon for a Chinese AI transcription product named "
    "'Zero Create AI Smart Transcribe'. Dark graphite rounded-square background, "
    "bright cyan and electric blue accents, elegant audio waveform transforming "
    "into a clean document page, subtle AI neural glow, minimal professional "
    "software icon, high contrast, centered composition, no text, no letters, "
    "no watermark, crisp edges, 1024x1024."
)

DEFAULT_NEGATIVE = (
    "text, letters, words, watermark, messy details, low contrast, blurry, "
    "photorealistic people, clutter, cheap clipart, distorted document, bad logo"
)


def api_json(base_url, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def build_workflow(prompt, negative, checkpoint, width, height, steps, seed):
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            },
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": checkpoint},
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": ["4", 1]},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["4", 1]},
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "zero_create_logo", "images": ["8", 0]},
        },
    }


def wait_for_output(base_url, prompt_id, timeout_seconds):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        history = api_json(base_url, f"/history/{prompt_id}")
        item = history.get(prompt_id)
        if item:
            outputs = item.get("outputs", {})
            images = outputs.get("9", {}).get("images", [])
            if images:
                return images[0]
        time.sleep(2)
    raise TimeoutError(f"ComfyUI generation timed out after {timeout_seconds}s")


def download_image(base_url, image_info, out_dir):
    params = urllib.parse.urlencode(
        {
            "filename": image_info["filename"],
            "subfolder": image_info.get("subfolder", ""),
            "type": image_info.get("type", "output"),
        }
    )
    url = f"{base_url.rstrip('/')}/view?{params}"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / image_info["filename"]
    with urllib.request.urlopen(url, timeout=60) as response:
        out_path.write_bytes(response.read())
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate a logo image through local ComfyUI.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8188")
    parser.add_argument("--checkpoint", default="flux1-schnell-fp8.safetensors")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--negative", default=DEFAULT_NEGATIVE)
    parser.add_argument("--out-dir", default="assets/generated-logo")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    seed = args.seed or int(time.time() * 1000) % 2_147_483_647
    client_id = str(uuid.uuid4())
    workflow = build_workflow(
        args.prompt,
        args.negative,
        args.checkpoint,
        args.width,
        args.height,
        args.steps,
        seed,
    )

    response = api_json(args.base_url, "/prompt", {"prompt": workflow, "client_id": client_id})
    prompt_id = response["prompt_id"]
    image_info = wait_for_output(args.base_url, prompt_id, args.timeout)
    out_path = download_image(args.base_url, image_info, Path(args.out_dir))
    print(json.dumps({"seed": seed, "prompt_id": prompt_id, "image": str(out_path)}, ensure_ascii=False))


if __name__ == "__main__":
    import urllib.parse

    main()
