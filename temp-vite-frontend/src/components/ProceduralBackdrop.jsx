// src/components/ProceduralBackdrop.jsx
import React, { useRef, useEffect } from "react";

const ProceduralBackdrop = ({ intensity = 0, slatsPhase = 1 }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());
  const dprRef = useRef(1);
  const lastFrameRef = useRef(0);

  const angleTargetRef = useRef(-Math.PI / 8);
  const angleNowRef = useRef(-Math.PI / 8);
  const lastChangeRef = useRef(0);

  const tileRef = useRef(null);
  const tileNeedsUpdateRef = useRef(true);

  const resize = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    dprRef.current = dpr;
    cvs.width = Math.floor(rect.width * dpr);
    cvs.height = Math.floor(rect.height * dpr);
    tileNeedsUpdateRef.current = true;
  };

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pageVisibleRef = useRef(true);
  useEffect(() => {
    const onVis = () => {
      pageVisibleRef.current = !document.hidden;
      if (pageVisibleRef.current) {
        lastFrameRef.current = 0;
        startRef.current = performance.now();
        loop();
      } else {
        cancelAnimationFrame(rafRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const makeSlatTile = (hueBase, dpr) => {
    const slatHeight = Math.max(8 * dpr, 4);
    const slatGap = slatHeight * 2.5;
    const tileW = Math.max(512 * dpr, 256);
    const tileH = slatHeight + slatGap;

    const off = document.createElement("canvas");
    off.width = tileW;
    off.height = Math.max(1, Math.floor(tileH));

    const ictx = off.getContext("2d", { willReadFrequently: false });

    const hue = (200 + 100 * Math.sin(hueBase * 120 * 0.002)) % 360;
    ictx.globalCompositeOperation = "source-over";
    ictx.globalAlpha = 1;
    ictx.fillStyle = `hsl(${hue}, 95%, 65%)`;
    ictx.fillRect(0, 0, tileW, slatHeight);

    return { canvas: off, slatHeight, slatGap, tileH };
  };

  const drawFrame = (tNow) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    const dpr = dprRef.current;

    const minDelta = 1000 / 30;
    if (lastFrameRef.current && tNow - lastFrameRef.current < minDelta) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    lastFrameRef.current = tNow;

    const t = (tNow - startRef.current) / 1000;
    const w = cvs.width;
    const h = cvs.height;

    const hueBase = (t * 8 + intensity * 30) % 360;
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, `hsl(${(hueBase + 300) % 360} 70% 4%)`);
    base.addColorStop(1, `hsl(${(hueBase + 330) % 360} 80% ${8 + 6 * intensity}%)`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    if (0.03 > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.03 + 0.03 * intensity;
      const rr = Math.max(w, h) * 0.55;
      const bloom = ctx.createRadialGradient(w / 2, h / 2, rr * 0.2, w / 2, h / 2, rr);
      bloom.addColorStop(0, "rgba(255,255,255,1)");
      bloom.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    }

    if (!tileRef.current || tileNeedsUpdateRef.current) {
      tileRef.current = makeSlatTile(hueBase, dpr);
      tileNeedsUpdateRef.current = false;
    }

    if (t - lastChangeRef.current > 2 + Math.random() * 2) {
      angleTargetRef.current = (Math.random() * 50 - 25) * (Math.PI / 180);
      lastChangeRef.current = t;
    }
    angleNowRef.current += (angleTargetRef.current - angleNowRef.current) * 0.05;

    const { canvas: tileCanvas, slatHeight, slatGap } = tileRef.current;
    const pattern = ctx.createPattern(tileCanvas, "repeat");

    const speed = 35 + 120 * intensity;
    const offset = ((t * speed) % (slatHeight + slatGap)) -
                   (slatHeight + slatGap) * (1 - slatsPhase);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (0.6 + intensity * 0.15) * slatsPhase;

    ctx.translate(w / 2, h / 2);
    ctx.rotate(angleNowRef.current);
    ctx.translate(-w / 2, -h / 2 + offset);

    ctx.fillStyle = pattern;
    ctx.shadowBlur = 10 + intensity * 12;
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.fillRect(-w, -h, w * 3, h * 3);

    ctx.restore();

    const rollSpeed = 0.15 + intensity * 0.6;
    const rollPos = ((t * rollSpeed) % 1) * h;
    const bandH = Math.max(h * 0.18, 100 * dpr);
    const bandGrad = ctx.createLinearGradient(0, rollPos - bandH / 2, 0, rollPos + bandH / 2);
    const bandAlpha = 0.12 + intensity * 0.12;
    bandGrad.addColorStop(0, `rgba(255,255,255,0)`);
    bandGrad.addColorStop(0.5, `rgba(255,255,255,${bandAlpha})`);
    bandGrad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, rollPos - bandH / 2, w, bandH);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.1 + 0.05 * intensity;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const step = Math.max(3, Math.floor(3 / dpr));
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();

    const grains = Math.floor(((w * h) / 24000) * (1 + intensity));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.08 + 0.06 * intensity;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < grains; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const size = 0.6 * dpr + Math.random() * (1.2 + intensity * 1.5) * dpr;
      ctx.fillRect(gx, gy, size, size);
    }

    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    rafRef.current = requestAnimationFrame(drawFrame);
  };

  const loop = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawFrame);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [intensity, slatsPhase]);

  useEffect(() => {
    const id = setInterval(() => {
      tileNeedsUpdateRef.current = true;
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        display: "block",
        background: "transparent",
      }}
    />
  );
};

export default ProceduralBackdrop;