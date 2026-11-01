"use client";

import { useEffect, useState } from "react";

export type LayoutMode = "mobile" | "tablet" | "desktop" | "duo-inner";
export type DevicePosture = "continuous" | "folded" | "unknown";

export interface ViewportLayout {
  width: number;
  height: number;
  mode: LayoutMode;
  posture: DevicePosture;
  segmentCount: number;
  /** True when two horizontal viewport segments straddle a fold */
  foldedSplit: boolean;
  /** Coarse pointer + wide short viewport — typical Duo inner landscape */
  duoInnerLandscape: boolean;
}

function readPosture(): DevicePosture {
  if (typeof navigator === "undefined") return "unknown";
  const posture = (
    navigator as Navigator & {
      devicePosture?: { type?: string };
    }
  ).devicePosture;
  if (!posture?.type) return "unknown";
  if (posture.type === "folded") return "folded";
  if (posture.type === "continuous") return "continuous";
  return "unknown";
}

function readSegmentCount(): number {
  if (typeof window === "undefined") return 1;
  const viewport = (
    window as Window & {
      viewport?: { segments?: Array<unknown> };
    }
  ).viewport;
  const segments = viewport?.segments;
  return Array.isArray(segments) && segments.length > 0 ? segments.length : 1;
}

function deriveMode(
  width: number,
  height: number,
  posture: DevicePosture,
  segmentCount: number,
): Pick<
  ViewportLayout,
  "mode" | "foldedSplit" | "duoInnerLandscape"
> {
  const foldedSplit = posture === "folded" || segmentCount >= 2;
  const duoInnerLandscape =
    !foldedSplit &&
    width >= 900 &&
    width <= 1024 &&
    height <= 700 &&
    (typeof window === "undefined"
      ? false
      : window.matchMedia("(pointer: coarse)").matches);

  let mode: LayoutMode;
  if (foldedSplit || duoInnerLandscape) {
    mode = "duo-inner";
  } else if (width < 640) {
    mode = "mobile";
  } else if (width < 1024) {
    mode = "tablet";
  } else {
    mode = "desktop";
  }

  return { mode, foldedSplit, duoInnerLandscape };
}

function measure(): ViewportLayout {
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 800;
  const posture = readPosture();
  const segmentCount = readSegmentCount();
  return {
    width,
    height,
    posture,
    segmentCount,
    ...deriveMode(width, height, posture, segmentCount),
  };
}

/**
 * Live viewport posture for fluid mobile ↔ desktop transitions and
 * iPhone Duo inner-display / book-fold awareness.
 */
export function useViewportLayout(): ViewportLayout {
  const [layout, setLayout] = useState<ViewportLayout>(() => measure());

  useEffect(() => {
    let frame = 0;

    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = measure();
        setLayout(next);
        const root = document.documentElement;
        root.dataset.layout = next.mode;
        root.dataset.posture = next.posture;
        root.dataset.foldedSplit = next.foldedSplit ? "1" : "0";
        root.style.setProperty("--od-vw", `${next.width}px`);
        root.style.setProperty("--od-vh", `${next.height}px`);
      });
    };

    publish();

    window.addEventListener("resize", publish);
    window.addEventListener("orientationchange", publish);
    const visual = window.visualViewport;
    visual?.addEventListener("resize", publish);

    const posture = (
      navigator as Navigator & {
        devicePosture?: EventTarget & { type?: string };
      }
    ).devicePosture;
    posture?.addEventListener?.("change", publish);

    const mq = window.matchMedia("(pointer: coarse)");
    mq.addEventListener?.("change", publish);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      visual?.removeEventListener("resize", publish);
      posture?.removeEventListener?.("change", publish);
      mq.removeEventListener?.("change", publish);
    };
  }, []);

  return layout;
}
