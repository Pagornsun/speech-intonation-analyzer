"use client";

import React, { useEffect, useRef, useState } from "react";

type Prefs = { lang: "en" | "th"; autoplay: boolean };

const LS_KEY = "sia_prefs_v1";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>({ lang: "en", autoplay: false });
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs>;
        setPrefs((s) => ({ ...s, ...(p || {}) }));
      }
    } catch {
      /* ignore */
    }
    const onExternal = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as Partial<Prefs> | undefined;
        if (detail) setPrefs((s) => ({ ...s, ...detail }));
      } catch {}
    };
    window.addEventListener("sia:prefs:changed", onExternal as EventListener);
    return () => window.removeEventListener("sia:prefs:changed", onExternal as EventListener);
  }, []);

  function savePrefs() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(prefs));
      setSaved("Saved");
      setTimeout(() => setSaved(null), 1500);
      // dispatch event so other pages/components can react (optional)
      window.dispatchEvent(new CustomEvent("sia:prefs:changed", { detail: prefs }));
    } catch (e) {
      setSaved("Save failed");
      setTimeout(() => setSaved(null), 2000);
    }
  }

  function resetPrefs() {
    const def: Prefs = { lang: "en", autoplay: false };
    setPrefs(def);
    localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent("sia:prefs:changed", { detail: def }));
    setSaved("Reset");
    setTimeout(() => setSaved(null), 1200);
  }

  // Export current prefs to a JSON file
  function exportPrefs() {
    try {
      const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sia_prefs.json";
      a.click();
      URL.revokeObjectURL(url);
      setSaved("Exported");
      setTimeout(() => setSaved(null), 1200);
    } catch {
      setSaved("Export failed");
      setTimeout(() => setSaved(null), 1200);
    }
  }

  // Trigger hidden file input
  function importClick() {
    fileRef.current?.click();
  }

  // Import prefs from JSON file (basic validation)
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (obj && (obj.lang === "en" || obj.lang === "th") && typeof obj.autoplay === "boolean") {
          setPrefs({ lang: obj.lang, autoplay: obj.autoplay });
          localStorage.setItem(LS_KEY, JSON.stringify({ lang: obj.lang, autoplay: obj.autoplay }));
          window.dispatchEvent(new CustomEvent("sia:prefs:changed", { detail: obj }));
          setSaved("Imported");
        } else {
          setSaved("Invalid prefs file");
        }
      } catch {
        setSaved("Import failed");
      }
      setTimeout(() => setSaved(null), 1500);
      // clear input
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsText(f);
  }

  // Play a short test sound to preview autoplay / audio
  function playTestSound() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        setSaved("AudioContext not supported");
        setTimeout(() => setSaved(null), 1200);
        return;
      }
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.0015;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        try { ctx.close(); } catch {}
      }, 150);
    } catch {
      setSaved("Cannot play test sound");
      setTimeout(() => setSaved(null), 1200);
    }
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Settings</h1>

        <div className="neu-surface p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Language</label>
            <select
              value={prefs.lang}
              onChange={(e) => setPrefs({ ...prefs, lang: e.target.value as "en" | "th" })}
              className="bg-black text-white rounded px-3 py-2 border border-white/10"
            >
              <option value="en">English</option>
              <option value="th">ไทย</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-300">Autoplay audio on results</div>
              <div className="text-xs text-gray-400">Auto play recorded audio when opening results</div>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.autoplay}
                onChange={(e) => setPrefs({ ...prefs, autoplay: e.target.checked })}
                className="w-5 h-5"
              />
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={savePrefs} className="px-4 py-2 bg-primary rounded text-black">
              Save
            </button>
            <button onClick={resetPrefs} className="px-4 py-2 bg-white/5 rounded">
              Reset
            </button>
            <button onClick={exportPrefs} className="px-4 py-2 bg-white/5 rounded">
              Export
            </button>
            <button onClick={importClick} className="px-4 py-2 bg-white/5 rounded">
              Import
            </button>
            <button onClick={playTestSound} className="px-4 py-2 bg-white/5 rounded">
              Play test sound
            </button>
            {saved && <div className="text-sm text-gray-300 ml-2">{saved}</div>}
          </div>
          <input ref={fileRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Preferences are stored in localStorage. Other pages will receive an event "sia:prefs:changed" when saved.
        </p>
      </div>
    </main>
  );
}
