# src/features/extract_mfcc.py
import argparse
from pathlib import Path
import numpy as np, pandas as pd, librosa
from tqdm import tqdm

SR = 16000

def load_list(split):
    if split == "all":
        meta = pd.read_csv("data/processed/metadata/master_metadata.csv")
        return meta[["filepath","label_std"]].rename(columns={"filepath":"wav","label_std":"label"})
    else:
        df = pd.read_csv(Path("data/processed/splits")/f"{split}.csv")
        return df.rename(columns={"filepath":"wav","label_std":"label"})

def segments(y, sr, seg, step):
    seg_samp, step_samp = int(seg*sr), int(step*sr)
    if len(y) <= seg_samp:
        pad = np.zeros(seg_samp-len(y), dtype=y.dtype)
        yield 0.0, len(y)/sr, np.concatenate([y,pad])
        return
    i=0
    while i+seg_samp <= len(y):
        yield i/sr, (i+seg_samp)/sr, y[i:i+seg_samp]
        i += step_samp

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="all", choices=["train","val","test","all"])
    ap.add_argument("--segment-sec", type=float, default=3.0)
    ap.add_argument("--step-sec", type=float, default=1.5)
    ap.add_argument("--n-mfcc", type=int, default=20)
    ap.add_argument("--hop", type=int, default=256)
    ap.add_argument("--win", type=int, default=1024)
    args = ap.parse_args()

    out_root = Path("data/features/mfcc"); out_root.mkdir(parents=True, exist_ok=True)
    lst = load_list(args.split)
    rows = []

    for wav, label in tqdm(lst.values, desc=f"MFCC {args.split}"):
        wav = Path(wav); parts = wav.parts; idx = parts.index("audio")
        dataset, speaker = parts[idx+1], parts[idx+2]
        y, _ = librosa.load(wav.as_posix(), sr=SR, mono=True)
        for st, ed, clip in segments(y, SR, args.segment_sec, args.step_sec):
            mfcc = librosa.feature.mfcc(y=clip, sr=SR, n_mfcc=args.n_mfcc,
                                        n_fft=args.win, hop_length=args.hop, win_length=args.win)
            # (optional) deltas
            d1 = librosa.feature.delta(mfcc); d2 = librosa.feature.delta(mfcc, order=2)
            feat = np.vstack([mfcc, d1, d2]).astype(np.float32)

            subdir = out_root/args.split/dataset/speaker; subdir.mkdir(parents=True, exist_ok=True)
            fpath = subdir/(wav.stem + f"_s{st:.2f}_e{ed:.2f}_mfcc.npz")
            np.savez_compressed(fpath, mfcc=feat)
            rows.append({
                "feature_path": fpath.as_posix().replace("\\","/"),
                "label": label, "wav": wav.as_posix().replace("\\","/"),
                "dataset": dataset, "speaker": speaker,
                "start_sec": round(st,2), "end_sec": round(ed,2),
                "n_coeff": feat.shape[0], "frames": feat.shape[1]
            })

    idx_csv = out_root/f"index_{args.split}.csv"
    pd.DataFrame(rows).to_csv(idx_csv, index=False, encoding="utf-8")
    print(f" saved {idx_csv} ({len(rows)} rows)")

if __name__ == "__main__":
    main()
