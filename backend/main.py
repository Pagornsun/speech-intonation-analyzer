# backend/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import librosa as lr
import io, time, os
import tensorflow as tf

from self_attention import SelfAttention  # สำคัญมาก

# ---------- Settings ----------
MODEL_PATH = os.getenv("MODEL_PATH", "best_ser_model.keras")
DEFAULT_SR  = 16000
N_MELS      = 64
FFT_SIZE    = 1024
HOP_LENGTH  = 320
TOP_EMOS    = ["angry","disgust","fear","happy","neutral","sad","surprise"]

# ---------- Load model ----------
try:
    model = tf.keras.models.load_model(
        MODEL_PATH,
        custom_objects={"SelfAttention": SelfAttention},
        compile=False,     # ข้ามการโหลด optimizer/metrics เก่า
        # safe_mode=False   # ถ้า Keras 3 เท่านั้น; ถ้าเป็น TF/Keras 2.x ไม่มีพารามิเตอร์นี้ ให้ลบทิ้ง
    )
except TypeError:
    # กรณี TF/Keras 2.x ไม่รองรับ safe_mode ให้ลองใหม่โดยไม่ใส่
    model = tf.keras.models.load_model(
        MODEL_PATH,
        custom_objects={"SelfAttention": SelfAttention},
        compile=False,
    )
except Exception as e:
    raise RuntimeError(f"Cannot load model: {e}")

INPUT_SHAPE = getattr(model, "input_shape", None)

# ---------- App ----------
app = FastAPI(title="SER Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ---------- Helpers ----------
def preprocess_audio(raw_bytes: bytes, sr: int = DEFAULT_SR):
    y, _ = lr.load(io.BytesIO(raw_bytes), sr=sr, mono=True)
    if y.size == 0:
        raise ValueError("Empty audio")
    mel = lr.feature.melspectrogram(
        y=y, sr=sr, n_fft=FFT_SIZE, hop_length=HOP_LENGTH,
        n_mels=N_MELS, power=2.0
    )
    logmel = lr.power_to_db(mel, ref=np.max)
    x = (logmel - logmel.min()) / (logmel.max() - logmel.min() + 1e-9)

    if INPUT_SHAPE and hasattr(INPUT_SHAPE, "__iter__") and len(INPUT_SHAPE) == 4:
        t_first = np.expand_dims(np.transpose(x, (1,0)), axis=-1)  # (T,F,1)
        f_first = np.expand_dims(x, axis=-1)                       # (F,T,1)
        return t_first[np.newaxis, ...], f_first[np.newaxis, ...]
    else:
        t_first = np.transpose(x, (1,0))  # (T,F)
        return t_first[np.newaxis, ...], None

def softmax(z):
    z = np.asarray(z, dtype=np.float32)
    z = z - z.max()
    e = np.exp(z)
    return e / (e.sum() + 1e-9)

def extract_pitch_energy(y, sr):
    hop = HOP_LENGTH
    S = np.abs(lr.stft(y, n_fft=FFT_SIZE, hop_length=hop))**2
    pitches, mags = lr.piptrack(S=S, sr=sr, hop_length=hop)
    t = np.arange(pitches.shape[1]) * hop / sr
    pitch_hz = []
    for i in range(pitches.shape[1]):
        idx = np.argmax(mags[:, i])
        pitch_hz.append(float(pitches[idx, i]))
    rms = lr.feature.rms(y=y, frame_length=FFT_SIZE, hop_length=hop).flatten()
    et = np.arange(rms.shape[0]) * hop / sr
    return [{"t": float(ti), "v": float(pi)} for ti, pi in zip(t, pitch_hz)], \
           [{"t": float(ti), "v": float(rv)} for ti, rv in zip(et, rms)]

# ---------- Schemas ----------
class AnalyzeResponse(BaseModel):
    result: dict
    meta: dict

@app.get("/")
def root():
    return {"ok": True, "message": "SER backend up"}

# ---------- Routes ----------
# ให้ตรงกับเว็บ: /analyze และฟิลด์ชื่อ "audio", "duration"
@app.post("/predict")
async def predict(

    audio: UploadFile = File(...),
    duration: float = Form(0.0),
    sampling_rate: int = Form(DEFAULT_SR),
    fft_size: int = Form(FFT_SIZE),
    hop_length: int = Form(HOP_LENGTH),
):
    try:
        raw = await audio.read()
        if not raw:
            raise HTTPException(400, "Empty file")

        # โหลดเป็นสัญญาณเพื่อ prosody series
        y, _ = lr.load(io.BytesIO(raw), sr=sampling_rate, mono=True)

        # เตรียมอินพุตให้โมเดล (ลองทั้ง T,F,1 และ F,T,1)
        Xt, Xf = preprocess_audio(raw, sr=sampling_rate)

        probs = None
        try:
            pred = model.predict(Xt, verbose=0)
            probs = pred[0]
        except Exception:
            if Xf is not None:
                pred = model.predict(Xf, verbose=0)
                probs = pred[0]
            else:
                raise

        if probs.ndim > 1:
            probs = probs.squeeze()
        probs = softmax(probs)[:len(TOP_EMOS)]
        dist = {emo: float(p) for emo, p in zip(TOP_EMOS, probs)}
        top_idx = int(np.argmax(probs))
        top = {"label": TOP_EMOS[top_idx], "confidence": float(probs[top_idx])}

        pitch_series, energy_series = extract_pitch_energy(y, sampling_rate)
        avg_pitch = float(np.nanmean([p["v"] for p in pitch_series if p["v"] > 0]) or 0.0)
        avg_energy = float(np.mean([e["v"] for e in energy_series]) or 0.0)

        # เดโม่ WPM: ประเมินจากความยาวเสียง
        dur_sec = float(len(y) / sampling_rate)
        wpm = int(max(80, min(220, 60 + 20*dur_sec)))

        result = {
            "emotion": top,
            "distribution": dist,
            "prosody": {"pitchHz": round(avg_pitch), "energyRms": round(avg_energy, 3), "wpm": wpm},
            "pitchSeries": pitch_series,
            "energySeries": energy_series,
            "advice": [
                "ลดจังหวะหรือเว้นจังหวะให้ชัดขึ้นเล็กน้อย",
                "คุมระดับเสียงให้สม่ำเสมอเพื่อความชัดเจน",
                "ปรับโทนเสียงให้หลากหลายตรงจุดสำคัญ",
            ],
        }
        meta = {
            "model": MODEL_PATH,
            "sr": sampling_rate,
            "n_mels": N_MELS,
            "fft_size": fft_size,
            "hop_length": hop_length,
            "ts": int(time.time()*1000),
            "received": audio.filename,
            "duration_form": duration,
        }
        return {"result": result, "meta": meta}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Inference error: {e}")
