from pathlib import Path
import pandas as pd
from sklearn.model_selection import train_test_split

META_CSV = Path("data/processed/metadata/master_metadata.csv")
SPLITS_DIR = Path("data/processed/splits")
SPLITS_DIR.mkdir(parents=True, exist_ok=True)

TEST_SIZE = 0.10
VAL_SIZE  = 0.10
RANDOM_SEED = 42

def stratified_group_split(df, group_col, label_col, test_size, seed):
    """
    แบ่งโดยอาศัย 'group' (speaker_id) ไม่ให้รั่วข้ามชุด + พยายามรักษาสัดส่วน label
    วิธีง่าย ๆ: สร้างตารางระดับ speaker ที่มี label หลัก (mode) แล้ว stratify ด้วย label นั้น
    """
    # label หลักของแต่ละ speaker (mode)
    spk = (df.groupby(group_col)[label_col]
             .agg(lambda s: s.mode().iat[0] if not s.mode().empty else s.iloc[0])
             .reset_index()
             .rename(columns={label_col: "label_primary"}))

    spk_train, spk_test = train_test_split(
        spk, test_size=test_size, random_state=seed, stratify=spk["label_primary"]
    )
    tr_ids = set(spk_train[group_col])
    te_ids = set(spk_test[group_col])

    return (df[df[group_col].isin(tr_ids)].copy(),
            df[df[group_col].isin(te_ids)].copy())

def main():
    df = pd.read_csv(META_CSV)
    # กันเคส speaker_id ว่าง
    df["speaker_id"] = df["speaker_id"].fillna("unknown")

    # แบ่ง test ออกก่อน (group = speaker_id)
    trainval_df, test_df = stratified_group_split(
        df, group_col="speaker_id", label_col="label_std",
        test_size=TEST_SIZE, seed=RANDOM_SEED
    )

    # จากนั้นแบ่ง val ออกจาก trainval
    # คิดสัดส่วนของ val จาก trainval (ไม่ใช่จากทั้งหมด)
    val_ratio_from_trainval = VAL_SIZE / (1 - TEST_SIZE)

    train_df, val_df = stratified_group_split(
        trainval_df, group_col="speaker_id", label_col="label_std",
        test_size=val_ratio_from_trainval, seed=RANDOM_SEED
    )

    # บันทึกไฟล์ (อย่างน้อยมี filepath,label_std)
    train_df[["filepath","label_std"]].to_csv(SPLITS_DIR / "train.csv", index=False)
    val_df[["filepath","label_std"]].to_csv(SPLITS_DIR / "val.csv", index=False)
    test_df[["filepath","label_std"]].to_csv(SPLITS_DIR / "test.csv", index=False)

    # รายงานสั้น ๆ
    def brief(name, d):
        print(f"{name:>5}  n={len(d):>5}  speakers={d['speaker_id'].nunique():>4}  by_label={d['label_std'].value_counts().to_dict()}")

    brief("train", train_df)
    brief("val",   val_df)
    brief("test",  test_df)
    print(f"\nSaved to: {SPLITS_DIR}")

if __name__ == "__main__":
    main()
