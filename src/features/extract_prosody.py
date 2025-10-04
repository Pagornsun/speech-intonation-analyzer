# src/features/extract_prosody.py
import argparse, numpy as np, pandas as pd, librosa
from pathlib import Path
from tqdm import tqdm

SR = 16000

def load_list(split):
    if split == "all":
        meta = pd.read_csv("data/processed/metadata/master_metadata.csv")
        return meta[["filepath","label_std"]].rename(columns={"filepath":"wav","label_std":"label"})
    else:
        df = pd.read_csv(Path("data/processed/splits")/f"{split}.csv")
        return df.rename(columns={"filepath":"wav","label_std":"label"})

def segmenter(y, sr, seg, step):
    nseg, nstep = int(seg*sr), int(step*sr)
    if len(y) <= nseg:
        pad = np.zeros(nseg-len(y), dtype=y.dtype)
        yield 0.0, len(y)/sr, np.concatenate([y,pad])
        return
    i=0
    while i+nseg <= len(y):
        yield i/sr, (i+nseg)/sr, y[i:i+nseg]
        i += nstep

def summarize_pitch(y, sr, fmin=50, fmax=400, hop=256):
    f0, vflag, vprob = librosa.pyin(y, fmin=fmin, fmax=fmax, sr=sr, hop_length=hop)
    f0 = np.nan_to_num(f0, nan=0.0)
    voiced = (f0 > 0).astype(np.float32)
    stats = {
        "f0_mean": float(f0[f0>0].mean()) if np.any(f0>0) else 0.0,
        "f0_median": float(np.median(f0[f0>0])) if np.any(f0>0) else 0.0,
        "f0_std": float(f0[f0>0].std()) if np.any(f0>0) else 0.0,
        "f0_min": float(f0[f0>0].min()) if np.any(f0>0) else 0.0,
        "f0_max": float(f0[f0>0].max()) if np.any(f0>0) else 0.0,
        "voiced_ratio": float(voiced.mean())
    }
    return stats

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="all", choices=["train","val","test","all"])
    ap.add_argument("--segment-sec", type=float, default=3.0)
    ap.add_argument("--step-sec", type=float, default=1.5)
    ap.add_argument("--hop", type=int, default=256)
    args = ap.parse_args()

    out_dir = Path("data/features/prosody"); out_dir.mkdir(parents=True, exist_ok=True)
    lst = load_list(args.split)
    rows = []

    for wav, label in tqdm(lst.values, desc=f"Prosody {args.split}"):
        wav = Path(wav); parts = wav.parts; idx = parts.index("audio")
        dataset, speaker = parts[idx+1], parts[idx+2]
        y, _ = librosa.load(wav.as_posix(), sr=SR, mono=True)
        for st, ed, clip in segmenter(y, SR, args.segment_sec, args.step_sec):
            # pitch-based stats
            pst = summarize_pitch(clip, SR, hop=args.hop)
            # energy (RMS) & zero-crossing rate
            rms = librosa.feature.rms(y=clip, hop_length=args.hop)[0]
            zcr = librosa.feature.zero_crossing_rate(clip, hop_length=args.hop)[0]
            spec_cent = librosa.feature.spectral_centroid(y=clip, sr=SR, hop_length=args.hop)[0]

            rows.append({
                "wav": wav.as_posix().replace("\\","/"),
                "dataset": dataset, "speaker": speaker,
                "label": label,
                "start_sec": round(st,2), "end_sec": round(ed,2),
                "duration_sec": round(ed-st,2),
                "rms_mean": float(rms.mean()), "rms_std": float(rms.std()),
                "zcr_mean": float(zcr.mean()),
                "spec_cent_mean": float(spec_cent.mean()),
                **pst
            })

    csv_path = out_dir/f"index_{args.split}.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False, encoding="utf-8")
    print(f" saved {csv_path} ({len(rows)} rows)")

if __name__ == "__main__":
    main()
