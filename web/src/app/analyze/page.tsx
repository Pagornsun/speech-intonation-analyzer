"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Recorder, { type ReadyPayload } from "@/components/Recorder";

type Ready = ReadyPayload;

export default function AnalyzePage() {
  const [audio, setAudio] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefs, setPrefs] = useState<any>({});

  const hasAudio = !!audio;

  // ✅ โหลด Settings จาก localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sia:prefs");
      if (raw) setPrefs(JSON.parse(raw));
    } catch {
      console.warn("Failed to parse prefs");
    }
  }, []);

  const sizeText = useMemo(() => {
    const bytes = audio?.sizeBytes ?? audio?.file?.size ?? audio?.blob?.size;
    if (bytes == null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }, [audio]);

  const onReady = useCallback(
    (p: Ready) => {
      setAudio(p);
      setError(null);

      // ✅ Auto Analyze ถ้าผู้ใช้เปิดไว้
      if (prefs.autoAnalyze) {
        setTimeout(() => {
          handleSubmit(p);
        }, 1000);
      }
    },
    [prefs]
  );

  const reset = () => {
    setAudio(null);
    setError(null);
  };

  const handleSubmit = async (a?: Ready) => {
    const targetAudio = a || audio;
    if (!targetAudio) return;

    try {
      setSubmitting(true);
      const fd = new FormData();

      // ✅ เพิ่มข้อมูล Settings ไปใน FormData ด้วย
      fd.append("language", prefs.language || "en");
      fd.append("samplingRate", String(prefs.samplingRate || 44100));
      fd.append("fftSize", String(prefs.fftSize || 2048));

      // เลือก source ที่มีอยู่จริง
      if (targetAudio.file) {
        fd.append("audio", targetAudio.file);
      } else if (targetAudio.blob) {
        const name =
          targetAudio.name ||
          `record_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
        fd.append("audio", new File([targetAudio.blob], name, { type: targetAudio.mime }));
      } else {
        const res = await fetch(targetAudio.url);
        const blob = await res.blob();
        fd.append(
          "audio",
          new File(
            [blob],
            targetAudio.name ||
              `audio_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`,
            { type: targetAudio.mime }
          )
        );
      }

      fd.append("duration", String(targetAudio.durationSec ?? 0));

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyze failed");

      // ✅ เก็บผลลัพธ์ส่งต่อหน้า /results
      localStorage.setItem(
        "sia:latest",
        JSON.stringify({
          ts: Date.now(),
          audio: {
            url: targetAudio.url,
            mime: targetAudio.mime,
            dur: targetAudio.durationSec,
          },
          result: json.result,
        })
      );

      window.location.assign("/results");
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light text-gray-200 font-display">
      {/* Header */}
      <div className="px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">multitrack_audio</span>
            <span className="font-semibold">
              {prefs.language === "th" ? "ตัววิเคราะห์น้ำเสียง" : "Speech Intonation Analyzer"}
            </span>
          </div>
          <div className="flex gap-2">
            <Link
              href="/settings"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-sm"
            >
              ⚙ {prefs.language === "th" ? "ตั้งค่า" : "Settings"}
            </Link>
            <Link
              href="/results"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-sm"
            >
              {prefs.language === "th" ? "ผลลัพธ์" : "View Results"}
            </Link>
          </div>
        </div>
      </div>

      {/* Recorder */}
      <div className="mx-auto max-w-5xl px-6 pb-6">
        <div className="neu-surface rounded-2xl p-6 md:p-8">
          <Recorder onReady={onReady} />

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={reset}
              disabled={!hasAudio || submitting}
              className="px-4 h-10 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
            >
              {prefs.language === "th" ? "รีเซ็ต" : "Reset"}
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={!hasAudio || submitting}
              className="px-5 h-10 rounded-lg bg-primary text-white font-semibold shadow-lg disabled:opacity-40 hover:bg-primary/90 transition"
            >
              {submitting
                ? prefs.language === "th"
                  ? "กำลังวิเคราะห์..."
                  : "Analyzing..."
                : prefs.language === "th"
                ? "วิเคราะห์"
                : "Analyze"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg neu-in px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
