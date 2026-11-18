"use client";
import { Pause, Play } from "lucide-react";
import { useState } from "react";

/** Pause button for the looping demo in the hero frame (anything that moves longer than 5 seconds can be stopped). */
export function DemoPause() {
  const [paused, setPaused] = useState(false);
  return (
    <button
      type="button"
      className="lp-pause"
      aria-pressed={paused}
      onClick={(e) => {
        const next = !paused;
        setPaused(next);
        (e.currentTarget.closest("[data-demo]") as HTMLElement | null)?.setAttribute("data-paused", String(next));
      }}
    >
      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      {paused ? "Play demo" : "Pause demo"}
    </button>
  );
}
