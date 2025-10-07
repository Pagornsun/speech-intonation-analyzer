"use client";

import { useCallback, useMemo, useState } from "react";
import Recorder from "@/components/Recorder";
import Link from "next/link";

type ReadyPayload = {
  blob?: Blob;
  file?: File;
  url: string;
  mime: string;
  durationSec: number;
};

export default function AnalyzePage() {
  const [audio, setAudio] = useState<ReadyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const hasAudio = !!audio?.url;

  const sizeText = useMemo(() => {
    if (!audio?.file && !audio?.blob) return "-";
    const s = (audio.file?.size ?? audio.blob?.size ?? 0) / (1024 * 1024);
    return `${s.toFixed(2)} MB`;
  }, [audio]);

  const onReady = useCallback((p: ReadyPayload) => {
    setAudio(p);
    setError(null);
  }, []);

  const reset = () => {
    setAudio(null);
    setError(null);
  };

  const submit = async () => {
    if (!audio?.url) return;
    try {
      setSubmitting(true);
      const form = new FormData();
      if (audio.file) form.append("audio", audio.file);
      else if (audio.blob) form.append("audio", audio.blob, "record.webm");
      else {
        // fetch blob from object URL
        const res = await fetch(audio.url);
        const blob = await res.blob();
        form.append("audio", blob, "audio.webm");
      }
      form.append("duration", String(audio.durationSec));

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || "Analyze failed");
      // เก็บผลลัพธ์ไว้ใน localStorage เพื่อหน้า /results อ่านต่อได้
      localStorage.setItem(
        "sia:latest",
        JSON.stringify({
          audio: { url: audio.url, mime: audio.mime, durationSec: audio.durationSec },
          result: json.result,
          ts: Date.now(),
        })
      );
      location.assign("/results");
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light text-gray-200">
      {/* Top */}
      <div className="px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">multitrack_audio</span>
            <span className="font-semibold">Speech Intonation Analyzer</span>
          </div>
          <Link
            href="/results"
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-sm"
          >
            View Results
          </Link>
        </div>
      </div>

      {/* Recorder card */}
      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="neu-surface rounded-2xl p-6 md:p-8">
          <Recorder onReady={onReady} />

          {/* Info Bar */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
            <InfoItem label="File name" value={audio?.file?.name ?? (audio?.blob ? "record.webm" : "-")} />
            <InfoItem label="MIME" value={audio?.mime ?? "-"} />
            <InfoItem label="Duration" value={audio ? `${audio.durationSec.toFixed(2)} s` : "-"} />
            <InfoItem label="Size" value={sizeText} />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Tip: ต้องเปิดผ่าน <span className="text-primary">https://</span> หรือ <span className="text-primary">http://localhost</span> เพื่อใช้ไมโครโฟน
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={reset}
                disabled={!hasAudio || isSubmitting}
                className="px-4 h-10 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 transition"
              >
                Reset
              </button>
              <button
                onClick={submit}
                disabled={!hasAudio || isSubmitting}
                className="px-5 h-10 rounded-lg bg-primary text-white font-semibold shadow-lg disabled:opacity-40 hover:bg-primary/90 transition"
              >
                {isSubmitting ? "Analyzing..." : "Analyze"}
              </button>
            </div>
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
