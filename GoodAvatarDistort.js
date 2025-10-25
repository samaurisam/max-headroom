//GOOD GLITCH VERSION

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
   CONFIG
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
   PROCEDURAL BACKDROP
   ============================================================== */
function ProceduralBackdrop({ intensity = 0 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());
  const dprRef = useRef(1);

  // Random rotation control
  const rotationRef = useRef(-Math.PI / 8);
  const targetRotationRef = useRef(-Math.PI / 8);
  const rotationChangeTimeRef = useRef(performance.now());

  const resize = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    cvs.width = Math.floor(rect.width * dpr);
    cvs.height = Math.floor(rect.height * dpr);
  };

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");

    const draw = (tNow) => {
      const t = (tNow - startRef.current) / 1000;
      const w = cvs.width;
      const h = cvs.height;
      const dpr = dprRef.current;

      // === manage random rotation target every few seconds ===
      const elapsed = tNow - rotationChangeTimeRef.current;
      if (elapsed > 3000 + Math.random() * 4000) {
        targetRotationRef.current = ((Math.random() * 0.6 - 0.3) * Math.PI) / 4;
        rotationChangeTimeRef.current = tNow;
      }
      // smooth transition
      rotationRef.current +=
        (targetRotationRef.current - rotationRef.current) * 0.02;

      // === background gradient ===
      const hueBase = (t * 8 + intensity * 30) % 360;
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, `hsl(${(hueBase + 300) % 360} 70% 4%)`);
      base.addColorStop(
        1,
        `hsl(${(hueBase + 330) % 360} 80% ${8 + 6 * intensity}%)`
      );
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // === diagonal bright slats ===
      const slatHeight = Math.max(8 * dpr, 4);
      const slatGap = slatHeight * 2.5;
      const speed = 35 + 120 * intensity;
      const offset =
        ((t * speed) % (slatHeight + slatGap)) - (slatHeight + slatGap);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6 + intensity * 0.15;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rotationRef.current); // rotating dynamically
      ctx.translate(-w / 2, -h / 2);

      for (
        let y = offset;
        y < h + slatHeight + slatGap;
        y += slatHeight + slatGap
      ) {
        const hue = (200 + 100 * Math.sin((y + t * 120) * 0.002)) % 360;
        ctx.fillStyle = `hsl(${hue}, 95%, ${60 + 25 * intensity}%)`;
        ctx.fillRect(-w, y, w * 3, slatHeight);
      }
      ctx.restore();

      // === rolling bright bar ===
      const rollSpeed = 0.15 + intensity * 0.6;
      const rollPos = ((t * rollSpeed) % 1) * h;
      const bandH = Math.max(h * 0.18, 100 * dpr);
      const bandGrad = ctx.createLinearGradient(
        0,
        rollPos - bandH / 2,
        0,
        rollPos + bandH / 2
      );
      const bandAlpha = 0.14 + intensity * 0.14;
      bandGrad.addColorStop(0, `rgba(255,255,255,0)`);
      bandGrad.addColorStop(0.5, `rgba(255,255,255,${bandAlpha})`);
      bandGrad.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1;
      ctx.fillStyle = bandGrad;
      ctx.fillRect(0, rollPos - bandH / 2, w, bandH);

      // === scanlines ===
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.12 + 0.06 * intensity;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      const step = Math.max(2, Math.floor(2 / dpr));
      for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
      ctx.restore();

      // === grain ===
      const grains = Math.floor((w * h) / (9000 / (1 + intensity * 2)));
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.12 + 0.1 * intensity;
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < grains; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        const size = 0.8 * dpr + Math.random() * (1.6 + intensity * 2.0) * dpr;
        ctx.fillRect(gx, gy, size, size);
      }

      // === vignette ===
      const vignette = ctx.createRadialGradient(
        w / 2,
        h / 2,
        h * 0.2,
        w / 2,
        h / 2,
        h * 0.72
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [intensity]);

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
   3D MODEL
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
    if (glitchIntensity < 0.01) {
      const current = groupRef.current.rotation.y;
      const diff = -current;
      const step = diff * GLITCH_CONFIG.returnSpeed;
      if (Math.abs(step) < 0.001) groupRef.current.rotation.y = 0;
      else groupRef.current.rotation.y += step;
    }
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
        if (!child.material.emissive)
          child.material.emissive = new THREE.Color(0x000000);
        child.material.emissiveIntensity =
          glitchIntensity * GLITCH_CONFIG.emissiveIntensity;
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

  return (
    <primitive
      ref={groupRef}
      object={scene}
      scale={5}
      position={[0, -2.5, 0]}
    />
  );
}

/* ==============================================================
   POST FX
   ============================================================== */
function ShaderEffect({ glitchIntensity }) {
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
      <Scanline
        density={scanDensity}
        opacity={GLITCH_CONFIG.scanlineOpacity * glitchIntensity}
      />
    </EffectComposer>
  );
}

// function ShaderEffect({ glitchIntensity }) {
//   const speaking = glitchIntensity > 0.02;
//   if (!speaking) return null; // skip composer entirely when idle

//   const g = glitchIntensity * GLITCH_CONFIG.glitchStrength;
//   const c = glitchIntensity * GLITCH_CONFIG.chromaticStrength;
//   const scanDensity = GLITCH_CONFIG.scanlineDensityBase + 0.4 * glitchIntensity;

//   return (
//     <EffectComposer>
//       <Glitch
//         delay={new THREE.Vector2(0.5, 0.5)}
//         duration={new THREE.Vector2(0.2, 0.2)}
//         strength={new THREE.Vector2(g, g)}
//         active
//       />
//       <ChromaticAberration offset={new THREE.Vector2(c, c)} />
//       <Scanline density={scanDensity} opacity={GLITCH_CONFIG.scanlineOpacity * glitchIntensity} />
//     </EffectComposer>
//   );
// }

/* ==============================================================
   MAIN
   ============================================================== */
const Avatar = () => {
  const canvasRef = useRef(null);
  const [targetIntensity, setTargetIntensity] = useState(0);
  const [glitchIntensity, setGlitchIntensity] = useState(0);
  const animRef = useRef();

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

  useEffect(() => {
    window.setGlitch = setTargetIntensity;
    return () => delete window.setGlitch;
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
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
        <ambientLight intensity={1.0} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[0, 10, 0]} intensity={1} />

        <Model glitchIntensity={glitchIntensity} />
        <ShaderEffect glitchIntensity={glitchIntensity} />
        <OrbitControls minDistance={2} maxDistance={10} />
      </Canvas>

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
