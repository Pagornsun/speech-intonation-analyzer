# Data Scientist Role

ในตำแหน่ง **Data Scientist** หน้าที่หลักคือการออกแบบ pipeline สำหรับ **การจัดการข้อมูล (Data Handling)**, **Feature Engineering**, และ **การสร้างชุดข้อมูลสำหรับการ train/test โมเดล**  

--- 
## Project Structure (Data Scientist Focus)
```markdown
speech-intonation-analyzer/
├─ data/
│ ├─ raw/ # ไฟล์ต้นฉบับ (CREMA-D, RAVDESS, SAVEE, TESS)
│ ├─ interim/ # ข้อมูล preprocess (16kHz, mono, trim silence, normalize)
│ ├─ processed/
│ │ ├─ audio/ # ข้อมูลสะอาด + map label พร้อมใช้งาน
│ │ ├─ metadata/ # master_metadata.csv, class_map.csv, stats.json
│ │ └─ splits/ # train/val/test splits
│ └─ features/ # ฟีเจอร์สกัดแล้ว (Mel, MFCC, prosody)
│
├─ src/data/
│ ├─ preprocess.py # raw → interim
│ ├─ make_processed.py # interim → processed/audio + label mapping
│ ├─ build_metadata.py # รวม metadata + สถิติ
│ └─ make_splits.py # แบ่ง train/val/test (stratified + group by speaker)

