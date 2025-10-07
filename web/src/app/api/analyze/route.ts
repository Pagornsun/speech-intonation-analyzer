import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ---------------------------- helpers & types ---------------------------- */

type Dist = Record<string, number>;
type Pt = { t: number; v: number };

const EMOS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"] as const;

function normalize(dist: Dist): Dist {
  const s = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  const out: Dist = {};
  for (const [k, v] of Object.entries(dist)) out[k] = +(v / s).toFixed(3);
  return out;
}

function pickTop(dist: Dist) {
  let top = EMOS[0] as string;
  let max = -Infinity;
  for (const e of EMOS) {
    const val = dist[e] ?? 0;
    if (val > max) {
      max = val;
      top = e;
    }
  }
  return { top, max };
}

function seeded(seed: number) {
  // LCG เรียบง่ายพอสำหรับ mock
  let s = (seed >>> 0) || 123456789;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeMockResult(seed: number) {
  const rnd = seeded(seed);
  const raw: Dist = {};
  EMOS.forEach((e, i) => {
    raw[e] = 0.3 + (i + 1) * 0.1 + rnd() * 0.7;
  });
  const dist = normalize(raw);
  const { top, max } = pickTop(dist);

  const prosody = {
    pitchHz: +(100 + (seed % 120)).toFixed(1),
    energyRms: +(0.02 + ((seed % 30) / 1000)).toFixed(3),
    wpm: +(150 + (seed % 120)).toFixed(0),
  };

  const advice: string[] = [
    "ลองเว้นจังหวะให้ชัดขึ้นเล็กน้อย",
    "คุมระดับเสียงให้คงที่ขึ้นเพื่อความชัดเจน",
    "ปรับโทนเสียงให้หลากหลายตรงจุดสำคัญ",
  ];

  return { dist, top, max: +max.toFixed(3), prosody, advice };
}

function makeMockSeries(seed: number, durationSec: number, n = 160) {
  const rnd = seeded(seed * 13 + 7);
  const ptsPitch: Pt[] = [];
  const ptsEnergy: Pt[] = [];
  const dur = Math.max(1, durationSec || 6);

  // สร้างคลื่นให้ดูเป็นธรรมชาติเล็กน้อย
  const w = (2 * Math.PI * ((seed % 5) + 1)) / dur;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * dur;
    const noise = (Math.sin(i * 1.7 + seed) + Math.cos(i * 0.37 + seed)) * 0.5 + (rnd() - 0.5);
    const f0 = 150 + 40 * Math.sin(w * t + seed * 0.01) + 10 * noise;
    const e = 0.05 + 0.03 * (1 + Math.sin(w * 0.6 * t + seed * 0.02)) + 0.01 * Math.abs(noise);
    ptsPitch.push({ t: +t.toFixed(2), v: +f0.toFixed(2) });
    ptsEnergy.push({ t: +t.toFixed(2), v: +e.toFixed(3) });
  }
  return { ptsPitch, ptsEnergy };
}

/* --------------------------------- GET ---------------------------------- */

export async function GET() {
  // โครงสร้าง response ตัวอย่าง
  return NextResponse.json({
    ok: true,
    message: "analyze ready",
    schema: {
      ts: "number (timestamp ms)",
      audio: { url: "string (client blob or remote)", mime: "string", dur: "number?" },
      result: {
        emotion: { label: "string", confidence: "0..1" },
        distribution: { angry: "0..1", disgust: "0..1", /* ... */ },
        prosody: { pitchHz: "number", energyRms: "number", wpm: "number" },
        pitchSeries: [{ t: "sec", v: "Hz" }],
        energySeries: [{ t: "sec", v: "RMS" }],
        advice: ["string"],
      },
      meta: { originalName: "string", mime: "string", cleanMime: "string", size: "bytes", durationSec: "number" },
    },
  });
}

/* --------------------------------- POST --------------------------------- */

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio") as File | null;
    const durationStr = (form.get("duration") || "0").toString();
    const durationSec = Math.max(0, parseFloat(durationStr) || 0);

    if (!file) {
      return NextResponse.json({ error: "audio field is required" }, { status: 400 });
    }

    // ทำความสะอาด mime: ตัด ;codecs= ออก
    const rawType = file.type || "";
    const cleanType = rawType.split(";")[0].trim().toLowerCase();

    const allowed = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "audio/m4a",
    ];
    const isAllowed =
      allowed.includes(cleanType) ||
      allowed.some((t) => rawType.toLowerCase().startsWith(t)); // allow e.g. audio/webm;codecs=opus

    if (!isAllowed) {
      return NextResponse.json({ error: `unsupported type: ${rawType}` }, { status: 415 });
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 20) {
      return NextResponse.json({ error: "file too large (>20MB)" }, { status: 413 });
    }

    // สร้าง seed deterministic + ผสม crypto
    let seed = (file.size % 997) + cleanType.length + Math.floor(durationSec * 17);
    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      seed = (seed + buf[0]) >>> 0;
    } catch {
      // ignore if crypto not available
    }

    const { dist, top, max, prosody, advice } = makeMockResult(seed);
    const { ptsPitch, ptsEnergy } = makeMockSeries(seed, durationSec);

    const body = {
      ok: true,
      ts: Date.now(),
      // หมายเหตุ: url ของเสียงให้ client จัดการสร้าง objectURL เอง
      result: {
        emotion: { label: top, confidence: max },
        distribution: dist,
        prosody, // { pitchHz, energyRms, wpm }
        pitchSeries: ptsPitch, // Array<{t,v}>
        energySeries: ptsEnergy,
        advice,
      },
      meta: {
        originalName: (file as any).name || "audio",
        mime: rawType,
        cleanMime: cleanType,
        size: file.size,
        durationSec,
      },
    };

    // ตั้ง header เล็กน้อยให้ dev tools อ่านง่าย
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "internal error" }, { status: 500 });
  }
}
