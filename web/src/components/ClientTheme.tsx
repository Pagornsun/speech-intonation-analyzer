"use client";
import { useEffect } from "react";

/* ใช้จัดการ Theme ของเว็บแบบ client-side */
export default function ClientTheme() {
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("sia:prefs") || "{}");
      const theme = prefs.theme || "system";
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);

      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        if (prefs.theme === "system") {
          document.documentElement.classList.toggle("dark", media.matches);
        }
      };
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    } catch {}
  }, []);

  return null; // ไม่มี UI
}
