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
    const backendURL = process.env.SER_BACKEND_URL;
    if (!backendURL) {
      return NextResponse.json({ error: "SER_BACKEND_URL not set" }, { status: 500 });
    }
    const form = await req.formData(); // มี audio, duration จาก Recorder/Analyze page
    const res = await fetch(backendURL, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.detail ?? "Backend error" }, { status: res.status });
    }

    // map ให้ตรงโครงสร้าง /results ของคุณ
    return NextResponse.json({
      result: {
        emotion: data?.result?.emotion,
        distribution: data?.result?.distribution,
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
