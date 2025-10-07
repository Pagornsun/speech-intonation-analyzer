"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============== Types ============== */
type SeriesPoint = { t: number; v: number };
type Latest = {
  ts: number;
  audio: { url: string; mime: string; dur?: number };
  result: {
    emotion: { label: string; confidence: number };
    distribution: Record<string, number>;
    prosody: { pitchHz: number; energyRms: number; wpm: number };
    pitchSeries?: SeriesPoint[];
    energySeries?: SeriesPoint[];
    advice?: string[];
  };
};

/* ============== Preferences (Settings) ============== */
/** อ่าน settings ถ้ามี แต่ default = EN เพื่อให้ตรงกับหน้าตาเดิม */
function usePrefs() {
  const [prefs, setPrefs] = useState<{ lang?: "en" | "th"; autoplay?: boolean } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sia:preferences");
      if (raw) setPrefs(JSON.parse(raw));
    } catch {}
  }, []);
  return {
    lang: (prefs?.lang ?? "en") as "en" | "th",
    autoplay: !!prefs?.autoplay,
  };
}

/* ============== Emotion Colors ============== */
const EMO_COLORS: Record<string, string> = {
  angry: "#f59e0b",
  happy: "#fde047",
  sad: "#60a5fa",
  fear: "#a78bfa",
  disgust: "#34d399",
  neutral: "#94a3b8",
  surprise: "#f472b6",
};
const getEmoColor = (emo?: string, fallback = "#4F46E5") =>
  EMO_COLORS[(emo || "").toLowerCase()] ?? fallback;

/* ============== Utils / Chart ============== */
const fmtSec = (s: number) => (Number.isFinite(s) ? s.toFixed(2) : "0.00");

function drawLineChart(
  canvas: HTMLCanvasElement,
  points: SeriesPoint[],
  opts?: {
    color?: string;
    gridColor?: string;
    bg?: string;
    unitY?: string;
    xFmt?: (x: number) => string;
    yFmt?: (y: number) => string;
    xTicks?: number;
    yTicks?: number;
  }
) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 240;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { l: 56, r: 16, t: 22, b: 32 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = opts?.bg ?? "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, cssW, cssH);

  if (!points || points.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px sans-serif";
    ctx.fillText("No data points", pad.l, pad.t + 14);
    return;
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.t < minX) minX = p.t;
    if (p.t > maxX) maxX = p.t;
    if (p.v < minY) minY = p.v;
    if (p.v > maxY) maxY = p.v;
  }
  if (minX === maxX) maxX = minX + 1e-6;
  if (minY === maxY) maxY = minY + 1e-6;

  const xDiv = Math.max(2, opts?.xTicks ?? 8);
  const yDiv = Math.max(2, opts?.yTicks ?? 5);
  const niceStep = (range: number) => {
    const exp = Math.floor(Math.log10(range));
    const f = range / Math.pow(10, exp);
    let nf = 1;
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
    return nf * Math.pow(10, exp);
  };
  const makeTicks = (min: number, max: number, div: number) => {
    const raw = (max - min) / div;
    const step = niceStep(raw);
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= end + step * 0.5; v += step) ticks.push(+v.toFixed(10));
    return { ticks, start, end };
  };
  const xTicks = makeTicks(minX, maxX, xDiv);
  const yTicks = makeTicks(minY, maxY, yDiv);

  const xToPx = (x: number) => pad.l + ((x - xTicks.start) / (xTicks.end - xTicks.start)) * w;
  const yToPx = (y: number) => pad.t + (1 - (y - yTicks.start) / (yTicks.end - yTicks.start)) * h;

  ctx.strokeStyle = opts?.gridColor ?? "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const tx of xTicks.ticks) {
    const gx = xToPx(tx);
    ctx.moveTo(gx, pad.t);
    ctx.lineTo(gx, pad.t + h);
  }
  for (const ty of yTicks.ticks) {
    const gy = yToPx(ty);
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(pad.l + w, gy);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + h);
  ctx.lineTo(pad.l + w, pad.t + h);
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + h);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "12px sans-serif";

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xFmt = opts?.xFmt ?? ((x: number) => x.toFixed(1) + "s");
  for (const tx of xTicks.ticks) ctx.fillText(xFmt(tx), xToPx(tx), pad.t + h + 6);

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yFmt = opts?.yFmt ?? ((y: number) => y.toFixed(0));
  for (const ty of yTicks.ticks) ctx.fillText(yFmt(ty), pad.l - 8, yToPx(ty));

  if (opts?.unitY) {
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(opts.unitY, pad.l + w, pad.t + 4);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = opts?.color ?? "#22d3ee";
  ctx.beginPath();
  ctx.moveTo(xToPx(points[0].t), yToPx(points[0].v));
  for (let i = 1; i < points.length; i++) ctx.lineTo(xToPx(points[i].t), yToPx(points[i].v));
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const stepDot = Math.max(1, Math.floor(points.length / 40));
  for (let i = 0; i < points.length; i += stepDot) {
    ctx.beginPath();
    ctx.arc(xToPx(points[i].t), yToPx(points[i].v), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ============== Component ============== */
export default function ResultsPage() {
  const { lang, autoplay } = usePrefs(); // default EN
  const [data, setData] = useState<Latest | null>(null);
  const [tab, setTab] = useState<"pitch" | "energy">("pitch");
  const [audioMetaDur, setAudioMetaDur] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    try {
      // รองรับทั้ง sessionStorage (เวอร์ชันใหม่ Analyze) และ localStorage (เวอร์ชันเก่า)
      const s = sessionStorage.getItem("analysisResult");
      const l = localStorage.getItem("sia:latest");
      const raw = s || l;
      if (raw) {
        const parsed = JSON.parse(raw);
        // map ให้อยู่รูปเดียวกัน
        if (parsed?.file && parsed?.result) {
          const mapped: Latest = {
            ts: parsed.ts ?? Date.now(),
            audio: { url: parsed.file.url, mime: parsed.file.mime, dur: parsed.file.dur },
            result: {
              emotion: parsed.result.emotion,
              distribution: parsed.result.distribution,
              prosody: {
                pitchHz: parsed.result.prosody?.pitch ?? parsed.result.prosody?.f0_mean ?? 0,
                energyRms: parsed.result.prosody?.energy ?? parsed.result.prosody?.rms_mean ?? 0,
                wpm: parsed.result.prosody?.wpm ?? parsed.result.prosody?.speech_rate ?? 0,
              },
              pitchSeries:
                parsed.result.charts?.pitch?.map((p: [number, number]) => ({ t: p[0], v: p[1] })) ??
                parsed.result.pitchSeries ??
                [],
              energySeries:
                parsed.result.charts?.energy?.map((p: [number, number]) => ({ t: p[0], v: p[1] })) ??
                parsed.result.energySeries ??
                [],
              advice: parsed.result.advice ?? [],
            },
          };
          setData(mapped);
        } else {
          setData(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to parse stored result:", e);
    }
  }, []);

  const distribution = useMemo(() => data?.result?.distribution ?? {}, [data]);
  const pitchSeries = useMemo(() => data?.result?.pitchSeries ?? [], [data]);
  const energySeries = useMemo(() => data?.result?.energySeries ?? [], [data]);

  const fileName = useMemo(
    () => (data ? `result_${new Date(data.ts).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.wav` : "audio.wav"),
    [data]
  );

  const adviceList = useMemo(() => {
    const fallbackEN = [
      "Slow down slightly to improve clarity.",
      "Stabilize your energy for consistent delivery.",
      "Vary your tone to emphasize key points.",
    ];
    const fallbackTH = ["ลองชะลอจังหวะให้ชัดขึ้นเล็กน้อย", "คุมระดับเสียงให้คงที่ขึ้นเพื่อความชัดเจน", "ปรับโทนเสียงให้หลากหลายตรงจุดสำคัญ"];
    return (data?.result?.advice && data.result.advice.length > 0)
      ? data.result.advice
      : (lang === "th" ? fallbackTH : fallbackEN);
  }, [data, lang]);

  const displayDur = useMemo(() => {
    const audioDur =
      typeof data?.audio?.dur === "number" && isFinite(data.audio.dur) ? data.audio.dur : null;
    const metaDur = audioMetaDur && isFinite(audioMetaDur) ? audioMetaDur : null;
    const seriesDur = pitchSeries.at(-1)?.t ?? energySeries.at(-1)?.t ?? 0;
    return audioDur ?? metaDur ?? seriesDur;
  }, [data, audioMetaDur, pitchSeries, energySeries]);

  // draw chart like the old one (EN look & feel)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const points = tab === "pitch" ? pitchSeries : energySeries;
    const common = {
      gridColor: "rgba(255,255,255,0.08)",
      bg: "rgba(255,255,255,0.03)",
      xFmt: (x: number) => x.toFixed(1) + "s",
      xTicks: 8,
      yTicks: 5,
    } as const;

    const paint = () =>
      drawLineChart(canvas, points, {
        ...common,
        color: tab === "pitch" ? "#22d3ee" : "#f59e0b",
        unitY: tab === "pitch" ? "Hz" : "RMS",
        yFmt: (y: number) => (tab === "pitch" ? y.toFixed(0) : y.toFixed(3)),
      });

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    window.addEventListener("resize", paint);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [tab, pitchSeries, energySeries]);

  const hasData = !!data;
  const topColor = getEmoColor(data?.result?.emotion?.label);

  /* i18n labels (default EN to match old screenshot) */
  const L = (k: string) => {
    const en: Record<string, string> = {
      title: "Analysis Results",
      primary: "Primary Emotion",
      dist: "Emotion Distribution",
      prosody: "Prosody Metrics",
      avgPitch: "Average Pitch",
      energy: "Energy Level",
      wpm: "Speech Rate",
      pitch: "Pitch",
      energyTab: "Energy",
      export: "Export PNG",
      playback: "Playback",
      suggestions: "Improvement Suggestions",
      copy: "Copy JSON",
      new: "New Analysis",
      empty: `No result yet. Go to /analyze to start.`,
    };
    const th: Record<string, string> = {
      title: "ผลการวิเคราะห์",
      primary: "อารมณ์หลัก",
      dist: "การกระจายอารมณ์",
      prosody: "ตัวชี้วัดวัจนปฏิภาค",
      avgPitch: "Average Pitch",
      energy: "Energy Level",
      wpm: "Speech Rate",
      pitch: "Pitch",
      energyTab: "Energy",
      export: "Export PNG",
      playback: "เล่นเสียง",
      suggestions: "คำแนะนำในการปรับปรุง",
      copy: "Copy JSON",
      new: "New Analysis",
      empty: "ยังไม่มีผลการวิเคราะห์ ไปที่ /analyze เพื่อเริ่มต้น",
    };
    return (lang === "th" ? th : en)[k] ?? k;
  };

  return (
    <main className="min-h-screen px-6 py-8 text-gray-200 bg-background-dark">
      <div className="max-w-7xl mx-auto">
        {/* Header (old layout) */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">graphic_eq</span>
            <h1 className="text-2xl font-bold">{L("title")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => hasData && navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
              className="px-3 h-10 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50"
              disabled={!hasData}
            >
              {L("copy")}
            </button>
            <a href="/analyze" className="px-3 h-10 rounded-lg bg-primary text-white grid place-items-center">
              {L("new")}
            </a>
          </div>
        </header>

        {!hasData ? (
          <div className="min-h-[50vh] grid place-items-center">
            <p className="text-gray-400">{L("empty")}</p>
          </div>
        ) : (
          <>
            {/* Top: Primary + Distribution */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Primary card */}
              <div className="neu-surface p-6">
                <p className="text-sm text-gray-400 mb-2">{fileName}</p>
                <p className="text-sm">{L("primary")}</p>

                <div className="mt-1 flex items-center justify-between">
                  <h3 className="text-xl font-semibold capitalize" style={{ color: topColor }}>
                    {data.result.emotion.label}
                  </h3>
                  <span className="font-bold" style={{ color: topColor }}>
                    {Math.round((data.result.emotion.confidence ?? 0) * 100)}%
                  </span>
                </div>

                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((data.result.emotion.confidence ?? 0) * 100)}%`,
                      backgroundColor: topColor,
                    }}
                  />
                </div>
              </div>

              {/* Distribution card */}
              <div className="neu-surface p-6">
                <p className="text-sm mb-3">{L("dist")}</p>
                <div className="space-y-3">
                  {Object.keys(distribution).map((emo) => {
                    const v = Math.round((distribution[emo] ?? 0) * 100);
                    const color = getEmoColor(emo);
                    return (
                      <div key={emo}>
                        <div className="flex justify-between text-sm">
                          <span className="capitalize flex items-center gap-2">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            {emo}
                          </span>
                          <span className="text-gray-400">{v}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/8">
                          <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Middle: Prosody + Chart */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              {/* Prosody metrics */}
              <div className="neu-surface p-6">
                <p className="text-sm text-gray-400 mb-2">{L("prosody")}</p>
                <ul className="space-y-3">
                  <li className="flex justify-between">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-lg">music_note</span>
                      {L("avgPitch")}
                    </span>
                    <span>{data.result.prosody.pitchHz} Hz</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-lg">bolt</span>
                      {L("energy")}
                    </span>
                    <span>{data.result.prosody.energyRms} RMS</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-lg">person</span>
                      {L("wpm")}
                    </span>
                    <span>{data.result.prosody.wpm} WPM</span>
                  </li>
                </ul>
              </div>

              {/* Chart (2 cols) */}
              <div className="neu-surface p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTab("pitch")}
                      className={`px-3 h-9 rounded-lg ${tab === "pitch" ? "bg-white/15 text-white" : "bg-white/5 text-gray-300"}`}
                    >
                      {L("pitch")}
                    </button>
                    <button
                      onClick={() => setTab("energy")}
                      className={`px-3 h-9 rounded-lg ${tab === "energy" ? "bg-white/15 text-white" : "bg-white/5 text-gray-300"}`}
                    >
                      {L("energyTab")}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const c = canvasRef.current;
                      if (!c) return;
                      const link = document.createElement("a");
                      link.download = `${tab}-chart.png`;
                      link.href = c.toDataURL("image/png");
                      link.click();
                    }}
                    className="px-3 h-9 rounded-lg bg-white/10 hover:bg-white/15"
                  >
                    {L("export")}
                  </button>
                </div>

                <div className="rounded-xl bg-white/5 p-4">
                  <canvas ref={canvasRef} style={{ width: "100%", height: 220 }} />
                  <p className="text-xs text-gray-400 mt-2">
                    {tab === "pitch"
                      ? `${pitchSeries.length} pitch points`
                      : `${energySeries.length} energy points`}
                  </p>
                </div>
              </div>
            </section>

            {/* Bottom: Playback + Suggestions */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="neu-surface p-6">
                <p className="text-sm text-gray-400 mb-2">{L("playback")}</p>
                <audio
                  controls
                  className="w-full"
                  autoPlay={autoplay}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d)) setAudioMetaDur(d);
                  }}
                >
                  <source src={data.audio.url} type={data.audio.mime} />
                </audio>
                <p className="text-xs text-gray-500 mt-1">
                  {(data.audio.mime || "audio").toLowerCase()} • {fmtSec(displayDur)} sec
                </p>
              </div>

              <div className="neu-surface p-6">
                <p className="text-sm text-gray-400 mb-2">{L("suggestions")}</p>
                <ul className="space-y-2">
                  {adviceList.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="material-symbols-outlined text-secondary text-base mt-0.5">check_small</span>
                      <span className="text-gray-300">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
