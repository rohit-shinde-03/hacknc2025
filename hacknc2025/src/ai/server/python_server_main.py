# src/ai/server/main.py
# FastAPI inference server for the chiptune GPT model used in train.ipynb
# Start with: uvicorn main:app --reload --port 8000
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import torch
import os
from transformers import AutoModelForCausalLM, GPT2Config

PAD_ID = 0
REST_ID = 1
HOLD_ID = 2
PITCH_BASE = 3

MODEL_DIR = os.environ.get("MODEL_DIR", "./model_export")  # folder with config.json + pytorch_model.bin
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Load once
if os.path.isdir(MODEL_DIR):
  model = AutoModelForCausalLM.from_pretrained(MODEL_DIR).to(DEVICE)
else:
  # fallback: create a tiny randomly-init model so the server still runs
  cfg = GPT2Config(vocab_size=PITCH_BASE + 128, n_positions=1024, n_embd=256, n_layer=4, n_head=8, n_inner=1024)
  model = AutoModelForCausalLM.from_config(cfg).to(DEVICE)
model.eval()

class PredictReq(BaseModel):
  input_ids: List[int]

class PredictRes(BaseModel):
  logits: List[float]  # next-token logits

app = FastAPI()

@app.post("/predict", response_model=PredictRes)
def predict(req: PredictReq):
  with torch.no_grad():
    ids = torch.tensor(req.input_ids, dtype=torch.long, device=DEVICE).unsqueeze(0)
    attn = torch.ones_like(ids)
    out = model(input_ids=ids, attention_mask=attn)
    # last-token logits
    last_logits = out.logits[:, -1, :].squeeze(0).detach().float().cpu().numpy().tolist()
    return PredictRes(logits=last_logits)
