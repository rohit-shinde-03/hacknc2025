# python_server_gpu.py
# FastAPI GPU inference server using PyTorch for your HF model.
# Start (Windows PowerShell):
#   conda activate nesxform
#   pip install fastapi uvicorn transformers torch --upgrade
#   $env:MODEL_DIR="C:\path\to\model_export"
#   $env:GPU_DTYPE="bf16"   # or "fp16" or "fp32"
#   uvicorn python_server_gpu:app --host 127.0.0.1 --port 8000 --reload
#
# Request body: { "input_ids": [int, ...] }
# Response: { "logits": [float, ...] }  # last-token logits (vocab size)
from typing import List
import os
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM

MODEL_DIR = os.environ.get("MODEL_DIR", "./model_export")
GPU_DTYPE = os.environ.get("GPU_DTYPE", "bf16")  # "bf16" | "fp16" | "fp32"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
dtype_map = {
    "bf16": torch.bfloat16,
    "fp16": torch.float16,
    "fp32": torch.float32,
}
dtype = dtype_map.get(GPU_DTYPE, torch.bfloat16)

# Load model
model = AutoModelForCausalLM.from_pretrained(MODEL_DIR)
if hasattr(model.config, "use_cache"):
    model.config.use_cache = False
model.to(device)
if device.type == "cuda" and dtype != torch.float32:
    model.to(dtype=dtype)

model.eval()
torch.backends.cudnn.benchmark = True

class PredictReq(BaseModel):
    input_ids: List[int]

class PredictRes(BaseModel):
    logits: List[float]

app = FastAPI()

@app.post("/predict", response_model=PredictRes)
@torch.inference_mode()
def predict(req: PredictReq):
    # Accept int32/64 from client
    ids = torch.tensor(req.input_ids, dtype=torch.long, device=device).unsqueeze(0)
    attn = torch.ones_like(ids)
    # Mixed precision if available
    use_amp = device.type == "cuda" and dtype in (torch.bfloat16, torch.float16)
    with torch.cuda.amp.autocast(enabled=use_amp, dtype=dtype if dtype!=torch.float32 else None):
        out = model(input_ids=ids, attention_mask=attn)
        last = out.logits[:, -1, :].squeeze(0).float().cpu().tolist()
    return PredictRes(logits=last)
