import re
import json
from pathlib import Path
import pandas as pd
import soundfile as sf
from collections import Counter, defaultdict

PROCESSED_AUDIO_DIR = Path("data/processed/audio")
METADATA_DIR = Path("data/processed/metadata")
CLASS_MAP_PATH = METADATA_DIR / "class_map.csv"  # optional

# ตัวช่วยแม็ป label จาก RAVDESS/SAVEE/TESS ถ้าต้องการ
RAVDESS_EMO_MAP = {
    "01": "neutral", "02": "neutral", "03": "happy", "04": "sad",
    "05": "angry", "06": "fear", "07": "disgust", "08": "surprise"
}
SAVEE_EMO_MAP = {
    "a": "angry", "d": "disgust", "f": "fear", "h": "happy",
    "n": "neutral", "sa": "sad", "su": "surprise"
}
TESS_KEYS = ["happiness", "sadness", "anger", "fear", "disgust", "pleasant_surprise", "neutral"]

def safe_duration_sec(wav_path: Path) -> float:
    try:
        info = sf.info(str(wav_path))
        return round(info.frames / info.samplerate, 4)
    except Exception:
        return None

def infer_label_raw(dataset: str, filename: str, label_std: str) -> str:
    """พยายามเดา label_raw จากชื่อไฟล์ตาม dataset; ถ้าเดาไม่ได้ คืน label_std"""
    stem = filename.lower()
    if dataset == "ravdess":
        # ชื่อไฟล์ 03-01-05-02-02-01-12.wav → index[2] = emotion code
        parts = filename.split("-")
        if len(parts) > 2 and parts[2].isdigit():
            return parts[2]  # raw = code e.g. '05'
    elif dataset == "saveee":
        # DC_ang_01.wav → 'ang' or 'a','d','f','h','n','sa','su'
        m = re.search(r"_(ang|dis|fear|hap|neu|sad|sur|a|d|f|h|n|sa|su)_", filename.lower())
        if m:
            raw = m.group(1)
            # normalize raw short code
            mapping = {
                "ang": "a", "dis": "d", "fear": "f", "hap": "h", "neu": "n",
                "sad": "sa", "sur": "su"
            }
            return mapping.get(raw, raw)
    elif dataset == "crema-d":
        # 1001_DFA_ANG_XX.wav → token 3
        parts = filename.split("_")
        if len(parts) > 2:
            raw = parts[2].upper()
            return raw
    elif dataset == "tess":
        # ชื่อไฟล์มีคำเต็มของอารมณ์ → ดึงคำที่ตรงที่สุด
        for key in TESS_KEYS:
            if key in stem:
                return key
        # บางทีใช้ anger/happy/sad คำสั้น
        for alt in ["anger", "happy", "sad", "fear", "disgust", "surprise", "neutral"]:
            if alt in stem:
                return alt
    return label_std

def infer_gender_age(dataset: str, speaker_id: str, filename: str):
    """คืน (gender, age) ถ้าพอเดาได้; อื่น ๆ คืน (None, None)"""
    if dataset == "saveee":
        # SAVEE เป็นผู้ชายล้วน
        return "M", None
    if dataset == "tess":
        # โฟลเดอร์มักเป็น female26 / female64
        s = speaker_id.lower()
        if s.startswith("female"):
            m = re.search(r"female(\d+)", s)
            if m:
                return "F", int(m.group(1))
            return "F", None
        return "F", None
    # CREMA-D/RAVDESS: เว้นว่าง (ต้องใช้ไฟล์ metadata ภายนอกค่อยเติมทีหลัง)
    return None, None

def parse_dataset_speaker_label(path: Path):
    """
    คาดหวังโครงสร้าง:
    data/processed/audio/<dataset>/<speaker_id>/<label_std>/<filename>.wav
    """
    # path = .../audio/dataset/speaker/label/file.wav
    parts = path.parts
    # หา index ของ "audio"
    try:
        idx = parts.index("audio")
    except ValueError:
        return None, None, None
    # dataset, speaker, label_std ตามลำดับ
    if len(parts) < idx + 4:
        return None, None, None
    dataset = parts[idx + 1]
    speaker = parts[idx + 2]
    label_std = parts[idx + 3]
    return dataset, speaker, label_std

def main():
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = []

    wavs = list(PROCESSED_AUDIO_DIR.rglob("*.wav"))
    print(f"Found {len(wavs)} audio files in processed/audio")

    for wav in wavs:
        dataset, speaker_id, label_std = parse_dataset_speaker_label(wav)
        if dataset is None:
            print(f"[WARN] skip (path format unexpected): {wav}")
            continue

        label_raw = infer_label_raw(dataset, wav.name, label_std)
        gender, age = infer_gender_age(dataset, speaker_id, wav.name)
        duration = safe_duration_sec(wav)

        rows.append({
            "filepath": str(wav).replace("\\", "/"),
            "label_raw": label_raw,
            "label_std": label_std,
            "speaker_id": speaker_id,
            "gender": gender,
            "age": age,
            "dataset": dataset,
            "duration_sec": duration
        })

    df = pd.DataFrame(rows)
    out_csv = METADATA_DIR / "master_metadata.csv"
    df.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"Saved {out_csv}  ({len(df)} rows)")

    # ทำสรุป stats ง่าย ๆ
    stats = {
        "by_dataset": df["dataset"].value_counts().to_dict(),
        "by_label": df["label_std"].value_counts().to_dict(),
        "avg_duration_sec": float(df["duration_sec"].mean()) if not df.empty else None
    }
    with open(METADATA_DIR / "stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"Saved stats.json")

    # ถ้ามี class_map.csv อยู่ จะไม่แก้; ถ้าไม่มีและอยากสร้างแบบเบื้องต้น:
    if not CLASS_MAP_PATH.exists():
        # สร้าง mapping เบื้องต้น (label_raw → label_std) จากที่พบในไฟล์จริง
        pairs = df[["dataset", "label_raw", "label_std"]].drop_duplicates()
        pairs.to_csv(CLASS_MAP_PATH, index=False, encoding="utf-8")
        print(f"ℹCreated initial {CLASS_MAP_PATH} from observed pairs (review manually).")

if __name__ == "__main__":
    main()
