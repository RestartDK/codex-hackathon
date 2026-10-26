import { useEffect, useRef } from "react";

type LiquidOrbModule = {
  enhanceLiquidOrbs: (
    onReady: (host: HTMLElement) => void,
    root: HTMLElement,
  ) => Promise<(() => void) | undefined>;
};

type OrbTone = "blue" | "green" | "amber" | "violet" | "red";

const ORB_IMAGES: Record<OrbTone, string> = {
  blue: "/artwork/orb-blue.webp",
  green: "/artwork/orb-green.webp",
  amber: "/artwork/loups-garous/voice-companion.png",
  violet: "/assets/figma/ttt-companion.png",
  red: "/assets/figma/intercept-companion.png",
};

export default function LiquidOrb({ green = false, tone }: { green?: boolean; tone?: OrbTone }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const orbTone = tone ?? (green ? "green" : "blue");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia("(forced-colors: active)").matches) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let moduleObjectUrl: string | undefined;

    const moduleUrl = "/landing/liquid-orb.js";
    void fetch(moduleUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Liquid orb module is unavailable.");
        return response.text();
      })
      .then((source) => {
        moduleObjectUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        return import(/* @vite-ignore */ moduleObjectUrl);
      })
      .then((module: LiquidOrbModule) => module.enhanceLiquidOrbs(() => undefined, host))
      .then((cleanup) => {
        if (moduleObjectUrl) URL.revokeObjectURL(moduleObjectUrl);
        moduleObjectUrl = undefined;
        if (cancelled) cleanup?.();
        else dispose = cleanup;
      })
      .catch(() => {
        if (moduleObjectUrl) URL.revokeObjectURL(moduleObjectUrl);
        moduleObjectUrl = undefined;
        // The existing image remains visible when WebGPU or shader loading fails.
      });

    return () => {
      cancelled = true;
      if (moduleObjectUrl) URL.revokeObjectURL(moduleObjectUrl);
      dispose?.();
    };
  }, [orbTone]);

  return (
    <span
      ref={hostRef}
      className={`companion-liquid-orb orb${orbTone === "green" ? " orb-demo" : ""}${orbTone === "amber" ? " orb-amber" : ""}${orbTone === "violet" ? " orb-violet" : ""}${orbTone === "red" ? " orb-red" : ""}`}
    >
      <img
        className="companion-orb"
        src={ORB_IMAGES[orbTone]}
        width={201}
        height={201}
        alt=""
        draggable={false}
      />
    </span>
  );
}
