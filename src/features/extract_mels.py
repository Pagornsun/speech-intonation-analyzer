# src/features/extract_mels.py
import argparse, os
from pathlib import Path
import numpy as np, pandas as pd, librosa
from tqdm import tqdm

SR = 16000

def load_list(split_dir, split):
    if split == "all":
        meta = pd.read_csv("data/processed/metadata/master_metadata.csv")
        return meta[["filepath","label_std"]].rename(columns={"filepath":"wav","label_std":"label"})
    else:
        df = pd.read_csv(Path(split_dir)/f"{split}.csv")
        df = df.rename(columns={"filepath":"wav","label_std":"label"})
        return df

def sliding_segments(y, sr, seg_sec, step_sec):
    seg = int(seg_sec*sr); step = int(step_sec*sr)
    if len(y) <= seg:
        pad = np.zeros(seg-len(y), dtype=y.dtype)
        yield 0.0, len(y)/sr, np.concatenate([y,pad])
        return
    start = 0
    while start + seg <= len(y):
        clip = y[start:start+seg]
        yield start/sr, (start+seg)/sr, clip
        start += step

def compute_logmel(y, sr, n_mels, fmin, fmax, hop, win):
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=win, hop_length=hop,
                                       win_length=win, n_mels=n_mels, fmin=fmin, fmax=fmax,
                                       power=2.0)
    logS = librosa.power_to_db(S, ref=np.max)
    return logS.astype(np.float32)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="all", choices=["train","val","test","all"])
    ap.add_argument("--segment-sec", type=float, default=3.0)
    ap.add_argument("--step-sec", type=float, default=1.5)
    ap.add_argument("--n-mels", type=int, default=64)
    ap.add_argument("--fmin", type=float, default=20.0)
    ap.add_argument("--fmax", type=float, default=8000.0)
    ap.add_argument("--hop", type=int, default=256)
    ap.add_argument("--win", type=int, default=1024)
    args = ap.parse_args()

    split_dir = Path("data/processed/splits")
    out_root  = Path("data/features/mels")
    out_root.mkdir(parents=True, exist_ok=True)

    lst = load_list(split_dir, args.split)
    rows = []
    for wav, label in tqdm(lst.values, desc=f"Mels {args.split}"):
        wav = Path(wav)
        # parse dataset/speaker from path: .../audio/<dataset>/<speaker>/<label>/file.wav
        parts = wav.parts
        idx = parts.index("audio")
        dataset, speaker = parts[idx+1], parts[idx+2]
        y, _ = librosa.load(wav.as_posix(), sr=SR, mono=True)
        for st, ed, clip in sliding_segments(y, SR, args.segment_sec, args.step_sec):
            mel = compute_logmel(clip, SR, args.n_mels, args.fmin, args.fmax, args.hop, args.win)
            subdir = out_root/args.split/dataset/speaker
            subdir.mkdir(parents=True, exist_ok=True)
            base = wav.stem + f"_s{st:.2f}_e{ed:.2f}_mel.npz"
            fpath = subdir/base
            np.savez_compressed(fpath, mel=mel)
            rows.append({
                "feature_path": fpath.as_posix().replace("\\","/"),
                "label": label, "wav": wav.as_posix().replace("\\","/"),
                "dataset": dataset, "speaker": speaker,
                "start_sec": round(st,2), "end_sec": round(ed,2),
                "n_mels": mel.shape[0], "frames": mel.shape[1]
            })

    idx_csv = out_root/f"index_{args.split}.csv"
    pd.DataFrame(rows).to_csv(idx_csv, index=False, encoding="utf-8")
    print(f" saved {idx_csv} ({len(rows)} rows)")

if __name__ == "__main__":
    main()
