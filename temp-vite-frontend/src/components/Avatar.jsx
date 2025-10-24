import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import {
  EffectComposer,
  Glitch,
  ChromaticAberration,
  Scanline,
} from "@react-three/postprocessing";
import * as THREE from "three";
import VoiceInterface from "./VoiceInterface";

/* ==============================================================
   PERF KNOBS (tweak these first)
   ============================================================== */
const PERF = {
  DPR_CAP: 1,          // 2.0 -> sharper, more GPU; 1.0 -> faster
  TARGET_FPS: 30,        // 30 is a great sweet spot
  NOISE_DENSITY_DIV: 24000, // higher = fewer noise specks
  BLOOM_ALPHA: 0.03,     // 0 disables the big soft bloom in backdrop
  SHADOW_BLUR_BASE: 10,  // neon glow cost (lower = faster)
};

/* ==============================================================
   VISUAL CONFIG (unchanged look, brighter slats)
   ============================================================== */
const GLITCH_CONFIG = {
  enableRotationJumps: true,
  maxJumpDegrees: 45,
  jumpIntervalMs: 600,
  enableScaleJump: true,
  maxScaleJumpPercent: 18,
  scaleJumpChance: 10,
  returnSpeed: 0.12,

  glitchStrength: 0.18,
  chromaticStrength: 0.004,
  scanlineDensityBase: 0.6,
  scanlineOpacity: 0.5,

  enableEmissive: true,
  emissiveIntensity: 0.7,
};

/* ==============================================================
   PROCEDURAL BACKDROP (optimized)
   ============================================================== */
function ProceduralBackdrop({ intensity = 0 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());
  const dprRef = useRef(1);
  const lastFrameRef = useRef(0);

  // slat rotation state
  const angleTargetRef = useRef(-Math.PI / 8);
  const angleNowRef = useRef(-Math.PI / 8);
  const lastChangeRef = useRef(0);

  // offscreen tile for slats (pattern)
  const tileRef = useRef(null);
  const tileNeedsUpdateRef = useRef(true); // recolor on demand

  const resize = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, PERF.DPR_CAP);
    dprRef.current = dpr;
    cvs.width = Math.floor(rect.width * dpr);
    cvs.height = Math.floor(rect.height * dpr);
    tileNeedsUpdateRef.current = true; // regenerate tile on resize
  };

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Pause when tab is hidden
  const pageVisibleRef = useRef(true);
  useEffect(() => {
    const onVis = () => {
      pageVisibleRef.current = !document.hidden;
      if (pageVisibleRef.current) {
        lastFrameRef.current = 0; // reset frame pacing
        startRef.current = performance.now();
        loop(); // kick again
      } else {
        cancelAnimationFrame(rafRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const makeSlatTile = (hueBase, dpr) => {
    // Build a single repeating tile: [slatHeight + slatGap] tall
    const slatHeight = Math.max(8 * dpr, 4);
    const slatGap = slatHeight * 2.5;
    const tileW = Math.max(512 * dpr, 256); // wide tile, repeats horizontally
    const tileH = slatHeight + slatGap;

    const off = document.createElement("canvas");
    off.width = tileW;
    off.height = Math.max(1, Math.floor(tileH));

    const ictx = off.getContext("2d", { willReadFrequently: false });

    // brighter neon slat using high sat/lightness
    const hue = (200 + 100 * Math.sin((hueBase * 120) * 0.002)) % 360;
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

    // --- FPS cap ---
    const minDelta = 1000 / PERF.TARGET_FPS;
    if (lastFrameRef.current && tNow - lastFrameRef.current < minDelta) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    lastFrameRef.current = tNow;

    const t = (tNow - startRef.current) / 1000;
    const w = cvs.width;
    const h = cvs.height;

    // ===== BASE GRADIENT (dark, slight hue drift) =================
    const hueBase = (t * 8 + intensity * 30) % 360;
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, `hsl(${(hueBase + 300) % 360} 70% 4%)`);
    base.addColorStop(1, `hsl(${(hueBase + 330) % 360} 80% ${8 + 6 * intensity}%)`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // ===== BIG SOFT BLOOM (cheap or disable via PERF.BLOOM_ALPHA) ==
    if (PERF.BLOOM_ALPHA > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = PERF.BLOOM_ALPHA + 0.03 * intensity;
      const rr = Math.max(w, h) * 0.55;
      const bloom = ctx.createRadialGradient(w / 2, h / 2, rr * 0.2, w / 2, h / 2, rr);
      bloom.addColorStop(0, "rgba(255,255,255,1)");
      bloom.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    }

    // ===== DIAGONAL VHS SLATS (pattern-based, brighter) ==========
    // update tile if needed (size or color drift)
    if (!tileRef.current || tileNeedsUpdateRef.current) {
      tileRef.current = makeSlatTile(hueBase, dpr);
      tileNeedsUpdateRef.current = false;
    }

    // smooth random rotation every 2–4 seconds
    if (t - lastChangeRef.current > 2 + Math.random() * 2) {
      angleTargetRef.current = (Math.random() * 50 - 25) * (Math.PI / 180);
      lastChangeRef.current = t;
    }
    angleNowRef.current += (angleTargetRef.current - angleNowRef.current) * 0.05;

    const { canvas: tileCanvas, slatHeight, slatGap, tileH } = tileRef.current;
    const pattern = ctx.createPattern(tileCanvas, "repeat");

    // Move slats: translate pattern vertically using current time
    const speed = 35 + 120 * intensity;
    const offset = ((t * speed) % (slatHeight + slatGap)) - (slatHeight + slatGap);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6 + intensity * 0.15;

    // rotate the whole fill and shift by offset
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angleNowRef.current);
    ctx.translate(-w / 2, -h / 2 + offset);

    // apply pattern via a huge rect; pattern repeats
    ctx.fillStyle = pattern;
    ctx.shadowBlur = PERF.SHADOW_BLUR_BASE + intensity * 12; // trimmed from heavy values
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.fillRect(-w, -h, w * 3, h * 3);

    ctx.restore();

    // ===== ROLLING TRACKING BAR ===================================
    const rollSpeed = 0.15 + intensity * 0.6;
    const rollPos = ((t * rollSpeed) % 1) * h;
    const bandH = Math.max(h * 0.18, 100 * dpr);
    const bandGrad = ctx.createLinearGradient(0, rollPos - bandH / 2, 0, rollPos + bandH / 2);
    const bandAlpha = 0.12 + intensity * 0.12; // a bit lighter for perf
    bandGrad.addColorStop(0, `rgba(255,255,255,0)`);
    bandGrad.addColorStop(0.5, `rgba(255,255,255,${bandAlpha})`);
    bandGrad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, rollPos - bandH / 2, w, bandH);

    // ===== SCANLINES (coarser) ====================================
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.10 + 0.05 * intensity;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const step = Math.max(3, Math.floor(3 / dpr)); // coarser = fewer draws
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();

    // ===== SPARKLE NOISE (lighter) ================================
    const grains = Math.floor((w * h) / PERF.NOISE_DENSITY_DIV * (1 + intensity));
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.08 + 0.06 * intensity;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < grains; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const size = 0.6 * dpr + Math.random() * (1.2 + intensity * 1.5) * dpr;
      ctx.fillRect(gx, gy, size, size);
    }

    // ===== EDGE VIGNETTE ==========================================
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.72);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // loop
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
  }, [intensity]);

  // recolor tile occasionally (every ~250ms) instead of every frame
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
}

/* ==============================================================
   3D MODEL (unchanged)
   ============================================================== */
function Model({ glitchIntensity }) {
  const { scene } = useGLTF("/assets/max.glb");
  const groupRef = useRef();
  const jumpTimeoutRef = useRef();
  const hasScaleJumped = useRef(false);

  const doRotationJump = () => {
    if (!GLITCH_CONFIG.enableRotationJumps || !groupRef.current) return;
    const deg = (Math.random() * 2 - 1) * GLITCH_CONFIG.maxJumpDegrees;
    let newRot = groupRef.current.rotation.y + THREE.MathUtils.degToRad(deg);
    const limit = Math.PI / 2;
    newRot = Math.max(-limit, Math.min(limit, newRot));
    groupRef.current.rotation.y = newRot;
  };

  const triggerScaleJump = () => {
    if (!GLITCH_CONFIG.enableScaleJump || !groupRef.current) return;
    if (hasScaleJumped.current) return;
    if (Math.random() * 100 < GLITCH_CONFIG.scaleJumpChance) {
      const base = 5;
      const percent = GLITCH_CONFIG.maxScaleJumpPercent / 100;
      const offset = Math.random() * percent * base;
      groupRef.current.scale.setScalar(base + offset);
      hasScaleJumped.current = true;
    }
  };

  const scheduleRotationJump = () => {
    jumpTimeoutRef.current = setTimeout(() => {
      doRotationJump();
      scheduleRotationJump();
    }, GLITCH_CONFIG.jumpIntervalMs);
  };

  useEffect(() => {
    if (glitchIntensity > 0.01) {
      hasScaleJumped.current = false;
      scheduleRotationJump();
      triggerScaleJump();
    } else {
      clearTimeout(jumpTimeoutRef.current);
    }
    return () => clearTimeout(jumpTimeoutRef.current);
  }, [glitchIntensity]);

  useFrame(() => {
    if (!groupRef.current) return;
    // return rotation to 0
    if (glitchIntensity < 0.01) {
      const current = groupRef.current.rotation.y;
      const diff = -current;
      const step = diff * GLITCH_CONFIG.returnSpeed;
      if (Math.abs(step) < 0.001) groupRef.current.rotation.y = 0;
      else groupRef.current.rotation.y += step;
    }
    // return scale to 5
    if (glitchIntensity < 0.01) {
      const current = groupRef.current.scale.x;
      const target = 5;
      const diff = target - current;
      const step = diff * GLITCH_CONFIG.returnSpeed;
      if (Math.abs(step) < 0.001) groupRef.current.scale.setScalar(target);
      else groupRef.current.scale.setScalar(current + step);
    }
  });

  useEffect(() => {
    if (!GLITCH_CONFIG.enableEmissive) return;
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!child.material.emissive) child.material.emissive = new THREE.Color(0x000000);
        child.material.emissiveIntensity = glitchIntensity * GLITCH_CONFIG.emissiveIntensity;
        child.material.needsUpdate = true;
      }
    });
  }, [scene, glitchIntensity]);

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = false;
        child.material.opacity = 1;
        child.material.depthWrite = true;
        child.material.side = THREE.FrontSide;
        child.material.metalness = 0;
        child.material.roughness = 0.5;
        if (child.material.map) child.material.map.needsUpdate = true;
      }
    });
  }, [scene]);

  return <primitive ref={groupRef} object={scene} scale={5} position={[0, -2.5, 0]} />;
}

/* ==============================================================
   POST FX (only “active” when speaking for perf)
   ============================================================== */
function ShaderEffect({ glitchIntensity }) {
  const speaking = glitchIntensity > 0.02;
  if (!speaking) return null; // skip composer entirely when idle

  const g = glitchIntensity * GLITCH_CONFIG.glitchStrength;
  const c = glitchIntensity * GLITCH_CONFIG.chromaticStrength;
  const scanDensity = GLITCH_CONFIG.scanlineDensityBase + 0.4 * glitchIntensity;

  return (
    <EffectComposer>
      <Glitch
        delay={new THREE.Vector2(0.5, 0.5)}
        duration={new THREE.Vector2(0.2, 0.2)}
        strength={new THREE.Vector2(g, g)}
        active
      />
      <ChromaticAberration offset={new THREE.Vector2(c, c)} />
      <Scanline density={scanDensity} opacity={GLITCH_CONFIG.scanlineOpacity * glitchIntensity} />
    </EffectComposer>
  );
}

/* ==============================================================
   MAIN
   ============================================================== */
const Avatar = () => {
  const canvasRef = useRef(null);
  const [targetIntensity, setTargetIntensity] = useState(0);
  const [glitchIntensity, setGlitchIntensity] = useState(0);
  const animRef = useRef();

  // smooth lerp to target intensity
  useEffect(() => {
    const animate = () => {
      setGlitchIntensity((prev) => {
        const diff = targetIntensity - prev;
        const step = diff * 0.18;
        return Math.abs(step) < 0.005 ? targetIntensity : prev + step;
      });
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [targetIntensity]);

  // console helper to test: window.setGlitch(1) / (0)
  useEffect(() => {
    window.setGlitch = setTargetIntensity;
    return () => delete window.setGlitch;
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* Optimized neon procedural background */}
      <ProceduralBackdrop intensity={glitchIntensity} />

      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 1.0, 5], fov: 35 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        style={{ position: "relative", zIndex: 1, background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.clearColor(0, 0, 0, 0);
        }}
      >
        {/* no background color node here */}
        <ambientLight intensity={1.0} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[0, 10, 0]} intensity={1} />

        <Model glitchIntensity={glitchIntensity} />
        <ShaderEffect glitchIntensity={glitchIntensity} />
        <OrbitControls minDistance={2} maxDistance={10} />
      </Canvas>

      {/* Subtle CRT vignette overlay */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 2,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.35) 100%)",
        }}
      />

      <VoiceInterface onGlitchIntensity={setTargetIntensity} />
    </div>
  );
};

export default Avatar;
