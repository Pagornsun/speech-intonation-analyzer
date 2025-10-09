# backend/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import librosa as lr
import io, time, os, subprocess, shutil
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers

# ---------- Custom Layer ----------
class SelfAttention(layers.Layer):
    def __init__(self, embed_dim):
        super(SelfAttention, self).__init__()
        self.query = layers.Dense(embed_dim)
        self.key = layers.Dense(embed_dim)
        self.value = layers.Dense(embed_dim)
        self.scale = tf.math.sqrt(tf.cast(embed_dim, tf.float32))

    def call(self, inputs):
        Q, K, V = self.query(inputs), self.key(inputs), self.value(inputs)
        attention_scores = tf.nn.softmax(tf.matmul(Q, K, transpose_b=True) / self.scale, axis=-1)
        context = tf.matmul(attention_scores, V)
        return context

# ---------- Settings ----------
MODEL_PATH = os.getenv("MODEL_PATH", "best_ser_model.h5")
DEFAULT_SR  = 16000
N_MELS      = 128  # ✅ แก้จาก 64 เป็น 128 ให้ตรงกับที่ train
N_MFCC      = 40
FFT_SIZE    = 1024
HOP_LENGTH  = 320
TOP_EMOS    = ['ANG', 'DIS', 'FEA', 'HAP', 'NEU', 'SAD']  # ✅ เพิ่ม comma

# ---------- Build model architecture ----------
def build_attention_model(input_shape, num_classes):
    inp = layers.Input(shape=input_shape)
    x = layers.Conv2D(16, (3,3), activation='relu', padding='same', kernel_regularizer=regularizers.l2(0.0001))(inp)
    x = layers.MaxPooling2D((2,2))(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.2)(x)  # ✅ แก้จาก 0.2 เป็น 0.3 ให้ตรงกับที่ train
    x = layers.Conv2D(16, (3,3), activation='relu', padding='same')(x)
    x = layers.MaxPooling2D((2,2))(x)
    x = layers.Dropout(0.2)(x)  # ✅ แก้จาก 0.2 เป็น 0.3

    x = layers.Reshape((x.shape[1], x.shape[2]*x.shape[3]))(x)
    x = layers.Bidirectional(layers.LSTM(16, return_sequences=True))(x)
    x = layers.Dropout(0.2)(x)  # ✅ แก้จาก 0.2 เป็น 0.3
    x = SelfAttention(16)(x)
    x = layers.Dropout(0.2)(x)  # ✅ แก้จาก 0.2 เป็น 0.3
    x = layers.GlobalAveragePooling1D()(x)
    x = layers.Dense(16, activation='relu')(x)
    x = layers.Dropout(0.2)(x)  # ✅ แก้จาก 0.2 เป็น 0.3
    out = layers.Dense(num_classes, activation='softmax')(x)  # ✅ จะได้ output 6 classes

    model = models.Model(inp, out)
    return model

# ---------- Load model and weights ----------
# ✅ INPUT_SHAPE ต้องตรงกับที่ train: (n_mfcc + n_mels, max_len, 1)
INPUT_SHAPE = (N_MFCC + N_MELS, 128, 1)  # (168, 128, 1)
try:
    model = build_attention_model(INPUT_SHAPE, len(TOP_EMOS))
    model.load_weights(MODEL_PATH)
    print(f"✅ Model loaded successfully from {MODEL_PATH}")
    print(f"   Input shape: {INPUT_SHAPE}")
    print(f"   Output classes: {len(TOP_EMOS)} - {TOP_EMOS}")
except Exception as e:
    raise RuntimeError(f"Cannot load model: {e}")

# ---------- App ----------
app = FastAPI(title="SER Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ---------- Helpers ----------
def extract_features(y, sr, n_mfcc=40, n_mels=128, max_len=128):
    """Extract MFCC + Mel-spectrogram features (ตรงกับที่ train)"""
    # MFCC
    mfcc = lr.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    mfcc = lr.util.fix_length(mfcc, size=max_len, axis=1)
    
    # Mel-spectrogram
    mel = lr.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels)
    mel = lr.power_to_db(mel, ref=np.max)
    mel = lr.util.fix_length(mel, size=max_len, axis=1)
    
    # Combine MFCC + MEL
    combined = np.concatenate((mfcc, mel), axis=0)
    return combined

def _ffmpeg_bytes_to_wav(raw_bytes: bytes, target_sr: int) -> bytes:
    """Transcode arbitrary audio bytes to mono WAV using ffmpeg (if available)."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found in PATH; cannot transcode this format")
    # Pipe input -> output wav mono target_sr
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-f", "wav",
        "-ac", "1",
        "-ar", str(target_sr),
        "pipe:1",
    ]
    proc = subprocess.run(cmd, input=raw_bytes, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode('utf-8', 'ignore')}")
    return proc.stdout


def preprocess_audio(raw_bytes: bytes, sr: int = DEFAULT_SR):
    """Preprocess audio to match training format.
    Try librosa first; if it cannot decode (e.g., webm/opus), fallback to ffmpeg.
    """
    try:
        y, _ = lr.load(io.BytesIO(raw_bytes), sr=sr, mono=True)
    except Exception:
        # Fallback: use ffmpeg to transcode to WAV, then load
        wav_bytes = _ffmpeg_bytes_to_wav(raw_bytes, sr)
        y, _ = lr.load(io.BytesIO(wav_bytes), sr=sr, mono=True)

    if y.size == 0:
        raise ValueError("Empty audio")

    # Extract features ตามที่ train
    features = extract_features(y, sr, n_mfcc=N_MFCC, n_mels=N_MELS, max_len=128)

    # Add channel dimension and batch dimension
    x = np.expand_dims(features, axis=-1)  # (168, 128, 1)
    x = np.expand_dims(x, axis=0)  # (1, 168, 128, 1)
    return x, y

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

# ---------- Routes ----------
@app.get("/")
def root():
    return {"ok": True, "message": "SER backend up", "emotions": TOP_EMOS}

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

        # Preprocess audio
        X, y = preprocess_audio(raw, sr=sampling_rate)

        # Predict
        pred = model.predict(X, verbose=0)
        probs = softmax(pred[0])

        dist = {emo: float(p) for emo, p in zip(TOP_EMOS, probs)}
        top_idx = int(np.argmax(probs))
        top = {"label": TOP_EMOS[top_idx], "confidence": float(probs[top_idx])}

        # Extract prosody
        pitch_series, energy_series = extract_pitch_energy(y, sampling_rate)
        avg_pitch = float(np.nanmean([p["v"] for p in pitch_series if p["v"] > 0]) or 0.0)
        avg_energy = float(np.mean([e["v"] for e in energy_series]) or 0.0)

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
            "n_mfcc": N_MFCC,
            "n_mels": N_MELS,
            "fft_size": fft_size,
            "hop_length": hop_length,
            "input_shape": str(X.shape),
            "ts": int(time.time()*1000),
            "received": audio.filename,
            "duration_form": duration,
        }
        return {"result": result, "meta": meta}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Inference error: {e}")