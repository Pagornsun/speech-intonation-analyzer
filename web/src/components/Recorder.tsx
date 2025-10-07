"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ===== prefs helpers ===== */
type Prefs = {
  fftSize?: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  sampleRate?: number;             // ex. 44100, 48000
  lang?: "en" | "th";
};

const loadPrefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem("sia:prefs") || "{}");
  } catch {
    return {};
  }
};

/* ---------- helpers ---------- */
export type ReadyPayload = {
  blob?: Blob;
  file?: File;
  url: string;
  mime: string;
  durationSec: number;
  name?: string;
  sizeBytes?: number;
};

type Props = {
  onReady?: (p: ReadyPayload) => void;
  className?: string;
};

const fmtTime = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const two = (n: number) => n.toString().padStart(2, "0");
  return `${two(h)} : ${two(m)} : ${two(s)}`;
};

const humanSize = (bytes?: number) => {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const pickBestMime = () => {
  const cands = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const t of cands) {
    // @ts-ignore
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return "";
};

/* =========================================
   Recorder (UI + emit onReady) — WITH prefs
   ========================================= */
export default function Recorder({ onReady, className }: Props) {
  const [secureErr, setSecureErr] = useState<string | null>(null);
  const [permErr, setPermErr] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [vu, setVu] = useState(0);

  const [blob, setBlob] = useState<Blob | File | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [name, setName] = useState<string | undefined>(undefined);
  const [mime, setMime] = useState<string | undefined>(undefined);
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(undefined);
  const [durSec, setDurSec] = useState<number>(0);

  // ✅ preferences in state (reactive when user changes in another tab)
  const [prefs, setPrefs] = useState<Prefs>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  /* ---------- guards & prefs ---------- */
  useEffect(() => {
    const isSecure =
      window.isSecureContext ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost";
    setSecureErr(isSecure ? null : "Microphone requires a secure context. กรุณาเปิดผ่าน https:// หรือ http://localhost");

    // load prefs once and subscribe to storage changes
    setPrefs(loadPrefs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sia:prefs") setPrefs(loadPrefs());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      stopGraph();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl]);

  /* ---------- audio graph (VU + waveform) ---------- */
  const startGraph = async (stream: MediaStream) => {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();

    const analyser = ctx.createAnalyser();
    // ✅ ใช้ FFT size จาก settings (fallback 2048)
    analyser.fftSize = (prefs.fftSize as number) || 2048;

    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = src;

    drawVU();
    drawWave();
  };

  const stopGraph = () => {
    try { sourceRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
  };

  const drawVU = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length) / 255;
      setVu(Math.min(1, rms * 1.6));
      requestAnimationFrame(loop);
    };
    loop();
  };

  const drawWave = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d")!;
    const pad = 12;
    const buf = new Uint8Array(analyser.fftSize);

    const roundRect = (
      x: number, y: number, w: number, h: number, r: number, fillStyle: string
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    };

    const loop = () => {
      if (!canvasRef.current || !analyserRef.current) return;

      const el = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const width = el.clientWidth * dpr;
      const height = el.clientHeight * dpr;
      if (el.width !== width || el.height !== height) {
        el.width = width;
        el.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      roundRect(0, 0, width, height, 16, "rgba(0,0,0,0.28)");

      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = pad; x < width - pad; x += (width - 2 * pad) / 8) {
        ctx.moveTo(x, pad);
        ctx.lineTo(x, height - pad);
      }
      for (let y = pad; y < height - pad; y += (height - 2 * pad) / 6) {
        ctx.moveTo(pad, y);
        ctx.lineTo(width - pad, y);
      }
      ctx.stroke();

      // waveform
      analyser.getByteTimeDomainData(buf);
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) {
        const x = pad + (i / (buf.length - 1)) * (width - 2 * pad);
        const y = pad + (buf[i] / 255) * (height - 2 * pad);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#06B6D4";
      ctx.lineWidth = 2.2;
      ctx.shadowColor = "rgba(6,182,212,0.45)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      requestAnimationFrame(loop);
    };
    loop();
  };

  /* ---------- emit to parent ---------- */
  const emitReady = useCallback((payload: ReadyPayload) => {
    onReady?.(payload);
  }, [onReady]);

  /* ---------- record / stop ---------- */
  const onStart = async () => {
    if (secureErr) return;

    // ✅ ใช้ sampleRate จาก settings ถ้ามี (บางเบราว์เซอร์อาจไม่รับประกัน)
    const constraints: MediaStreamConstraints = {
      audio: prefs.sampleRate
        ? { sampleRate: prefs.sampleRate }
        : true,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPermErr(null);
    } catch {
      setPermErr(prefs.lang === "th"
        ? "ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตการใช้งาน"
        : "Cannot access microphone. Please allow permission."
      );
      return;
    }

    const mimePick = pickBestMime();
    const rec = new MediaRecorder(stream, mimePick ? { mimeType: mimePick } : undefined);

    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const url = URL.createObjectURL(b);
      if (blobUrl) URL.revokeObjectURL(blobUrl);

      setBlob(b);
      setBlobUrl(url);

      const cleanMime = (b.type || rec.mimeType || "").split(";")[0] || "audio/webm";
      const guessedName = `record_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.webm`;
      const duration = Math.max(0.1, (Date.now() - startTsRef.current) / 1000);

      setName(guessedName);
      setMime(cleanMime);
      setSizeBytes(b.size);
      setDurSec(duration);

      stream.getTracks().forEach((t) => t.stop());
      stopGraph();

      emitReady({ blob: b, url, mime: cleanMime, durationSec: duration, name: guessedName, sizeBytes: b.size });
    };

    mediaRecorderRef.current = rec;
    setIsRecording(true);
    setElapsed(0);
    startTsRef.current = Date.now();

    rec.start(100);
    startGraph(stream);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000));
    }, 250);
  };

  const onStop = () => {
    if (!isRecording) return;
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /* ---------- upload / drag-n-drop ---------- */
  const probeDuration = (url: string) =>
    new Promise<number>((resolve, reject) => {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.src = url;
      a.onloadedmetadata = () => resolve(a.duration || 0);
      a.onerror = reject;
    });

  const onPickFile = async (f: File) => {
    setBlob(f);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const url = URL.createObjectURL(f);
    setBlobUrl(url);

    const dur = await probeDuration(url).catch(() => 0);

    const cleanMime = (f.type || "").split(";")[0] || "audio/wav";
    setName(f.name);
    setMime(cleanMime);
    setSizeBytes(f.size);
    setDurSec(dur);

    emitReady({ file: f, url, mime: cleanMime, durationSec: dur, name: f.name, sizeBytes: f.size });
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
  };

  useEffect(() => {
    const host = dropRef.current;
    if (!host) return;
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e: DragEvent) => {
      prevent(e);
      const f = e.dataTransfer?.files?.[0];
      if (f) onPickFile(f);
    };
    host.addEventListener("dragenter", prevent);
    host.addEventListener("dragover", prevent);
    host.addEventListener("drop", onDrop);
    return () => {
      host.removeEventListener("dragenter", prevent);
      host.removeEventListener("dragover", prevent);
      host.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- UI ---------- */
  const vuWidth = useMemo(() => `${Math.round(vu * 100)}%`, [vu]);
  const vuColor = vu < 0.3 ? "bg-green-400" : vu < 0.6 ? "bg-yellow-400" : "bg-red-500";

  const t = (en: string, th: string) => (prefs.lang === "th" ? th : en);

  return (
    <div className={className}>
      {/* Drop / visual panel */}
      <div ref={dropRef} className="relative rounded-xl neu-in h-64 lg:h-80 flex items-center justify-center select-none">
        {isRecording && (
          <p className="absolute top-3 left-4 text-xs text-red-400 font-semibold animate-pulse">
            {t("● Recording…", "● กำลังบันทึก…")}
          </p>
        )}

        {blobUrl ? (
          <audio className="w-full max-w-xl" src={blobUrl} controls />
        ) : (
          <div className="text-center">
            <p className="placeholder-dim text-sm lg:text-base">
              {t("Record your voice or upload a file to begin", "บันทึกเสียงหรืออัปโหลดไฟล์เพื่อเริ่มต้น")}
              <br />
              {t("(Drag & Drop supported)", "(รองรับการลากวางไฟล์)")}
            </p>
            <p className="text-[11px] text-gray-500 mt-2">
              {t("Tip: Speak clearly for 5–10 seconds for best analysis quality.", "ทิป: พูดชัด ๆ 5–10 วินาที เพื่อคุณภาพการวิเคราะห์ที่ดี")}
            </p>
          </div>
        )}

        {/* waveform while recording */}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ opacity: isRecording ? 1 : 0, transition: "opacity .2s" }} />
      </div>

      {/* Controls row */}
      <div className="mt-6 flex items-center gap-4">
        <button
          className={`neu-btn h-12 w-12 rounded-xl flex items-center justify-center ${isRecording ? "bg-primary/20" : ""}`}
          onClick={isRecording ? onStop : onStart}
          title={isRecording ? t("Stop recording", "หยุดบันทึกเสียง") : t("Start recording", "เริ่มบันทึกเสียง")}
          aria-label={isRecording ? t("Stop recording", "หยุดบันทึกเสียง") : t("Start recording", "เริ่มบันทึกเสียง")}
        >
          <span className="material-symbols-outlined text-xl text-primary">
            {isRecording ? "stop" : "mic"}
          </span>
        </button>

        <label className="neu-btn h-12 w-12 rounded-xl flex items-center justify-center cursor-pointer"
               title={t("Upload audio", "อัปโหลดไฟล์เสียง")}>
          <input type="file" accept="audio/*" onChange={onFileInput} className="hidden" />
          <span className="material-symbols-outlined text-xl text-gray-300">cloud_upload</span>
        </label>

        {/* VU meter */}
        <div className="ml-4 hidden grow md:block">
          <div className="neu-in h-3 w-full rounded-full overflow-hidden">
            <div className={`h-full transition-[width] duration-75 ${vuColor}`} style={{ width: vuWidth }} />
          </div>
          <p className="mt-1 text-center text-xs text-gray-400">{t("VU Meter", "มาตรวัดความดัง (VU)")}</p>
        </div>

        {/* Timer */}
        <div className="ml-auto text-2xl md:text-3xl font-semibold text-[#fbbf24] tabular-nums">
          {fmtTime(isRecording ? elapsed : durSec || 0)}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-5 grid grid-cols-1 gap-3 text-sm text-gray-300 md:grid-cols-4">
        <div className="neu-in rounded-lg p-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">description</span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("File name", "ชื่อไฟล์")}</p>
            <p className="truncate">{name ?? "-"}</p>
          </div>
        </div>
        <div className="neu-in rounded-lg p-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">data_object</span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">MIME</p>
            <p>{mime ?? "-"}</p>
          </div>
        </div>
        <div className="neu-in rounded-lg p-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent">schedule</span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("Duration", "ความยาว")}</p>
            <p>{durSec > 0 ? `${durSec.toFixed(2)} s` : "-"}</p>
          </div>
        </div>
        <div className="neu-in rounded-lg p-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-gray-300">folder_zip</span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">{t("Size", "ขนาดไฟล์")}</p>
            <p>{humanSize(sizeBytes)}</p>
          </div>
        </div>
      </div>

      {/* Tips & errors */}
      <div className="mt-2 text-xs text-gray-400">
        {t("Tip: open via https:// or http://localhost to use microphone.",
           "ทิป: เปิดผ่าน https:// หรือ http://localhost เพื่อใช้ไมโครโฟน")}
      </div>
      {secureErr && <div className="mt-2 text-xs text-red-400">{secureErr}</div>}
      {permErr && <div className="mt-2 text-xs text-red-400">{permErr}</div>}
    </div>
  );
}
