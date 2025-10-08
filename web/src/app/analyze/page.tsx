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
  const [recorderKey, setRecorderKey] = useState(0);

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

  // Convert arbitrary audio Blob/File to 16 kHz mono WAV File for backend compatibility
  const toWavFile = useCallback(async (input: Blob, nameHint = "audio.wav", targetSr = 16000) => {
    const arrayBuf = await input.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    // Resample to targetSr using OfflineAudioContext
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetSr), targetSr);
    const src = offline.createBufferSource();
    // Mixdown to mono if needed
    let monoBuf: AudioBuffer;
    if (decoded.numberOfChannels === 1) {
      monoBuf = decoded;
    } else {
      monoBuf = offline.createBuffer(1, decoded.length, decoded.sampleRate);
      const tmp = new Float32Array(decoded.length);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const data = decoded.getChannelData(ch);
        for (let i = 0; i < data.length; i++) tmp[i] += data[i] / decoded.numberOfChannels;
      }
      monoBuf.getChannelData(0).set(tmp);
    }
    // Use a separate OfflineAudioContext for resampling from monoBuf.sampleRate to targetSr
    const resampleCtx = new OfflineAudioContext(1, Math.ceil(monoBuf.duration * targetSr), targetSr);
    const resSrc = resampleCtx.createBufferSource();
    resSrc.buffer = monoBuf;
    resSrc.connect(resampleCtx.destination);
    resSrc.start(0);
    const rendered = await resampleCtx.startRendering();

    // Encode PCM16 WAV
    const numFrames = rendered.length;
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = targetSr * blockAlign;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
    // RIFF header
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    // fmt chunk
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, targetSr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample
    // data chunk
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    // PCM samples
    const chData = rendered.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < chData.length; i++) {
      const s = Math.max(-1, Math.min(1, chData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    const file = new File([buffer], nameHint.replace(/\.[^/.]+$/, "") + ".wav", { type: "audio/wav" });
    try { ctx.close(); } catch {}
    return file;
  }, []);

  const reset = () => {
    setAudio(null);
    setError(null);
    setRecorderKey((k) => k + 1);
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

      // เลือก source ที่มีอยู่จริง และแปลงเป็น WAV 16k mono ก่อนส่งให้ backend
      let rawBlob: Blob;
      let rawName = targetAudio.name || `audio_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
      if (targetAudio.file) {
        rawBlob = targetAudio.file;
        rawName = targetAudio.file.name || rawName;
      } else if (targetAudio.blob) {
        rawBlob = targetAudio.blob;
      } else {
        const res = await fetch(targetAudio.url);
        rawBlob = await res.blob();
      }

      let wavFile: File;
      try {
        wavFile = await toWavFile(rawBlob, rawName, 16000);
      } catch (e) {
        // หากแปลงไม่สำเร็จ ให้ fallback ส่งไฟล์เดิม
        wavFile = new File([rawBlob], rawName, { type: targetAudio.mime });
      }
      fd.append("audio", wavFile);

      fd.append("duration", String(targetAudio.durationSec ?? 0));
      fd.append("samplingRate", String(16000));

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyze failed");

      // ✅ เก็บผลลัพธ์ส่งต่อหน้า /results พร้อม URL ใหม่ของไฟล์ WAV ที่เราสร้างเอง
      const playbackUrl = URL.createObjectURL(wavFile);
      // Also store a data URL so it survives navigation (object URLs are revoked on unload)
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(fr.error);
        fr.onload = () => resolve(String(fr.result));
        fr.readAsDataURL(wavFile);
      });
      const payload = {
        ts: Date.now(),
        file: {
          url: playbackUrl,
          dataUrl,
          mime: "audio/wav",
          dur: targetAudio.durationSec,
        },
        result: json.result,
      };
      // sessionStorage (เวอร์ชันใหม่ที่หน้า /results รองรับ)
      sessionStorage.setItem("analysisResult", JSON.stringify(payload));
      // localStorage (เผื่อย้อน compat โค้ดเดิม)
      localStorage.setItem("sia:latest", JSON.stringify({ ts: payload.ts, audio: payload.file, result: payload.result }));

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
          <Recorder key={recorderKey} onReady={onReady} />

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
