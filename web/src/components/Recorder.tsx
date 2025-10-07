"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  onReady?: (payload: { blob?: Blob; file?: File; url: string; mime: string; durationSec: number }) => void;
  maxFileMB?: number;
};

export default function Recorder({ onReady, maxFileMB = 10 }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [vuLevel, setVuLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [durationSec, setDurationSec] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => setElapsedMs(Date.now() - startTsRef.current), 100);
    return () => clearInterval(t);
  }, [isRecording]);

  useEffect(() => {
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const hh = String(Math.floor(total / 3600)).padStart(2, "0");
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${hh} : ${mm} : ${ss}`;
  };

  const animateVU = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buffer.length);
    setVuLevel(Math.min(1, rms * 3));
    rafRef.current = requestAnimationFrame(animateVU);
  };

  /** ✅ ใช้ getUserMedia แบบปลอดภัย + polyfill */
  const getUserMediaSafe = async (): Promise<MediaStream> => {
    if (typeof window === "undefined") throw new Error("Window is not available.");
    const isSecure = window.isSecureContext || location.hostname === "localhost";
    if (!isSecure) {
      throw new Error("Microphone requires a secure context. เปิดผ่าน https:// หรือ http://localhost เท่านั้น");
    }

    const nav: any = navigator;
    if (nav.mediaDevices?.getUserMedia) {
      return await nav.mediaDevices.getUserMedia({ audio: true });
    }

    // fallback polyfill
    const legacy =
      nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia;
    if (legacy) {
      return await new Promise<MediaStream>((resolve, reject) => {
        legacy.call(navigator, { audio: true }, resolve, reject);
      });
    }

    throw new Error("เบราว์เซอร์ไม่รองรับการใช้งานไมโครโฟน (getUserMedia).");
  };

  /** ✅ ฟังก์ชันเริ่มบันทึกเสียง */
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await getUserMediaSafe();
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      // ✅ MIME fallback
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      } else {
        mimeType = "";
        console.warn("⚠️ No supported audio mimeType found, using default browser settings");
      }

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => e.data && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];

        const ext = mimeType.includes("ogg")
          ? "ogg"
          : mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("wav")
          ? "wav"
          : "webm";

        const fileName = `record_${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: mimeType });
        const url = URL.createObjectURL(file);

        setAudioUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });

        setMime(mimeType);
        const dur = await getAudioDuration(url);
        setDurationSec(dur);
        onReady?.({ blob, file, url, mime: mimeType, durationSec: dur });
      };

      mr.start();
      setIsRecording(true);
      startTsRef.current = Date.now();
      setElapsedMs(0);
      rafRef.current = requestAnimationFrame(animateVU);
    } catch (e: any) {
      setError(e?.message || "Cannot start microphone.");
      stopAll();
    }
  }, [onReady]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setIsRecording(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    sourceRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopAll = () => {
    try {
      stopRecording();
    } catch {}
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const openFile = () => fileInputRef.current?.click();

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const mb = f.size / (1024 * 1024);
    if (mb > (maxFileMB ?? 10)) {
      setError(`File too large (> ${maxFileMB} MB).`);
      return;
    }
    const okTypes = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "audio/m4a",
    ];
    if (!okTypes.includes(f.type)) {
      setError("Unsupported audio type. Use wav/mp3/ogg/m4a/webm.");
      return;
    }
    if (isRecording) stopRecording();

    const url = URL.createObjectURL(f);
    setAudioUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
    setMime(f.type);
    const dur = await getAudioDuration(url);
    setDurationSec(dur);
    onReady?.({ file: f, url, mime: f.type, durationSec: dur });
  };

  const getAudioDuration = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const a = document.createElement("audio");
      a.src = url;
      a.addEventListener("loadedmetadata", () => resolve(a.duration || 0), { once: true });
      a.addEventListener("error", () => resolve(0), { once: true });
    });

  return (
    <div className="w-full">
      {/* Waveform/placeholder area */}
      <div className="neu-in h-56 md:h-64 flex items-center justify-center px-6">
        {audioUrl ? (
          <audio controls src={audioUrl} className="w-full" />
        ) : (
          <p className="text-center placeholder-dim text-lg md:text-xl">
            Record your voice or upload a file to begin
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-7 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="neu-btn size-14 md:size-16 flex items-center justify-center text-primary hover:text-secondary"
              aria-label="Record"
            >
              <span className="material-symbols-outlined text-4xl">mic</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="neu-btn size-14 md:size-16 flex items-center justify-center text-red-400 hover:text-red-300"
              aria-label="Stop"
            >
              <span className="material-symbols-outlined text-4xl">stop</span>
            </button>
          )}

          <button
            onClick={openFile}
            className="neu-btn size-14 md:size-16 flex items-center justify-center text-gray-300 hover:text-secondary"
            aria-label="Upload"
          >
            <span className="material-symbols-outlined text-4xl">cloud_upload</span>
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileSelected} />
        </div>

        {/* Right: VU + timer */}
        <div className="flex items-center gap-6 md:gap-8 ml-0 md:ml-6">
          <div className="w-56">
            <div className="neu-in h-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-secondary transition-[width] duration-150 ease-linear"
                style={{ width: `${Math.round(vuLevel * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-center text-sm text-gray-400">VU Meter</p>
          </div>
          <div className="flex items-center gap-2 text-3xl md:text-4xl font-bold" style={{ color: "#F59E0B" }}>
            {isRecording ? (
              <span>{formatTime(elapsedMs)}</span>
            ) : (
              <span>
                {durationSec > 0 ? formatTime(durationSec * 1000) : "00 : 00 : 00"}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}
    </div>
  );
}
