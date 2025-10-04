import os
from pathlib import Path
import librosa
import soundfile as sf
import numpy as np
from tqdm import tqdm
import pandas as pd

RAW_DIR = Path("data/raw")
INTERIM_DIR = Path("data/interim")
DATASETS = ["crema-d", "ravdess", "saveee", "tess"]

SR_TARGET = 16000
PEAK_DBFS = -1.0           # target peak
TRIM_TOP_DB = 20           # silence threshold for librosa.effects.trim
MIN_DURATION_SEC = 0.5

def peak_normalize(y, target_dbfs=-1.0, eps=1e-9):
    peak = np.max(np.abs(y)) + eps
    target_amp = 10 ** (target_dbfs / 20.0)
    gain = target_amp / peak
    return y * gain

def safe_mono(y):
    # y: (n,) or (channels, n) depending on loader
    if y.ndim == 1:
        return y
    return np.mean(y, axis=0)

def process_one(in_path: Path, out_path: Path):
    # โหลดเป็น mono ที่ SR_TARGET ตั้งแต่ต้นเพื่อลดภาระ
    y, sr = librosa.load(in_path.as_posix(), sr=SR_TARGET, mono=True)
    # ตัดความเงียบหัว-ท้าย
    y, idx = librosa.effects.trim(y, top_db=TRIM_TOP_DB)
    dur = len(y) / SR_TARGET
    if dur < MIN_DURATION_SEC:
        return None  # สั้นเกินไป ข้าม

    # ป้องกันคลิป: ถ้าพีคเกิน 1.0 ให้ลดลงก่อน
    if np.max(np.abs(y)) > 1.0:
        y = y / (np.max(np.abs(y)) + 1e-9)

    # Peak normalize ไปที่ -1 dBFS
    y = peak_normalize(y, target_dbfs=PEAK_DBFS)

    # เซฟโฟลเดอร์
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path.as_posix(), y, SR_TARGET, subtype="PCM_16")

    # เก็บสถิติพื้นฐาน
    stats = {
        "in_path": in_path.as_posix(),
        "out_path": out_path.as_posix(),
        "sr": SR_TARGET,
        "duration_sec": round(dur, 4),
        "peak": float(np.max(np.abs(y))),
        "rms": float(np.sqrt(np.mean(np.square(y)))),
        "trim_top_db": TRIM_TOP_DB,
    }
    return stats

def guess_speaker_id(dataset: str, rel_path: Path) -> str:
    """
    พยายามเดา speaker_id จากโครงสร้างไฟล์ของแต่ละ dataset แบบเบาๆ
    - RAVDESS: มักมีโฟลเดอร์ Actor_* เช่น Actor_01/xxx.wav
    - SAVEE: ไฟล์เริ่มด้วย speaker code เช่น DC_ang_1.wav
    - CREMA-D/TESS: ถ้าไม่ชัดเจนให้คืน 'unknown'
    """
    parts = rel_path.parts
    if dataset == "ravdess":
        for p in parts:
            if p.lower().startswith("actor_"):
                return p.split("_")[-1]  # '01'
    if dataset == "saveee":
        stem = rel_path.stem
        cand = stem.split("_")[0]
        if cand in {"DC", "JE", "JK", "KL"}:
            return cand
    # ลองหาเลขในชื่อไฟล์ (บางไฟล์ของ CREMA-D จะมี speaker id ตัวเลขต้นชื่อ)
    digits = "".join([ch for ch in rel_path.stem if ch.isdigit()])
    if digits:
        return digits
    return "unknown"

def build_out_path(dataset: str, src_file: Path) -> Path:
    rel = src_file.relative_to(RAW_DIR / dataset)
    speaker = guess_speaker_id(dataset, rel)
    stem = src_file.stem + "_16k_mono_trim_norm"
    return INTERIM_DIR / dataset / speaker / f"{stem}.wav"

def main():
    stats_all = []
    for ds in DATASETS:
        src_root = RAW_DIR / ds
        if not src_root.exists():
            print(f"[WARN] skip {ds}: {src_root} not found")
            continue
        wavs = list(src_root.rglob("*.wav"))
        print(f"[{ds}] found {len(wavs)} wav files")
        for fp in tqdm(wavs, desc=f"Processing {ds}"):
            try:
                out_fp = build_out_path(ds, fp)
                stats = process_one(fp, out_fp)
                if stats is not None:
                    stats_all.append(stats)
            except Exception as e:
                print(f"[ERROR] {fp}: {e}")

    if stats_all:
        df = pd.DataFrame(stats_all)
        INTERIM_DIR.mkdir(parents=True, exist_ok=True)
        csv_path = INTERIM_DIR / "interim_stats.csv"
        df.to_csv(csv_path, index=False, encoding="utf-8")
        print(f"Saved stats → {csv_path} ({len(df)} rows)")
    else:
        print("No files processed.")

if __name__ == "__main__":
    main()
