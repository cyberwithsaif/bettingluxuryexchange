"use client";
import { useEffect, useRef, useCallback } from "react";

export interface PlinkoResult {
  path: number[];
  slot: number;
  multiplier: number;
}

export interface QueueItem {
  id: number;
  path: number[];
  slot: number;
  multiplier: number;
}

interface BallState {
  id: number;
  ballX: number; ballY: number;
  waypoints: { x: number; y: number }[];
  waypointIdx: number;
  progress: number;
  trail: { x: number; y: number; age: number }[];
  settled: boolean;
  winSlot: number;
  winMultiplier: number;
  flashAlpha: number;
  calledDone: boolean;
}

interface Props {
  rows: number;
  riskLevel: string;
  multiplierTable: number[];
  turbo: boolean;
  queue: QueueItem[];
  onBallDone: (id: number) => void;
  onBounce?: () => void;
  onLand?: (multiplier: number) => void;
}

function slotColor(m: number): { bg: string; text: string; glow: string } {
  if (m >= 100) return { bg: "#ffffff", text: "#000000", glow: "rgba(255,255,255,0.9)" };
  if (m >= 20)  return { bg: "#ffd700", text: "#000000", glow: "rgba(255,215,0,0.8)" };
  if (m >= 5)   return { bg: "#ff8c00", text: "#ffffff", glow: "rgba(255,140,0,0.7)" };
  if (m >= 2)   return { bg: "#22c55e", text: "#ffffff", glow: "rgba(34,197,94,0.6)" };
  if (m >= 1)   return { bg: "#0ea5e9", text: "#ffffff", glow: "rgba(14,165,233,0.5)" };
  if (m >= 0.5) return { bg: "#f59e0b", text: "#ffffff", glow: "rgba(245,158,11,0.4)" };
  return         { bg: "#ef4444", text: "#ffffff", glow: "rgba(239,68,68,0.4)" };
}

export function PlinkoBoard({ rows, multiplierTable, turbo, queue, onBallDone, onBounce, onLand }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animRef        = useRef<number>(0);
  const activeBalls    = useRef<BallState[]>([]);
  const processedIds   = useRef<Set<number>>(new Set());
  const isLooping      = useRef(false);
  const turboRef       = useRef(turbo);
  const onBallDoneRef  = useRef(onBallDone);
  const onBounceRef    = useRef(onBounce);
  const onLandRef      = useRef(onLand);

  useEffect(() => { turboRef.current = turbo; },          [turbo]);
  useEffect(() => { onBallDoneRef.current = onBallDone; }, [onBallDone]);
  useEffect(() => { onBounceRef.current = onBounce; },    [onBounce]);
  useEffect(() => { onLandRef.current = onLand; },        [onLand]);

  const getLayout = useCallback((canvas: HTMLCanvasElement) => {
    const W = canvas.width, H = canvas.height;
    const padX = 10, padTop = 28, padBot = 60;
    const slotW = (W - padX * 2) / (rows + 1);
    const rowH  = (H - padTop - padBot) / (rows + 1);
    return { W, H, padX, padTop, padBot, slotW, rowH, centerX: W / 2 };
  }, [rows]);

  const buildWaypoints = useCallback((canvas: HTMLCanvasElement, path: number[]) => {
    const { padTop, rowH, slotW, centerX } = getLayout(canvas);
    const wps: { x: number; y: number }[] = [];
    wps.push({ x: centerX, y: padTop - rowH * 0.4 });
    let rights = 0;
    for (let i = 0; i < path.length; i++) {
      rights += path[i] ?? 0;
      wps.push({
        x: centerX + slotW * (rights - (i + 1) / 2),
        y: padTop + (i + 1) * rowH,
      });
    }
    wps.push({
      x: 10 + slotW * (rights + 0.5),
      y: padTop + (path.length + 0.5) * rowH + 10,
    });
    return wps;
  }, [getLayout]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { W, H, padX, padTop, padBot, slotW, rowH, centerX } = getLayout(canvas);
    const balls = activeBalls.current;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f111a";
    ctx.fillRect(0, 0, W, H);

    // Active ball positions for peg glow
    const bpos = balls.filter(b => !b.settled).map(b => ({ x: b.ballX, y: b.ballY }));

    // Pegs — skip first 2 rows (isolated dots look bad), draw from row 2 onward
    const SKIP = 2;
    const pegR = rows <= 8 ? 7 : rows <= 12 ? 6 : rows <= 16 ? 5 : 4;
    for (let row = SKIP; row < rows; row++) {
      const numPegs = row + 1;
      const pegY    = padTop + row * rowH + rowH / 2;
      for (let p = 0; p < numPegs; p++) {
        const pegX = centerX + slotW * (p - (numPegs - 1) / 2);
        const near = bpos.some(b => Math.hypot(pegX - b.x, pegY - b.y) < slotW * 0.8);
        ctx.beginPath();
        ctx.arc(pegX, pegY, pegR, 0, Math.PI * 2);
        if (near) {
          ctx.fillStyle   = "#ffd700";
          ctx.shadowColor = "rgba(255,215,0,1)";
          ctx.shadowBlur  = 14;
        } else {
          ctx.fillStyle   = "#c8cfe8";
          ctx.shadowColor = "rgba(200,207,232,0.4)";
          ctx.shadowBlur  = 3;
        }
        ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.shadowColor = "transparent";
      }
    }

    // Win flash map (slot → highest alpha)
    const winFlash = new Map<number, { alpha: number; mult: number }>();
    for (const b of balls) {
      if (b.settled && b.flashAlpha > 0) {
        const ex = winFlash.get(b.winSlot);
        if (!ex || ex.alpha < b.flashAlpha) winFlash.set(b.winSlot, { alpha: b.flashAlpha, mult: b.winMultiplier });
      }
    }

    // Slots
    const slotTop = padTop + rows * rowH + rowH / 2;
    const slotH   = padBot - 10;
    for (let i = 0; i <= rows; i++) {
      const slotX  = padX + i * slotW;
      const m      = multiplierTable[i] ?? 0;
      const col    = slotColor(m);
      const wf     = winFlash.get(i);
      ctx.save();
      if (wf) { ctx.shadowColor = col.glow; ctx.shadowBlur = 22 * wf.alpha; }
      ctx.beginPath();
      ctx.roundRect(slotX + 1, slotTop + 4, slotW - 2, slotH, 4);
      ctx.fillStyle = wf ? col.bg : col.bg + "cc";
      ctx.fill();
      if (wf) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
      // Compact label: abbreviate large numbers so they fit in the slot
      const label = m >= 1000 ? `${Math.round(m / 100) / 10}k×`
                  : m >= 100  ? `${Math.round(m)}×`
                  : m >= 10   ? `${parseFloat(m.toFixed(1))}×`
                  :             `${m}×`;
      const charCount = label.length;
      const basePx    = slotW > 30 ? 10 : slotW > 22 ? 9 : 8;
      const fontSize  = charCount > 5 ? Math.max(6, basePx - (charCount - 5)) : basePx;
      ctx.fillStyle    = col.text;
      ctx.font         = `bold ${fontSize}px system-ui`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, slotX + slotW / 2, slotTop + 4 + slotH / 2);
    }

    // Trails
    for (const ball of balls) {
      for (const t of ball.trail) {
        const a = Math.max(0, 1 - t.age / 12);
        ctx.beginPath();
        ctx.arc(t.x, t.y, 8 * a, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.3})`;
        ctx.fill();
      }
    }

    // Balls
    for (const ball of balls) {
      if (ball.settled) continue;
      const g = ctx.createRadialGradient(ball.ballX - 3, ball.ballY - 3, 1, ball.ballX, ball.ballY, 9);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#d4d4d4");
      g.addColorStop(1, "#707070");
      ctx.beginPath();
      ctx.arc(ball.ballX, ball.ballY, 9, 0, Math.PI * 2);
      ctx.fillStyle   = g;
      ctx.shadowColor = "rgba(255,255,255,0.8)";
      ctx.shadowBlur  = 14;
      ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.shadowColor = "transparent";
    }

    // Flash overlay (strongest settled ball)
    const best = balls.reduce<{ alpha: number; mult: number } | null>(
      (acc, b) => b.settled && b.flashAlpha > (acc?.alpha ?? 0) ? { alpha: b.flashAlpha, mult: b.winMultiplier } : acc, null);
    if (best && best.alpha > 0) {
      const c = slotColor(best.mult);
      ctx.fillStyle = `rgba(${hexToRgb(c.bg)},${best.alpha * 0.1})`;
      ctx.fillRect(0, 0, W, H);
    }
  }, [getLayout, multiplierTable, rows]);

  // Single persistent rAF loop
  const loop = useCallback(() => {
    const spd = turboRef.current ? 1 : 0.055;
    const balls = activeBalls.current;

    for (const b of balls) {
      if (b.settled) {
        b.flashAlpha = Math.max(0, b.flashAlpha - 0.022);
        continue;
      }
      b.progress += spd;
      if (b.progress >= 1) {
        b.progress = 0;
        b.waypointIdx++;
        if (b.waypointIdx >= b.waypoints.length - 1) {
          const last = b.waypoints[b.waypoints.length - 1];
          if (last) { b.ballX = last.x; b.ballY = last.y; }
          b.settled    = true;
          b.flashAlpha = 1;
          if (!b.calledDone) {
            b.calledDone = true;
            if (!turboRef.current) onLandRef.current?.(b.winMultiplier);
            onBallDoneRef.current(b.id);
          }
          continue;
        }
        // Peg bounce sound (not in turbo)
        if (!turboRef.current) onBounceRef.current?.();
      }
      const from = b.waypoints[b.waypointIdx];
      const to   = b.waypoints[b.waypointIdx + 1];
      if (!from || !to) { b.settled = true; continue; }
      const t  = easeInOut(b.progress);
      b.ballX  = from.x + (to.x - from.x) * t;
      b.ballY  = from.y + (to.y - from.y) * t;
      if (b.waypointIdx < b.waypoints.length - 2) {
        b.trail.push({ x: b.ballX, y: b.ballY, age: 0 });
        if (b.trail.length > 15) b.trail.shift();
      }
    }

    // Age trails
    for (const b of balls) {
      for (const t of b.trail) t.age++;
      b.trail = b.trail.filter(t => t.age < 12);
    }

    // Remove fully done balls
    activeBalls.current = balls.filter(b => !(b.settled && b.flashAlpha <= 0 && b.calledDone));

    draw();

    if (activeBalls.current.length > 0) {
      animRef.current = requestAnimationFrame(loop);
    } else {
      isLooping.current = false;
    }
  }, [draw]);

  // Watch queue for new items
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let added = false;

    for (const item of queue) {
      if (processedIds.current.has(item.id)) continue;
      processedIds.current.add(item.id);
      const wps      = buildWaypoints(canvas, item.path);
      const firstWp  = wps[0];
      const lastWp   = wps[wps.length - 1];
      const instant  = turboRef.current;
      const ball: BallState = {
        id: item.id,
        ballX:        instant ? (lastWp?.x ?? 0) : (firstWp?.x ?? 0),
        ballY:        instant ? (lastWp?.y ?? 0) : (firstWp?.y ?? 0),
        waypoints:    wps,
        waypointIdx:  instant ? wps.length - 1 : 0,
        progress:     0,
        trail:        [],
        settled:      instant,
        winSlot:      item.slot,
        winMultiplier: item.multiplier,
        flashAlpha:   instant ? 1 : 0,
        calledDone:   instant,
      };
      if (instant) onBallDoneRef.current(item.id);
      activeBalls.current.push(ball);
      added = true;
    }

    if (added && !isLooping.current) {
      isLooping.current = true;
      animRef.current = requestAnimationFrame(loop);
    }
  }, [queue, loop, buildWaypoints]);

  // Redraw on config change
  useEffect(() => { draw(); }, [draw, rows, multiplierTable]);

  // Resize observer
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
    return () => { obs.disconnect(); cancelAnimationFrame(animRef.current); };
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

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
