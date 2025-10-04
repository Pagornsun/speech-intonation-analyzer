# 🎙️ Speech Intonation Analyzer

โปรเจกต์นี้เป็นส่วนหนึ่งของวิชา **Pattern Recognition** โดยมีเป้าหมายในการพัฒนา Web Application สำหรับวิเคราะห์ลักษณะเสียงพูด (Speech Intonation) ของผู้ใช้ เพื่อช่วยให้ผู้ใช้เข้าใจอารมณ์ น้ำเสียง และระดับความมั่นใจของตนเอง พร้อมทั้งได้รับคำแนะนำเพื่อปรับปรุงการสื่อสารให้เหมาะสมกับบริบท

**แนวคิดหลัก**
- ผู้คนในปัจจุบันมักสื่อสารผ่านข้อความมากกว่าการพูดคุยจริง ทำให้ขาดทักษะการสื่อสารด้วยเสียง  
- ระบบจะวิเคราะห์เสียงพูดเพื่อบ่งบอกอารมณ์ (happy, sad, angry, fear, disgust, neutral, surprise) รวมถึงระดับความมั่นใจและโทนเสียง  
- ผู้ใช้จะได้รับ feedback ที่สามารถนำไปฝึกปรับปรุงการพูดได้ทันที  

**กลุ่มเป้าหมาย**
- บุคคลทั่วไปที่ต้องการพัฒนาทักษะการพูดและการสื่อสารให้ชัดเจน มั่นใจ และตรงกับบริบทมากขึ้น  

---

## 👨‍💻 Data Scientist Role

ในตำแหน่ง **Data Scientist** หน้าที่หลักคือการออกแบบ pipeline สำหรับ **การจัดการข้อมูล (Data Handling)**, **Feature Engineering**, และ **การสร้างชุดข้อมูลสำหรับการ train/test โมเดล**  

--- 
## 📂 Project Structure (Data Scientist Focus)
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

