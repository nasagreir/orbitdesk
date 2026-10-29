"use client";

import { MoonStar, Eclipse } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const superDark = theme === "super-dark";

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => toggleTheme()}
      title={superDark ? "Switch to dark mode" : "Switch to super dark mode"}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-[0.8rem] text-slate-100 transition hover:bg-white/10"
    >
      {superDark ? (
        <Eclipse className="size-3.5 shrink-0" />
      ) : (
        <MoonStar className="size-3.5 shrink-0" />
      )}
      <span className="hidden sm:inline">
        {superDark ? "Super dark" : "Dark"}
      </span>
    </button>
  );
}
