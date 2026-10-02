import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-0)",
        surface: "var(--bg-1)",
        panel: "var(--bg-2)",
        panelHover: "var(--bg-3)",
        border: "var(--line-1)",
        borderStrong: "var(--line-2)",
        foreground: "var(--text-1)",
        muted: "var(--text-2)",
        subtle: "var(--text-3)",
        disabled: "var(--text-4)",
        reverse: "var(--white-soft)"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Noto Sans SC", "sans-serif"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        badge: "var(--radius-badge)",
      },
      spacing: {
        "control-sm": "var(--control-height-sm)",
        control: "var(--control-height)",
        "control-lg": "var(--control-height-lg)",
      },
      maxWidth: {
        content: "1440px",
        auth: "var(--auth-width)",
      },
    },
  },
  plugins: [],
};

export default config;
