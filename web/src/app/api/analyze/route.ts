// web/src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ---------- helpers (mock + mapper) ---------- */

type Dist = Record<string, number>;
const emos = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"];

function normalize(dist: Dist): Dist {
  const s = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const out: Dist = {};
  for (const [k, v] of Object.entries(dist)) out[k] = +(v / s).toFixed(3);
  return out;
}

function makeMockResult(seed: number) {
  const base = emos.map((_, i) => ((seed * (i + 3)) % 100) + 1);
  const dist = normalize(Object.fromEntries(emos.map((e, i) => [e, base[i]])));

  let top = emos[0];
  let max = 0;
  for (const e of emos) if (dist[e] > max) { max = dist[e]; top = e; }

  return {
    dist,
    top,
    max,
    prosody: {
      pitchHz: +(100 + (seed % 120)).toFixed(1),
      energyRms: +(0.02 + ((seed % 30) / 1000)).toFixed(3),
      wpm: +(120 + ((seed % 40))).toFixed(0),
    },
  };
}

function makeMockSeries(seed: number, durationSec: number, n = 160) {
  const ptsPitch: Array<{ t: number; v: number }> = [];
  const ptsEnergy: Array<{ t: number; v: number }> = [];
  const dur = Math.max(1, durationSec || 6);
  for (let i = 0; i < n; i++) {
    const t = +( (i / (n - 1)) * dur ).toFixed(2);
    const w = 2 * Math.PI * ((seed % 5) + 1) / dur;
    const noise = ((Math.sin(i * 1.7 + seed) + Math.cos(i * 0.37 + seed)) * 0.5);
    const f0 = +(150 + 40 * Math.sin(w * t + seed * 0.01) + 10 * noise).toFixed(2);
    const e  = +(0.05 + 0.03 * (1 + Math.sin(w * 0.6 * t + seed * 0.02)) + 0.01 * Math.abs(noise)).toFixed(3);
    ptsPitch.push({ t, v: f0 });
    ptsEnergy.push({ t, v: e });
  }
  return { ptsPitch, ptsEnergy };
}

/** map อะไรที่ backend ส่งมาให้เข้ารูปแบบที่หน้า /results ใช้ */
function mapBackendToUI(data: any) {
  // รองรับชื่อฟิลด์ได้หลายแบบ
  const distribution: Dist =
    data?.distribution ??
    data?.probabilities ??
    {};

  const prosody = {
    pitchHz: data?.prosody?.pitchHz ?? data?.prosody?.f0_mean ?? 0,
    energyRms: data?.prosody?.energyRms ?? data?.prosody?.rms_mean ?? 0,
    wpm: data?.prosody?.wpm ?? data?.prosody?.speech_rate ?? 0,
  };

  const pitchSeries =
    data?.pitchSeries ??
    (Array.isArray(data?.charts?.pitch)
      ? data.charts.pitch.map((p: [number, number]) => ({ t: p[0], v: p[1] }))
      : []);

  const energySeries =
    data?.energySeries ??
    (Array.isArray(data?.charts?.energy)
      ? data.charts.energy.map((p: [number, number]) => ({ t: p[0], v: p[1] }))
      : []);

  const label =
    data?.emotion?.label ??
    data?.primaryEmotion ??
    "neutral";

  const confidence =
    data?.emotion?.confidence ??
    data?.primaryConfidence ??
    0;

  return {
    result: {
      emotion: { label, confidence },
      distribution,
      prosody,
      pitchSeries,
      energySeries,
      advice: data?.advice ?? [],
    },
    meta: data?.meta ?? {},
  };
}

/* ---------- health check ---------- */
export async function GET() {
  return NextResponse.json({ ok: true, message: "analyze ready" });
}

/* ---------- main POST ---------- */
export async function POST(req: NextRequest) {
  try {
    // Allow fallback to localhost for dev if env not provided
    const backendURL = process.env.SER_BACKEND_URL || "http://127.0.0.1:8000/predict";

    // Incoming form from client (has: audio, duration, samplingRate/fftSize, etc.)
    const form = await req.formData();

    const audio = form.get("audio");
    if (!audio) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    // Map client fields -> backend FastAPI expected names
    // FastAPI expects: audio (file), duration, sampling_rate, fft_size, hop_length
    const duration = Number(form.get("duration") || 0);
    const samplingRate = Number(form.get("sampling_rate") || form.get("samplingRate") || form.get("sampleRate") || 16000);
    const fftSize = Number(form.get("fft_size") || form.get("fftSize") || 1024);
    const hopLength = Number(form.get("hop_length") || form.get("hopLength") || 320);

    const backendForm = new FormData();
    // Preserve filename if possible when forwarding
    if (typeof File !== "undefined" && audio instanceof File) {
      backendForm.append("audio", audio, audio.name || "audio.webm");
    } else {
      // @ts-ignore - in Node, audio may be a Blob
      backendForm.append("audio", audio);
    }
    backendForm.append("duration", String(isFinite(duration) ? duration : 0));
    backendForm.append("sampling_rate", String(isFinite(samplingRate) ? samplingRate : 16000));
    backendForm.append("fft_size", String(isFinite(fftSize) ? fftSize : 1024));
    backendForm.append("hop_length", String(isFinite(hopLength) ? hopLength : 320));

    const res = await fetch(backendURL, { method: "POST", body: backendForm });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.detail ?? "Backend error" }, { status: res.status });
    }

    // map ให้ตรงโครงสร้าง /results ของคุณ
    // รวมถึงแปลงรหัสอารมณ์จากโมเดล (ANG, DIS, FEA, HAP, NEU, SAD) -> ชื่ออ่านง่าย
    const codeToLabel: Record<string, string> = {
      ANG: "angry",
      DIS: "disgust",
      FEA: "fear",
      HAP: "happy",
      NEU: "neutral",
      SAD: "sad",
    };

    const rawLabel: string | undefined = data?.result?.emotion?.label;
    const mappedLabel0 = rawLabel && codeToLabel[rawLabel] ? codeToLabel[rawLabel] : (rawLabel || "neutral");

    const rawDist = (data?.result?.distribution || {}) as Record<string, number>;
    const mappedDist0: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawDist)) {
      const nk = codeToLabel[k] || k;
      mappedDist0[nk] = v;
    }

    const defaultWeights: Record<string, number> = {
      angry: 1,
      disgust: 1,
      fear: 1,
      happy: 1,
      neutral: 1,
      sad: 1,
      surprise: 1,
    };
    let weights: Record<string, number> = { ...defaultWeights };
    const envJson = process.env.SER_CLASS_WEIGHTS;
    if (envJson) {
      try {
        const parsed = JSON.parse(envJson);
        for (const k of Object.keys(parsed)) if (k in weights && typeof parsed[k] === "number") weights[k] = parsed[k];
      } catch {}
    }
    const overrideKeys = ["ANGRY","DISGUST","FEAR","HAPPY","NEUTRAL","SAD","SURPRISE"] as const;
    for (const k of overrideKeys) {
      const val = process.env[`SER_${k}_WEIGHT` as any];
      if (val) {
        const key = k.toLowerCase();
        const num = Number(val);
        if (Number.isFinite(num)) (weights as any)[key] = num;
      }
    }

    const weightedEntries = Object.entries(mappedDist0).map(([k, v]) => [k, (v || 0) * (weights[k] ?? 1)] as const);
    const sum = weightedEntries.reduce((a, [, v]) => a + v, 0) || 1;
    const mappedDist: Record<string, number> = {};
    for (const [k, v] of weightedEntries) mappedDist[k] = +(v / sum).toFixed(6);

    // Recompute top from weighted distribution
    let mappedLabel = mappedLabel0;
    let mappedConf = 0;
    for (const [k, v] of Object.entries(mappedDist)) {
      if (v > mappedConf) { mappedConf = v; mappedLabel = k; }
    }
    return NextResponse.json({
      result: {
        emotion: { label: mappedLabel, confidence: mappedConf || data?.result?.emotion?.confidence || 0 },
        distribution: mappedDist,
        prosody: data?.result?.prosody,
        pitchSeries: data?.result?.pitchSeries ?? [],
        energySeries: data?.result?.energySeries ?? [],
        advice: data?.result?.advice ?? [],
      },
      meta: data?.meta ?? {},
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Proxy failed" }, { status: 500 });
  }
}
