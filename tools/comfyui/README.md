# ComfyUI 本机出图工具

这个目录用于把本机 `vibe/Qwen3.5` 接到 ComfyUI 图像生成能力。

## 当前安装位置

- ComfyUI：`/Users/lglmac/AI/ComfyUI`
- Python 环境：`/Users/lglmac/AI/ComfyUI/.venv`
- 服务地址：`http://127.0.0.1:8188`
- 模型目录：`/Users/lglmac/AI/ComfyUI/models/checkpoints`

## 启动 ComfyUI

```bash
cd /Users/lglmac/AI/ComfyUI
.venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

浏览器打开：

```text
http://127.0.0.1:8188
```

## 模型

优先使用免费本机方案：

- `flux1-schnell-fp8.safetensors`

这个模型应放在：

```text
/Users/lglmac/AI/ComfyUI/models/checkpoints/flux1-schnell-fp8.safetensors
```

## 让 vibe 调用

给 `vibe` 的任务可以这样写：

```text
请使用 tools/comfyui/generate_logo.py 调用本机 ComfyUI，为《零创 AI 智能转写》生成一个产品图标。
先写清楚英文提示词，再运行脚本。输出图片保存在 assets/generated-logo/。
```

## 注意

- ComfyUI 必须先启动。
- 第一次生成会加载模型，速度较慢。
- 生成结果需要人工挑选和二次修图，不能直接当最终商标使用。
