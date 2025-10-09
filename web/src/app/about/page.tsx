// src/app/about/page.tsx
import Link from "next/link";

export const metadata = {
  title: "About | Speech Intonation Analyzer",
  description: "Project documentation and overview aligned with the proposal",
};

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-3 py-1 text-sm text-gray-200 ring-1 ring-white/10">
    {children}
  </span>
);

const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) => (
  <section className="neu-surface rounded-2xl px-6 py-6 md:px-8 md:py-8">
    <div className="mb-5 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary">{icon}</span>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
    </div>
    <div className="text-gray-300 leading-relaxed">{children}</div>
  </section>
);

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background-light text-gray-200 font-display">
      {/* Header */}
      <div className="px-6 py-5">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">description</span>
            <span className="font-semibold">Project Documentation</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              Home
            </Link>
            <Link
              href="/analyze"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
            >
              Start Analyze
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 pb-20 space-y-8">
        {/* Hero / Intro */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent ring-1 ring-white/10 p-8 md:p-10">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
          <h1 className="text-3xl md:text-4xl font-extrabold text-white">
            Speech Intonation Analyzer — <span className="text-primary">About</span>
          </h1>
          <p className="mt-3 max-w-3xl text-gray-300">
            สรุปแนวคิด สถาปัตยกรรม และวิธีใช้งานของโปรเจกต์ตามเอกสาร Proposal
            โฟกัสที่การวิเคราะห์น้ำเสียงเพื่ออนุมานอารมณ์ พร้อมเมตริกด้าน Prosody
            และกราฟแสดงผลแบบอินเทอร์แอคทีฟ
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge>Next.js 15 (App Router)</Badge>
            <Badge>TypeScript</Badge>
            <Badge>TailwindCSS v4</Badge>
            <Badge>Web Audio API</Badge>
            <Badge>Chart.js (UI Spec)</Badge>
          </div>
        </div>

        {/* Objective (ตาม Proposal) */}
        <Section title="Objective (ตาม Proposal)" icon="target">
          <ul className="list-inside space-y-2">
            <li>
              🎯 วิเคราะห์ <strong>น้ำเสียง</strong> ของผู้พูดเพื่อระบุ{" "}
              <strong>อารมณ์ (Emotion Recognition)</strong> ครอบคลุม 7 คลาส:
              <em> Angry, Disgust, Fear, Happy, Neutral, Sad, Surprise</em>
            </li>
            <li>
              📈 วัด <strong>Prosody Metrics</strong> หลัก ได้แก่ Average Pitch (Hz), Energy (RMS),
              Speech Rate (WPM)
            </li>
            <li>
              🖼️ แสดงผล <strong>Pitch/Energy over time</strong> ด้วยกราฟอินเทอร์แอคทีฟ เพื่อช่วยตีความแนวโน้ม
            </li>
          </ul>
        </Section>

        {/* Tech Stack */}
        <Section title="Tech Stack" icon="deployed_code">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold text-white">Frontend</h4>
              <ul className="list-disc ml-5 space-y-1">
                <li>Next.js 15 (App Router), TypeScript</li>
                <li>TailwindCSS v4 + Custom Theme</li>
                <li>Web Audio API (MediaRecorder, AudioContext, AnalyserNode)</li>
                <li>
                  Chart.js (ระบุไว้ใน Proposal) — ปัจจุบันหน้า Results ใช้{" "}
                  <em>Canvas 2D</em> วาดกราฟแบบ custom เพื่อความเบาและคุมสไตล์ได้สูง
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-white">Backend / API</h4>
              <ul className="list-disc ml-5 space-y-1">
                <li>Route Handler <code className="text-gray-400">/api/analyze</code> (Node runtime)</li>
                <li>รับไฟล์เสียง (multipart/form-data) + duration</li>
                <li>คืนผลแบบ JSON (emotion distribution, prosody, time series)</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Dataset & Scope (ตาม Proposal) */}
        <Section title="Datasets & Scope" icon="dataset">
          <ul className="list-disc ml-5 space-y-2">
            <li>
              🗂️ <strong>Datasets (อ้างอิง Proposal):</strong> CREMA-D, RAVDESS และชุดข้อมูลที่มีป้ายกำกับอารมณ์
              เพื่อเทรน/ประเมินผลโมเดลเสียงพูด
            </li>
            <li>
              🌐 <strong>ภาษา:</strong> เริ่มจากภาษาอังกฤษก่อน และมีแผนขยายไปภาษาไทย/สำเนียงอื่นในระยะถัดไป
            </li>
            <li>
              🔎 <strong>Preprocessing (คาดการณ์ตาม Proposal):</strong> Resampling, Framing, FFT, MFCCs
              เพื่อทำให้สัญญาณอยู่ในรูปที่โมเดลเรียนรู้ได้
            </li>
          </ul>
        </Section>

        {/* Core Components */}
        <Section title="Core Components" icon="widgets">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">mic</span>
                <h4 className="font-semibold text-white">Recorder</h4>
              </div>
              <p className="text-gray-300 text-sm">
                จับเสียง/อัปโหลดไฟล์ แสดง Waveform (ผ่าน AnalyserNode) + VU Meter และตัวจับเวลา
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-accent">sync_alt</span>
                <h4 className="font-semibold text-white">Analyze</h4>
              </div>
              <p className="text-gray-300 text-sm">
                ส่งเสียงไปยัง API <code className="text-gray-400">/api/analyze</code> รับผล Emotion Distribution +
                Prosody + Time Series
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">monitoring</span>
                <h4 className="font-semibold text-white">Results</h4>
              </div>
              <p className="text-gray-300 text-sm">
                Dashboard แสดง Primary Emotion, Distribution, Prosody และกราฟ Pitch/Energy พร้อม Export PNG
              </p>
            </div>
          </div>
        </Section>

        {/* Model Plan (ตาม Proposal) */}
        <Section title="Model Plan (ตาม Proposal)" icon="neurology">
          <ul className="list-disc ml-5 space-y-2">
            <li>
              🧠 โครงร่างโมเดล: <strong>CNN + BiLSTM</strong> สำหรับลักษณะสเปกโตรแกรม/ลำดับเวลา
            </li>
            <li>
              🔬 ตัวชี้วัดที่จะรายงาน: <strong>Accuracy, Precision, Recall, F1-score</strong> และ{" "}
              Confusion Matrix
            </li>
            <li>
              ⚙️ ปัจจุบันในเดโมใช้ Mock Engine เพื่อทดสอบ UI/UX — เมื่อเชื่อมโมเดลจริงแล้ว
              API และหน้า Results พร้อมรองรับผลจริงทันที
            </li>
          </ul>
        </Section>

        {/* Infographic / Flow Diagram */}
        <Section title="System Flow (Infographic)" icon="route">
          <div className="rounded-xl bg-white/5 p-5 ring-1 ring-white/10">
            <div className="grid gap-6 md:grid-cols-3 items-center">
              <CardNode title="Recorder" icon="mic">
                บันทึกเสียง / อัปโหลดไฟล์ <br />+ Waveform + Timer
              </CardNode>

              <Arrow />

              <CardNode title="/api/analyze" icon="dns">
                รับไฟล์เสียง <br />→ ประมวลผล/จำลองผล <br />→ ส่งกลับ JSON
              </CardNode>

              <div className="md:col-span-3 flex justify-center my-2">
                <Arrow down />
              </div>

              <div className="md:col-span-3">
                <CardNode title="Results Dashboard" icon="insights">
                  Primary Emotion • Distribution • Prosody • Chart Export
                </CardNode>
              </div>
            </div>
          </div>
        </Section>

        {/* Mock AI (อธิบายความต่างระหว่างเดโมกับของจริง) */}
        <Section title="Mock AI Engine (สำหรับเดโม)" icon="science">
          <p>
            เวอร์ชันเดโมใช้ฟังก์ชัน{" "}
            <code className="text-gray-400">makeMockResult()</code>{" "}
            เพื่อจำลองค่า <em>emotion distribution</em>, <em>prosody</em> และ series (pitch/energy) ให้มีรูปทรงสมจริง
            จุดประสงค์เพื่อรีวิว UX/UI และการเชื่อมต่อข้อมูลก่อนนำโมเดลจริงมาใช้งาน
          </p>
        </Section>

        {/* Team */}
        <Section title="Team / Contributors" icon="group">
          <ul className="grid gap-3 md:grid-cols-2">
            {[
              "6520501093 นายปกรณ์สัณห์ สุเชาว์อินทร์",
              "6520503380 นายปณวัฒน์ อุ่นอุดม",
              "6520503525 นายอนันต์สิทธิ์ รุจิเจริญวงศ์",
            ].map((name) => (
              <li key={name} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person</span>
                <span className="text-gray-200">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Future Plan (ตาม Proposal + ต่อยอด) */}
        <Section title="Future Plan" icon="lightbulb">
          <ul className="list-disc ml-5 space-y-2">
            <li>
              เชื่อมต่อโมเดลจริง (เช่น <strong>TensorFlow.js</strong> หรือ Python backend ผ่าน REST/gRPC)
            </li>
            <li>จัดทำหน้า Model Metrics (Confusion Matrix, PR/F1, ROC ถ้ามี)</li>
            <li>รองรับหลายภาษา/สำเนียง และโหมดเรียลไทม์</li>
            <li>เพิ่มโหมดฝึกซ้อม (Practice Chat) ให้คำแนะนำเชิงโต้ตอบ</li>
          </ul>
        </Section>

        {/* CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <p className="text-gray-300">
            พร้อมทดลองใช้งาน? สร้างไฟล์เสียงของคุณเองหรืออัปโหลดและดูผลลัพธ์ได้ทันที
          </p>
          <div className="flex gap-2">
            <Link
              href="/analyze"
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/90 transition"
            >
              Go to Analyze
            </Link>
            <Link
              href="/results"
              className="rounded-lg bg-white/5 px-4 py-2 hover:bg-white/10 transition"
            >
              View Results
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function CardNode({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl bg-black/30 p-5 ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary">{icon}</span>
        <h4 className="font-semibold text-white">{title}</h4>
      </div>
      <p className="text-sm text-gray-300">{children}</p>
    </div>
  );
}

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <div
      className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10 ${
        down ? "rotate-90 md:rotate-180" : ""
      }`}
      aria-hidden
    >
      <span className="material-symbols-outlined text-gray-300">trending_flat</span>
    </div>
  );
}
