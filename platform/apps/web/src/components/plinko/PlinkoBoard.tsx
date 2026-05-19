"use client";
import { useEffect, useRef, useCallback } from "react";

export interface PlinkoResult {
  path: number[];   // 0=left, 1=right per row
  slot: number;
  multiplier: number;
}

interface Props {
  rows: number;
  riskLevel: string;
  multiplierTable: number[];
  result: PlinkoResult | null;
  animating: boolean;
  turbo: boolean;
  onAnimComplete?: () => void;
}

// Color by multiplier value
function slotColor(m: number): { bg: string; text: string; glow: string } {
  if (m >= 100)  return { bg: "#ffffff", text: "#000000", glow: "rgba(255,255,255,0.9)" };
  if (m >= 20)   return { bg: "#ffd700", text: "#000000", glow: "rgba(255,215,0,0.8)" };
  if (m >= 5)    return { bg: "#ff8c00", text: "#ffffff", glow: "rgba(255,140,0,0.7)" };
  if (m >= 2)    return { bg: "#22c55e", text: "#ffffff", glow: "rgba(34,197,94,0.6)" };
  if (m >= 1)    return { bg: "#0ea5e9", text: "#ffffff", glow: "rgba(14,165,233,0.5)" };
  if (m >= 0.5)  return { bg: "#f59e0b", text: "#ffffff", glow: "rgba(245,158,11,0.4)" };
  return          { bg: "#ef4444", text: "#ffffff", glow: "rgba(239,68,68,0.4)" };
}

export function PlinkoBoard({ rows, multiplierTable, result, animating, turbo, onAnimComplete }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const animRef    = useRef<number>(0);
  const stateRef   = useRef<{
    ballX: number; ballY: number;
    waypoints: { x: number; y: number }[];
    waypointIdx: number;
    progress: number;   // 0–1 within current segment
    trail: { x: number; y: number; age: number }[];
    settled: boolean;
    winSlot: number;
    winMultiplier: number;
    flashAlpha: number;
  }>({
    ballX: 0, ballY: 0,
    waypoints: [], waypointIdx: 0, progress: 0,
    trail: [], settled: false, winSlot: -1, winMultiplier: 0, flashAlpha: 0,
  });

  // ── Layout helpers ────────────────────────────────────────────────────────

  const getLayout = useCallback((canvas: HTMLCanvasElement) => {
    const W    = canvas.width;
    const H    = canvas.height;
    const padX = 10;
    const padTop = 30;
    const padBot = 64;
    const slotW  = (W - padX * 2) / (rows + 1);
    const rowH   = (H - padTop - padBot) / (rows + 1);
    const centerX = W / 2;
    return { W, H, padX, padTop, padBot, slotW, rowH, centerX };
  }, [rows]);

  /** Ball's X position after k bounces (sum of first k path elements) */
  const ballXAtStep = useCallback((centerX: number, slotW: number, rightCount: number, k: number) => {
    return centerX + slotW * (rightCount - k / 2);
  }, []);

  /** Compute animation waypoints from a path */
  const buildWaypoints = useCallback((canvas: HTMLCanvasElement, path: number[]) => {
    const { padTop, rowH, slotW, centerX } = getLayout(canvas);
    const wps: { x: number; y: number }[] = [];
    // Start above first peg
    wps.push({ x: centerX, y: padTop - rowH * 0.4 });
    let rights = 0;
    for (let i = 0; i < path.length; i++) {
      rights += path[i] ?? 0;
      wps.push({
        x: ballXAtStep(centerX, slotW, rights, i + 1),
        y: padTop + (i + 1) * rowH,
      });
    }
    // Final slot centre
    const finalSlot = rights;
    wps.push({
      x: 10 + slotW * (finalSlot + 0.5),
      y: padTop + (path.length + 0.5) * rowH + 12,
    });
    return wps;
  }, [getLayout, ballXAtStep]);

  // ── Drawing ───────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { W, H, padX, padTop, padBot, slotW, rowH, centerX } = getLayout(canvas);
    const s = stateRef.current;

    ctx.clearRect(0, 0, W, H);

    // ── Background ──
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0d0e15");
    bg.addColorStop(1, "#080910");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Pegs ──
    for (let row = 0; row < rows; row++) {
      const numPegs = row + 1;
      const pegY    = padTop + row * rowH + rowH / 2;
      for (let p = 0; p < numPegs; p++) {
        const pegX = centerX + slotW * (p - (numPegs - 1) / 2);
        const isNearBall = s.ballX > 0 &&
          Math.hypot(pegX - s.ballX, pegY - s.ballY) < slotW * 0.7;

        ctx.beginPath();
        ctx.arc(pegX, pegY, rows <= 8 ? 5 : rows <= 12 ? 4.5 : 4, 0, Math.PI * 2);
        if (isNearBall) {
          ctx.fillStyle = "#ffd700";
          ctx.shadowColor = "rgba(255,215,0,0.9)";
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = "#4a4a6a";
          ctx.shadowColor = "rgba(100,100,200,0.3)";
          ctx.shadowBlur = 6;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }
    }

    // ── Multiplier slots ──
    const slotTop = padTop + rows * rowH + rowH / 2;
    const slotH   = padBot - 14;
    for (let i = 0; i <= rows; i++) {
      const slotX = padX + i * slotW;
      const m     = multiplierTable[i] ?? 0;
      const col   = slotColor(m);
      const isWin = s.settled && i === s.winSlot;

      ctx.save();
      if (isWin && s.flashAlpha > 0) {
        ctx.shadowColor = col.glow;
        ctx.shadowBlur  = 24 * s.flashAlpha;
      }
      // Slot bg
      const r = 5;
      ctx.beginPath();
      ctx.roundRect(slotX + 1, slotTop + 4, slotW - 2, slotH, r);
      ctx.fillStyle = isWin ? col.bg : col.bg + "cc";
      ctx.fill();
      // Win outline
      if (isWin) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Multiplier text
      ctx.fillStyle = col.text;
      ctx.font = `bold ${slotW > 28 ? 11 : 9}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = m >= 100 ? `${m}x` : m >= 10 ? `${m}x` : `${m}x`;
      ctx.fillText(label, slotX + slotW / 2, slotTop + 4 + slotH / 2);
    }

    // ── Ball trail ──
    for (const t of s.trail) {
      const alpha  = Math.max(0, 1 - t.age / 12);
      const radius = 8 * alpha;
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
      ctx.fill();
      t.age++;
    }
    stateRef.current.trail = s.trail.filter(t => t.age < 12);

    // ── Ball ──
    if (s.ballX > 0) {
      const grad = ctx.createRadialGradient(s.ballX - 3, s.ballY - 3, 1, s.ballX, s.ballY, 10);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.5, "#d4d4d4");
      grad.addColorStop(1, "#707070");
      ctx.beginPath();
      ctx.arc(s.ballX, s.ballY, 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(255,255,255,0.8)";
      ctx.shadowBlur  = 16;
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.shadowColor = "transparent";
    }

    // ── Win flash overlay ──
    if (s.settled && s.flashAlpha > 0) {
      const winCol = slotColor(s.winMultiplier);
      ctx.fillStyle = `rgba(${hexToRgb(winCol.bg)},${s.flashAlpha * 0.12})`;
      ctx.fillRect(0, 0, W, H);
      s.flashAlpha = Math.max(0, s.flashAlpha - 0.03);
    }
  }, [getLayout, multiplierTable, rows]);

  // ── Animation loop ────────────────────────────────────────────────────────

  const animate = useCallback(() => {
    const s   = stateRef.current;
    const wps = s.waypoints;
    if (wps.length < 2) { draw(); return; }

    // Speed: normal = 0.06 progress/frame, turbo = instant
    const speed = turbo ? 1 : 0.055;

    s.progress += speed;
    if (s.progress >= 1) {
      s.progress = 0;
      s.waypointIdx++;
      if (s.waypointIdx >= wps.length - 1) {
        // Animation done
        const lastWp = wps[wps.length - 1];
        if (lastWp) { s.ballX = lastWp.x; s.ballY = lastWp.y; }
        s.settled = true;
        s.flashAlpha = 1;
        draw();
        onAnimComplete?.();
        return;
      }
    }

    const from = wps[s.waypointIdx];
    const to   = wps[s.waypointIdx + 1];
    if (!from || !to) { draw(); return; }
    const t    = easeInOut(s.progress);

    s.ballX = from.x + (to.x - from.x) * t;
    s.ballY = from.y + (to.y - from.y) * t;

    // Trail
    if (s.waypointIdx < wps.length - 2) {
      s.trail.push({ x: s.ballX, y: s.ballY, age: 0 });
      if (s.trail.length > 15) s.trail.shift();
    }

    draw();
    animRef.current = requestAnimationFrame(animate);
  }, [draw, turbo, onAnimComplete]);

  // ── Effect: start animation when result arrives ───────────────────────────

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (result && animating) {
      const wps = buildWaypoints(canvas, result.path);
      const firstWp = wps[0];
      stateRef.current = {
        ballX: firstWp?.x ?? 0, ballY: firstWp?.y ?? 0,
        waypoints: wps,
        waypointIdx: 0,
        progress: 0,
        trail: [],
        settled: false,
        winSlot: result.slot,
        winMultiplier: result.multiplier,
        flashAlpha: 0,
      };
      if (turbo) {
        // Jump straight to end
        const last = wps[wps.length - 1];
        if (last) { stateRef.current.ballX = last.x; stateRef.current.ballY = last.y; }
        stateRef.current.settled = true;
        stateRef.current.flashAlpha = 1;
        draw();
        onAnimComplete?.();
      } else {
        animRef.current = requestAnimationFrame(animate);
      }
    } else {
      // Idle — reset ball, draw static board
      stateRef.current = {
        ballX: 0, ballY: 0,
        waypoints: [], waypointIdx: 0, progress: 0,
        trail: [], settled: false, winSlot: -1, winMultiplier: 0, flashAlpha: 0,
      };
      draw();
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [result, animating, animate, draw, buildWaypoints, turbo, onAnimComplete]);

  // ── Effect: redraw when config changes (rows / multipliers) ──────────────
  useEffect(() => { draw(); }, [draw, rows, multiplierTable]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        canvas.width  = e.contentRect.width;
        canvas.height = e.contentRect.height;
        draw();
      }
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r)) return "255,255,255";
  return `${r},${g},${b}`;
}
