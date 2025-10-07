// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx,html}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        "background-light": "var(--color-background-light)",
        "background-dark": "var(--color-background-dark)",
      },
    },
  },
  plugins: [],
} satisfies Config;
