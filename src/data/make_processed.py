import os
import shutil
from pathlib import Path

INTERIM_DIR = Path("data/interim")
PROCESSED_AUDIO_DIR = Path("data/processed/audio")

# label mapping dictionary
LABEL_MAP = {
    # CREMA-D
    "HAP": "happy", "SAD": "sad", "ANG": "angry",
    "FEA": "fear", "DIS": "disgust", "NEU": "neutral",
    # RAVDESS (emotion code is usually 2-digit in filename like 03, 04,...)
    "01": "neutral", "02": "neutral", "03": "happy", "04": "sad",
    "05": "angry", "06": "fear", "07": "disgust", "08": "surprise",
    # SAVEE
    "h": "happy", "sa": "sad", "a": "angry", "f": "fear",
    "d": "disgust", "n": "neutral", "su": "surprise",
    # TESS
    "happiness": "happy", "sadness": "sad", "anger": "angry",
    "fear": "fear", "disgust": "disgust",
    "pleasant_surprise": "surprise", "neutral": "neutral"
}

def find_label(dataset, filename):
    fname = filename.lower()
    if dataset == "crema-d":
        # ตัวอย่างไฟล์: 1001_DFA_ANG_XX.wav → ใช้ token ที่ 3
        parts = filename.split("_")
        if len(parts) > 2:
            raw = parts[2].upper()
            return LABEL_MAP.get(raw, "unknown")
    elif dataset == "ravdess":
        # ตัวอย่างไฟล์: 03-01-05-01-02-01-12.wav → emotion code = index[2]
        parts = filename.split("-")
        if len(parts) > 2:
            raw = parts[2]
            return LABEL_MAP.get(raw, "unknown")
    elif dataset == "saveee":
        # ตัวอย่างไฟล์: DC_ang_01.wav → ใช้ส่วนกลาง
        parts = filename.split("_")
        if len(parts) > 1:
            raw = parts[1].lower()
            return LABEL_MAP.get(raw, "unknown")
    elif dataset == "tess":
        # ตัวอย่างไฟล์: OAF_angry_word1.wav หรือ OAF_pleasant_surprise_10.wav
        for key in LABEL_MAP.keys():
            if key in fname:
                return LABEL_MAP[key]
    return "unknown"

def main():
    for dataset in ["crema-d", "ravdess", "saveee", "tess"]:
        src_root = INTERIM_DIR / dataset
        if not src_root.exists():
            print(f"[WARN] {dataset} not found")
            continue

        wavs = list(src_root.rglob("*.wav"))
        print(f"[{dataset}] found {len(wavs)} files")

        for wav in wavs:
            label = find_label(dataset, wav.name)
            speaker = wav.parent.name  # ใช้โฟลเดอร์ speaker จาก interim
            out_dir = PROCESSED_AUDIO_DIR / dataset / speaker / label
            out_dir.mkdir(parents=True, exist_ok=True)

            out_path = out_dir / wav.name
            shutil.copy2(wav, out_path)  # copy พร้อม metadata (mtime)

    print("✅ Finished creating processed/audio/")

if __name__ == "__main__":
    main()
