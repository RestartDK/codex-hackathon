import { useEffect, useRef, useState } from "react";

export type SkyScene = "night" | "day" | "victory" | "none";

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  twinkle: number;
  phase: number;
};

// Three depth layers: distant stars drift slowest and twinkle least.
const STAR_LAYERS = [
  { count: 70, speed: 0.0035, size: [0.5, 1.1], alpha: 0.55 },
  { count: 38, speed: 0.007, size: [0.9, 1.6], alpha: 0.75 },
  { count: 14, speed: 0.012, size: [1.4, 2.2], alpha: 0.95 },
] as const;
const SPARKLES = [
  { x: 0.83, y: 0.19, size: 58, phase: 0 },
  { x: 0.18, y: 0.32, size: 22, phase: 2.1 },
  { x: 0.71, y: 0.12, size: 16, phase: 4.2 },
];
const FADE_MS = 2600;

function createStars(): Star[][] {
  return STAR_LAYERS.map((layer) =>
    Array.from({ length: layer.count }, () => ({
      x: Math.random(),
      // Denser near the top of the sky, thinning towards the horizon.
      y: Math.pow(Math.random(), 1.5) * 0.78,
      radius: layer.size[0] + Math.random() * (layer.size[1] - layer.size[0]),
      alpha: layer.alpha * (0.6 + Math.random() * 0.4),
      twinkle: 0.4 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
    })),
  );
}

function drawSparkle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  strength: number,
) {
  const glow = context.createRadialGradient(x, y, 0, x, y, size * 0.45);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.85 * strength})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, size * 0.45, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = `rgba(255, 255, 255, ${0.8 * strength})`;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(x - size, y);
  context.lineTo(x + size, y);
  context.moveTo(x, y - size * 1.25);
  context.lineTo(x, y + size * 1.25);
  context.stroke();
}

/** Decorative, continuously animated village sky. It never receives focus or pointer input. */
export default function VillageSky({ scene }: { scene: SkyScene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const night = scene === "night";
  const [starsRunning, setStarsRunning] = useState(night);
  if (night && !starsRunning) setStarsRunning(true);

  // Keep the stars moving while they fade out at daybreak, then stop the loop.
  useEffect(() => {
    if (night || !starsRunning) return;
    const timer = window.setTimeout(() => setStarsRunning(false), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [night, starsRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !starsRunning) return;
    const stars = createStars();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let previous = performance.now();
    let elapsed = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (reduceMotion) draw();
    };

    function draw() {
      context!.clearRect(0, 0, width, height);
      STAR_LAYERS.forEach((_, index) => {
        for (const star of stars[index]) {
          const shimmer = reduceMotion
            ? 1
            : 0.72 + 0.28 * Math.sin(elapsed * star.twinkle + star.phase);
          context!.globalAlpha = star.alpha * shimmer;
          context!.fillStyle = "#ffffff";
          context!.beginPath();
          context!.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
          context!.fill();
        }
      });
      context!.globalAlpha = 1;
      for (const sparkle of SPARKLES) {
        const pulse = reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(elapsed * 0.45 + sparkle.phase);
        drawSparkle(
          context!,
          sparkle.x * width,
          sparkle.y * height,
          sparkle.size * (0.94 + 0.06 * pulse),
          pulse,
        );
      }
    }

    function tick(now: number) {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      elapsed += delta;
      STAR_LAYERS.forEach((layer, index) => {
        for (const star of stars[index]) {
          star.x += layer.speed * delta;
          if (star.x > 1.01) star.x -= 1.02;
        }
      });
      draw();
      frame = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [starsRunning]);

  return (
    <div className={`ww-sky is-${scene}`} aria-hidden="true">
      <div className="ww-sky-layer ww-sky-day">
        <span className="ww-sky-warmth" />
        <span className="ww-sky-sun" />
        <span className="ww-cloud is-1" />
        <span className="ww-cloud is-2" />
        <span className="ww-cloud is-3" />
        <span className="ww-cloud is-4" />
        <span className="ww-cloud is-5" />
      </div>
      <div className="ww-sky-layer ww-sky-night">
        <canvas ref={canvasRef} className="ww-stars" />
      </div>
      <div className="ww-sky-layer ww-sky-victory" />
    </div>
  );
}
