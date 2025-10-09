"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============== Types ============== */
type SeriesPoint = { t: number; v: number };
type Latest = {
  ts: number;
  audio: { url: string; dataUrl?: string; mime: string; dur?: number };
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
  const { lang, autoplay } = usePrefs();
  const [data, setData] = useState<Latest | null>(null);
  const [tab, setTab] = useState<"pitch" | "energy">("pitch");
  const [audioMetaDur, setAudioMetaDur] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const downloadCanvasPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart_${fileName.replace(/[: ]/g, "_").replace(/\.wav$/, ".png")}`;
    a.click();
  };
  const onAudioMeta = () => {
    try {
      setAudioMetaDur(audioRef.current?.duration ?? null);
    } catch {}
  };

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("analysisResult");
      const l = localStorage.getItem("sia:latest");
      const raw = s || l;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.file && parsed?.result) {
          const mapped: Latest = {
            ts: parsed.ts ?? Date.now(),
            audio: { url: parsed.file.url, dataUrl: parsed.file.dataUrl, mime: parsed.file.mime, dur: parsed.file.dur },
            result: {
              emotion: parsed.result.emotion,
              distribution: parsed.result.distribution,
              prosody: {
                pitchHz:
                  parsed.result.prosody?.pitchHz ??
                  parsed.result.prosody?.pitch ??
                  parsed.result.prosody?.f0_mean ??
                  0,
                energyRms:
                  parsed.result.prosody?.energyRms ??
                  parsed.result.prosody?.energy ??
                  parsed.result.prosody?.rms_mean ??
                  0,
                wpm:
                  parsed.result.prosody?.wpm ??
                  parsed.result.prosody?.speech_rate ??
                  0,
              },
              pitchSeries:
                parsed.result.pitchSeries ?? [],
              energySeries:
                parsed.result.energySeries ?? [],
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

  const displayDur = useMemo(() => {
    const audioDur =
      typeof data?.audio?.dur === "number" && isFinite(data.audio.dur) ? data.audio.dur : null;
    const metaDur = audioMetaDur && isFinite(audioMetaDur) ? audioMetaDur : null;
    const seriesDur = pitchSeries.at(-1)?.t ?? energySeries.at(-1)?.t ?? 0;
    return audioDur ?? metaDur ?? seriesDur;
  }, [data, audioMetaDur, pitchSeries, energySeries]);

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

  /* ===== Suggestion library by emotion ===== */
  const SUGGESTION_LIBRARY: Record<string, string[]> = {
    angry: [
      "ชะลอจังหวะการพูดลงเล็กน้อยเพื่อลดความกดดัน",
      "ลดความดังและความแข็งของเสียงในประโยคสำคัญ",
      "เพิ่มคำเชื่อมที่แสดงความร่วมมือ เช่น “ลองพิจารณา…”",
    ],
    disgust: [
      "ลองใช้คำพูดเชิงบวกแทนการปฏิเสธตรงๆ",
      "ปรับโทนเสียงให้ราบเรียบขึ้นเพื่อลดอคติ",
      "แยก ‘ความเห็น’ ออกจาก ‘ข้อเท็จจริง’ ให้ชัดเจน",
    ],
    fear: [
      "หายใจเข้าลึก ๆ ก่อนเริ่มพูดเพื่อให้โทนมั่นคง",
      "เน้นคำสำคัญช้า-ชัด ในจังหวะที่แน่นอน",
      "ซ้อมด้วยสคริปต์สั้น ๆ เพื่อสร้างความมั่นใจ",
    ],
    happy: [
      "คุมระดับความดังไม่ให้สูงต่อเนื่องนานเกินไป",
      "เว้นจังหวะก่อน punchline เพื่อเพิ่มพลัง",
      "สลับสูง-ต่ำของโทนเล็กน้อยเพื่อไม่ให้ล้น",
    ],
    neutral: [
      "เพิ่มน้ำหนักคำสำคัญเล็กน้อยเพื่อหลีกเลี่ยงความเรียบ",
      "ใช้ตัวอย่างหรือคำถามปลายเปิดเพื่อดึงความสนใจ",
      "เว้นจังหวะท้ายประโยคให้ชัดเพื่อแบ่งประเด็น",
    ],
    sad: [
      "ยกโทนเสียงขึ้นเล็กน้อยในช่วงเปิดหรือปิดประโยค",
      "เพิ่ม tempo นิดหน่อยให้เกิดพลังและความหวัง",
      "ใช้คำเชิงทางออก เช่น “แนวทางคือ…”",
    ],
    surprise: [
      "อย่าเน้นเสียงสูงตลอด ใช้สูงเฉพาะช่วงไฮไลต์",
      "เว้นจังหวะสั้น ๆ ก่อนจุดหักมุม",
      "ปิดท้ายด้วยโทนมั่นคงเพื่อคืนสมดุล",
    ],
  };

  const [targetEmotion, setTargetEmotion] = useState<string | null>(null);
  const primaryEmotion = (data?.result?.emotion?.label || "neutral").toLowerCase();
  const activeEmotion = (targetEmotion || primaryEmotion) as keyof typeof SUGGESTION_LIBRARY;

  const activeAdviceList = useMemo(() => {
    if (!targetEmotion && Array.isArray(data?.result?.advice) && data!.result.advice!.length > 0)
      return data!.result.advice!;
    return SUGGESTION_LIBRARY[activeEmotion] ?? SUGGESTION_LIBRARY.neutral;
  }, [data, targetEmotion, activeEmotion]);

  /* i18n labels */
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
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">graphic_eq</span>
          <h1 className="text-2xl font-bold">{L("title")}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              hasData && navigator.clipboard.writeText(JSON.stringify(data, null, 2))
            }
            className="px-3 h-10 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50"
            disabled={!hasData}
          >
            {L("copy")}
          </button>
          <a
            href="/analyze"
            className="px-3 h-10 rounded-lg bg-primary text-white grid place-items-center"
          >
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
          {/* ---------- TOP: Primary + Distribution ---------- */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primary Emotion */}
            <div className="neu-surface p-6">
              <p className="text-sm text-gray-400 mb-2">{L("primary")}</p>
              <p className="text-lg font-semibold" style={{ color: topColor }}>
                {(data?.result?.emotion?.label ?? "neutral").toString()
              }</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: topColor }}>
                  <span className="text-black font-semibold text-sm">
                    {Math.round((data?.result?.emotion?.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-400">Confidence</div>
                  <div className="text-sm font-medium">{((data?.result?.emotion?.confidence ?? 0) * 100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((data?.result?.emotion?.confidence ?? 0) * 100)}%`,
                    backgroundColor: topColor,
                  }}
                />
              </div>
            </div>

            {/* Distribution */}
            <div className="neu-surface p-6">
              <p className="text-sm mb-3">{L("dist")}</p>
              <div className="space-y-3">
                {Object.entries(distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => {
                    const pct = Math.round((v ?? 0) * 100);
                    return (
                      <div key={k} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-sm" style={{ background: getEmoColor(k) }} />
                          <div className="text-sm">{k}</div>
                        </div>
                        <div className="flex-1 mx-4 h-2 rounded-full bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: getEmoColor(k) }} />
                        </div>
                        <div className="w-12 text-right text-sm">{pct}%</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>

          {/* ---------- MIDDLE: Prosody + Chart ---------- */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            {/* Prosody metrics */}
            <div className="neu-surface p-6">
              <p className="text-sm text-gray-400 mb-2">{L("prosody")}</p>
              <ul className="space-y-3">
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">music_note</span>
                    <div className="text-sm">{L("avgPitch")}</div>
                  </div>
                  <div className="text-sm font-medium">{Math.round(data?.result?.prosody?.pitchHz ?? 0)} Hz</div>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">bolt</span>
                    <div className="text-sm">{L("energy")}</div>
                  </div>
                  <div className="text-sm font-medium">{(data?.result?.prosody?.energyRms ?? 0).toFixed(3)} RMS</div>
                </li>
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">person</span>
                    <div className="text-sm">{L("wpm")}</div>
                  </div>
                  <div className="text-sm font-medium">{Math.round(data?.result?.prosody?.wpm ?? 0)} WPM</div>
                </li>
              </ul>

              {/* Prosody summary / analysis */}
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">ลักษณะการพูด (สรุป)</p>
                <ul className="list-disc ml-5 space-y-1">
                  {(data?.result?.prosody ? analyzeProsody(data.result.prosody) : ["ไม่พบข้อมูลสำหรับวิเคราะห์"]).map((s, i) => (
                    <li key={i} className="text-sm">{s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Chart */}
            <div className="neu-surface p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button className={`px-3 py-1 rounded ${tab === "pitch" ? "bg-primary" : "bg-white/5"}`} onClick={() => setTab("pitch")}>{L("pitch")}</button>
                  <button className={`px-3 py-1 rounded ${tab === "energy" ? "bg-primary" : "bg-white/5"}`} onClick={() => setTab("energy")}>{L("energyTab")}</button>
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-3 py-1 rounded bg-white/10" onClick={downloadCanvasPNG}>{L("export")}</button>
                </div>
              </div>
              <div className="h-52">
                <canvas ref={el => { canvasRef.current = el; }} className="w-full h-full" />
              </div>
              <div className="mt-2 text-sm text-gray-400">Duration: {fmtSec(displayDur ?? 0)}s</div>
            </div>
          </section>

          {/* ---------- BOTTOM: Playback + Suggestions ---------- */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Playback */}
            <div className="neu-surface p-6">
              <p className="text-sm text-gray-400 mb-2">{L("playback")}</p>
              <audio
                ref={audioRef}
                controls
                src={data?.audio?.dataUrl ?? data?.audio?.url ?? undefined}
                onLoadedMetadata={onAudioMeta}
                autoPlay={autoplay}
                className="w-full"
              />
              <div className="mt-3 flex items-center justify-between">
                <a className="text-sm text-primary" href={data?.audio?.dataUrl ?? data?.audio?.url} download={fileName}>Download WAV</a>
                <div className="text-sm text-gray-400">{fmtSec(displayDur ?? 0)}s</div>
              </div>
            </div>

            <div className="neu-surface p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-400">{L("suggestions")}</p>
                <select
                  className="bg-black text-white rounded px-2 py-1 text-sm border border-white/10 appearance-none"
                  value={targetEmotion ?? ""}
                  onChange={(e) => setTargetEmotion(e.target.value || null)}
                >
                  <option value="">{lang === "th" ? "จากโมเดล" : "Model advice"}</option>
                  {Object.keys(SUGGESTION_LIBRARY).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <ul className="list-disc ml-5 space-y-2">
                {activeAdviceList.map((s, i) => <li key={i} className="text-sm">{s}</li>)}
              </ul>
            </div>
          </section>
         </>
       )}
     </div>
   </main>
 );
}

// Add: simple prosody analyzer returning Thai summary lines
function analyzeProsody(p: { pitchHz?: number; energyRms?: number; wpm?: number }) {
  const lines: string[] = [];
  const pitch = Number(p.pitchHz ?? NaN);
  const energy = Number(p.energyRms ?? NaN);
  const wpm = Number(p.wpm ?? NaN);

  // Pitch
  if (!isFinite(pitch)) {
    lines.push("ไม่พบข้อมูลความถี่เสียง (pitch)");
  } else if (pitch > 400) {
    lines.push("โทนเสียงสูงมาก — อาจเป็นเสียงเด็กหรือข้อมูลการตรวจจับไม่แม่นยำ");
  } else if (pitch > 250) {
    lines.push("โทนเสียงค่อนข้างสูง");
  } else if (pitch >= 150) {
    lines.push("โทนเสียงอยู่ในช่วงปกติ");
  } else {
    lines.push("โทนเสียงค่อนข้างต่ำ");
  }

  // Energy (RMS)
  if (!isFinite(energy)) {
    lines.push("ไม่พบข้อมูลระดับพลังเสียง (energy)");
  } else if (energy < 0.02) {
    lines.push("ระดับพลังเสียงเบา — อาจต้องเพิ่มความดังหรือพลังการพูด");
  } else if (energy <= 0.06) {
    lines.push("ระดับพลังเสียงปานกลาง — ฟังชัดพอสมควร");
  } else {
    lines.push("ระดับพลังเสียงค่อนข้างดัง");
  }

  // Speech rate (WPM)
  if (!isFinite(wpm)) {
    lines.push("ไม่พบข้อมูลความเร็วการพูด");
  } else if (wpm < 100) {
    lines.push("ความเร็วการพูดค่อนข้างช้า — อาจชะลอจังหวะหรือเติมคำเชื่อมให้ลื่นไหล");
  } else if (wpm <= 140) {
    lines.push("ความเร็วการพูดอยู่ในช่วงปกติ");
  } else if (wpm <= 170) {
    lines.push("ความเร็วการพูดค่อนข้างเร็ว — ควรเว้นจังหวะจุดสำคัญ");
  } else {
    lines.push("พูดเร็วจนเกินไป — ลดความเร็วเล็กน้อยเพื่อความชัด");
  }

  // Simple combined tips
  const tips: string[] = [];
  if (isFinite(pitch) && pitch > 250 && isFinite(energy) && energy < 0.02) {
    tips.push("โทนสูงแต่พลังเสียงเบา — เพิ่มพลังและผ่อนโทนลงเล็กน้อยเพื่อความเป็นธรรมชาติ");
  }
  if (isFinite(wpm) && wpm < 100) tips.push("ลองเพิ่มจังหวะเล็กน้อยเพื่อให้ฟังมีพลังขึ้น");
  if (isFinite(energy) && energy > 0.06) tips.push("ลดระดับความดังในประโยคต่อเนื่องเพื่อไม่ให้เหนื่อยล้าหรือดังกระด้าง");

  return [...lines, ...tips];
}
