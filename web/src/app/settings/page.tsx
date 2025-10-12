"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Simple preferences page for the Speech Intonation Analyzer
 * - Sampling rate / FFT size (saved to localStorage)
 * - Theme (System / Dark / Light)
 * - Auto-play after analyze
 * - Language (EN / TH)
 * - Clear storages
 */

type Theme = "system" | "dark" | "light";
type Lang = "en" | "th";

type Prefs = {
  samplingRate: number;     // Hz
  fftSize: 256 | 512 | 1024 | 2048 | 4096;
  theme: Theme;
  autoPlay: boolean;
  lang: Lang;
};

const LS_KEY = "sia:prefs";

const DEFAULT_PREFS: Prefs = {
  samplingRate: 44100,
  fftSize: 2048,
  theme: "system",
  autoPlay: true,
  lang: "en",
};

// ---- helpers ----
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const wantDark = theme === "dark" || (theme === "system" && systemDark);
  root.classList.toggle("dark", !!wantDark);
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // first mount -> load + apply
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    applyTheme(p.theme);
  }, []);

  // auto save whenever prefs changed, skip first mount
  const didMount = React.useRef(false);
  useEffect(() => {
    if (didMount.current) {
      savePrefs(prefs);
      setSavedAt(Date.now());
    } else {
      didMount.current = true;
    }
  }, [prefs]);

  // keep theme reactive when user’s system theme changes (only for "system")
  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => prefs.theme === "system" && applyTheme("system");
    m.addEventListener?.("change", handler);
    return () => m.removeEventListener?.("change", handler);
  }, [prefs.theme]);

  const onChange = <K extends keyof Prefs, V extends Prefs[K]>(key: K, val: V) =>
    setPrefs((p) => ({ ...p, [key]: val }));

  const savedText = useMemo(() => {
    if (!savedAt) return "";
    const t = new Date(savedAt);
    return `${t.toLocaleTimeString()}`;
  }, [savedAt]);

  const clearLocal = () => {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem("sia:latest");
    localStorage.removeItem("analysisResult");
    alert("Cleared localStorage keys for this app.");
  };

  const clearSession = () => {
    sessionStorage.removeItem("analysisResult");
    alert("Cleared sessionStorage.");
  };

  const resetDefaults = () => {
    setPrefs(DEFAULT_PREFS);
    applyTheme(DEFAULT_PREFS.theme);
  };

  return (
    <div className="min-h-screen bg-background-light text-gray-200 font-display">
      {/* Header */}
      <div className="px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">tune</span>
            <span className="font-semibold">Settings & Preferences</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">
              Home
            </Link>
            <Link href="/analyze" className="px-3 py-2 rounded-lg bg-primary text-white text-sm">
              Open Analyzer
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 pb-20">
        <div className="neu-surface rounded-2xl p-6 md:p-8 space-y-8">
          {/* Analysis section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Audio Analysis</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Sampling rate */}
              <div className="neu-in rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-1">Sampling rate</label>
                <select
                  className="w-full bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2"
                  value={prefs.samplingRate}
                  onChange={(e) => onChange("samplingRate", Number(e.target.value) as Prefs["samplingRate"])}
                >
                  {[16000, 22050, 32000, 44100, 48000].map((r) => (
                    <option key={r} value={r}>
                      {r.toLocaleString()} Hz
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  ใช้เป็น hint ให้ตัวบันทึกเสียง/ตัววิเคราะห์ (เบราว์เซอร์บางตัวอาจตั้งค่าเอง)
                </p>
              </div>

              {/* FFT size */}
              <div className="neu-in rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-1">FFT size</label>
                <select
                  className="w-full bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2"
                  value={prefs.fftSize}
                  onChange={(e) =>
                    onChange("fftSize", Number(e.target.value) as Prefs["fftSize"])
                  }
                >
                  {[256, 512, 1024, 2048, 4096].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  ค่ามากขึ้น → ความละเอียดความถี่สูงขึ้น แต่ใช้ CPU มากขึ้น
                </p>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Appearance & Behavior</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {/* Theme */}
              <div className="neu-in rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-1">Theme</label>
                <select
                  className="w-full bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2"
                  value={prefs.theme}
                  onChange={(e) => {
                    const t = e.target.value as Theme;
                    onChange("theme", t);
                    applyTheme(t);
                  }}
                >
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  ระบบจะสลับคลาส <code>dark</code> บน <code>&lt;html&gt;</code> ให้โดยอัตโนมัติ
                </p>
              </div>

              {/* Autoplay */}
              <div className="neu-in rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-2">Auto-play after analyze</label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.autoPlay}
                    onChange={(e) => onChange("autoPlay", e.target.checked)}
                  />
                  <span className="text-sm">เปิดเล่นเสียงอัตโนมัติในหน้า Results</span>
                </label>
              </div>

              {/* Language */}
              <div className="neu-in rounded-xl p-4">
                <label className="block text-sm text-gray-400 mb-1">Language</label>
                <select
                  className="w-full bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2"
                  value={prefs.lang}
                  onChange={(e) => onChange("lang", e.target.value as Lang)}
                >
                  <option value="en">English (EN)</option>
                  <option value="th">ภาษาไทย (TH)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  ใช้สำหรับข้อความ UI และคำแนะนำ (มีผลกับหน้าถัดไป)
                </p>
              </div>
            </div>
          </section>

          {/* Maintenance */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Storage & Maintenance</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <button
                className="neu-btn rounded-xl px-4 py-3 text-left hover:bg-white/5"
                onClick={resetDefaults}
                title="คืนค่าการตั้งค่าเป็นค่าเริ่มต้น"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent">rebase_edit</span>
                  <div>
                    <p className="font-medium">Reset to defaults</p>
                    <p className="text-xs text-gray-500">คืนค่าเป็นค่ามาตรฐานทั้งหมด</p>
                  </div>
                </div>
              </button>

              <button
                className="neu-btn rounded-xl px-4 py-3 text-left hover:bg-white/5"
                onClick={clearLocal}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-400">delete</span>
                  <div>
                    <p className="font-medium">Clear localStorage</p>
                    <p className="text-xs text-gray-500">ล้าง prefs และผลการวิเคราะห์ล่าสุด</p>
                  </div>
                </div>
              </button>

              <button
                className="neu-btn rounded-xl px-4 py-3 text-left hover:bg-white/5"
                onClick={clearSession}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-400">delete_sweep</span>
                  <div>
                    <p className="font-medium">Clear sessionStorage</p>
                    <p className="text-xs text-gray-500">ล้างข้อมูลชั่วคราวหน้า Results</p>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              Saved automatically {savedText ? `• Last saved at ${savedText}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Link href="/about" className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">
                About / Docs
              </Link>
              <Link href="/results" className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">
                Results
              </Link>
            </div>
          </div>
        </div>

        {/* Small hint how prefs are consumed */}
        <p className="mt-4 text-xs text-gray-500">
          * หน้านักพัฒนา: สามารถอ่านค่าจาก <code>localStorage.getItem("{LS_KEY}")</code> เพื่อกำหนด
          sampling rate / FFT size ให้ Recorder หรือวาดกราฟได้ตามต้องการ
        </p>
      </div>
    </div>
  );
}
