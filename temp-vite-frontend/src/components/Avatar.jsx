// src/components/Avatar.jsx
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
  DPR_CAP: 1,
  TARGET_FPS: 30,
  NOISE_DENSITY_DIV: 24000,
  BLOOM_ALPHA: 0.03,
  SHADOW_BLUR_BASE: 10,
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

/* Mouth animation tuning */
const MOUTH = {
  SPEED: 0.85,          // 0..1  (higher = faster response)
  BOTTOM_MAX: 0.55,     // radians of max open for bottom denture
  TOP_MAX: -0.20,       // radians of max open (negative) for top denture
  TONGUE_AMP: 0.12,     // tongue vertical amplitude at full speech
  TONGUE_SPEED: 0.012,  // tongue wobble speed
  POWER: 0.85           // response curve; <1 = more responsive to small speech values
};

const MOUTH1 = {
  SPEED: 0.92,
  BOTTOM_MAX: 0.60,   // bigger bottom swing
  TOP_MAX:   -0.28,   // stronger upper tip (more negative)
  TONGUE_AMP: 0.12,
  TONGUE_SPEED: 0.012,
  POWER: 0.85
};

/* Upper denture visibility helpers */
const UPPER = {
  // idle offsets so the top denture peeks out a touch
  BIAS_ROT_X: -0.15,     // radians; slight tip “down”
  BIAS_POS_Y: -0.006,    // meters; lower just a hair
  BIAS_POS_Z:  0.000,    // meters; nudge forward a hair

  // extra motion while speaking so it’s visibly moving
  MOVE_Y: -0.010,        // downward during openings
  MOVE_Z:  0.000,        // a bit forward during openings
};


/* Talking cycle config */
const TALK = {
  THRESH: 0.05,    // speechIntensity above this = “speaking”
  MIN_HZ: 4.0,     // min open/close cycles per second while speaking
  MAX_HZ: 9.0,     // max cycles/sec at high intensity
  JITTER: 0.20,    // 0..1 small randomness to make it natural
  ATTACK: 0.25,    // how fast the mouth ramps up when speaking starts
  RELEASE: 0.35    // how fast the mouth closes when speech stops
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

  const angleTargetRef = useRef(-Math.PI / 8);
  const angleNowRef = useRef(-Math.PI / 8);
  const lastChangeRef = useRef(0);

  const tileRef = useRef(null);
  const tileNeedsUpdateRef = useRef(true);

  const resize = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, PERF.DPR_CAP);
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

    const minDelta = 1000 / PERF.TARGET_FPS;
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
    base.addColorStop(
      1,
      `hsl(${(hueBase + 330) % 360} 80% ${8 + 6 * intensity}%)`
    );
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    if (PERF.BLOOM_ALPHA > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = PERF.BLOOM_ALPHA + 0.03 * intensity;
      const rr = Math.max(w, h) * 0.55;
      const bloom = ctx.createRadialGradient(
        w / 2,
        h / 2,
        rr * 0.2,
        w / 2,
        h / 2,
        rr
      );
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
    angleNowRef.current +=
      (angleTargetRef.current - angleNowRef.current) * 0.05;

    const { canvas: tileCanvas, slatHeight, slatGap } = tileRef.current;
    const pattern = ctx.createPattern(tileCanvas, "repeat");

    const speed = 35 + 120 * intensity;
    const offset =
      ((t * speed) % (slatHeight + slatGap)) - (slatHeight + slatGap);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6 + intensity * 0.15;

    ctx.translate(w / 2, h / 2);
    ctx.rotate(angleNowRef.current);
    ctx.translate(-w / 2, -h / 2 + offset);

    ctx.fillStyle = pattern;
    ctx.shadowBlur = PERF.SHADOW_BLUR_BASE + intensity * 12;
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.fillRect(-w, -h, w * 3, h * 3);

    ctx.restore();

    const rollSpeed = 0.15 + intensity * 0.6;
    const rollPos = ((t * rollSpeed) % 1) * h;
    const bandH = Math.max(h * 0.18, 100 * dpr);
    const bandGrad = ctx.createLinearGradient(
      0,
      rollPos - bandH / 2,
      0,
      rollPos + bandH / 2
    );
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

    const grains = Math.floor(
      ((w * h) / PERF.NOISE_DENSITY_DIV) * (1 + intensity)
    );
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.08 + 0.06 * intensity;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < grains; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const size = 0.6 * dpr + Math.random() * (1.2 + intensity * 1.5) * dpr;
      ctx.fillRect(gx, gy, size, size);
    }

    const vignette = ctx.createRadialGradient(
      w / 2,
      h / 2,
      h * 0.2,
      w / 2,
      h / 2,
      h * 0.72
    );
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
  }, [intensity]);

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
   3D MODEL (with mouth animation)
   ============================================================== */
function Model({ glitchIntensity, speechIntensity }) {
  const { scene } = useGLTF("/assets/max.glb");
  const groupRef = useRef();
  const jumpTimeoutRef = useRef();
  const hasScaleJumped = useRef(false);

  // Mouth objects
  const bottomDentureRef = useRef(null);
  const topDentureRef = useRef(null);
  const tongueRef = useRef(null);

  const talkPhaseRef = useRef(0);   // accumulates the talking cycle phase
const mouthEnvRef  = useRef(0);   // smooth envelope of “how much to open”
const initialTopRotX = useRef(0);
const initialTopPos  = useRef(new THREE.Vector3());



  // Find mouth parts once
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.name === "max_headroom_denture_bottom") bottomDentureRef.current = child;
      if (child.name === "max_headroom_denture_top") {
        topDentureRef.current = child;
        // capture original transform once
        initialTopRotX.current = child.rotation.x;
        initialTopPos.current.copy(child.position);

        // apply idle bias so it’s visible even when not talking
        child.rotation.x = initialTopRotX.current + UPPER.BIAS_ROT_X;
        child.position.set(
          initialTopPos.current.x,
          initialTopPos.current.y + UPPER.BIAS_POS_Y,
          initialTopPos.current.z + UPPER.BIAS_POS_Z
        );
      };
      if (child.name === "max_headroom_tongue") tongueRef.current = child;
    });
  }, [scene]);

  // Animate mouth
useFrame((state, delta) => {
  // Is the agent speaking?
  const si = Math.max(0, speechIntensity || 0);
  const speaking = si > TALK.THRESH;

  // Smooth amplitude envelope (attack/release)
  const targetEnv = speaking ? si : 0;            // desired loudness-based envelope
  const rate = speaking ? TALK.ATTACK : TALK.RELEASE;
  mouthEnvRef.current += (targetEnv - mouthEnvRef.current) * Math.min(1, delta / Math.max(0.0001, 1/60) * rate);
  const env = Math.min(1, Math.max(0, mouthEnvRef.current));

  // Talking cycle frequency (cycles/sec) scales with intensity + a touch of jitter
  let hz = TALK.MIN_HZ + (TALK.MAX_HZ - TALK.MIN_HZ) * Math.pow(si, 0.6);
  if (speaking && TALK.JITTER > 0) {
    // small random walk to avoid metronome feeling
    hz *= 1 + (Math.random() * 2 - 1) * (TALK.JITTER * 0.15);
    hz = Math.max(0.1, hz);
  }

  // Advance phase only while speaking; gently slow when not speaking
  if (speaking) {
    talkPhaseRef.current += (Math.PI * 2) * hz * delta;
  } else {
    talkPhaseRef.current *= (1 - Math.min(1, delta * 3)); // damp phase so we settle
  }

  // Smooth ping-pong wave: 0→1→0… (cosine is great for this)
  const chatter = 0.5 * (1 - Math.cos(talkPhaseRef.current)); // 0..1

  // Final open amount mixes *cycle* with *loudness envelope*
  // You can bias toward cycle or env by changing exponents below.
  const open = Math.pow(chatter, 0.9) * Math.pow(env, 0.8); // 0..1

  // Time-aware lerp factor so it feels snappy but stable across FPS
  const lerp = 1 - Math.pow(1 - MOUTH.SPEED, delta * 60);

  // Bottom denture opens downward (positive X rotation)
  if (bottomDentureRef.current) {
    const target = open * MOUTH.BOTTOM_MAX;
    const cur = bottomDentureRef.current.rotation.x;
    bottomDentureRef.current.rotation.x = cur + (target - cur) * lerp;
  }

  // Top denture tips slightly upward (negative X rotation)
  if (topDentureRef.current) {
  const baseRotX = initialTopRotX.current + UPPER.BIAS_ROT_X;
  const basePos  = initialTopPos.current;

  // stronger tip so it’s obvious; feel free to tune TOP_MAX to ~ -0.28
  const targetRotX = baseRotX + open * MOUTH.TOP_MAX; // MOUTH.TOP_MAX should be negative

  // add a bit of down/forward travel while speaking so it clears the lip
  const targetY = basePos.y + UPPER.BIAS_POS_Y + open * UPPER.MOVE_Y;
  const targetZ = basePos.z + UPPER.BIAS_POS_Z + open * UPPER.MOVE_Z;

  // rotational lerp
  const rcur = topDentureRef.current.rotation.x;
  topDentureRef.current.rotation.x = rcur + (targetRotX - rcur) * lerp;

  // positional lerp
  const p = topDentureRef.current.position;
  p.y = p.y + (targetY - p.y) * lerp;
  p.z = p.z + (targetZ - p.z) * lerp;
}


  // // Tongue adds a subtle wobble, also scaled by env
  // if (tongueRef.current) {
  //   const wobble = Math.sin(state.clock.elapsedTime * MOUTH.TONGUE_SPEED) * env * MOUTH.TONGUE_AMP;
  //   const curY = tongueRef.current.position.y;
  //   tongueRef.current.position.y = curY + (wobble - curY) * lerp;
  // }
});


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
   3D MODEL (with mouth animation)
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

/* ==============================================================
   MAIN
   ============================================================== */
const Avatar = ({ agentId }) => {
  const canvasRef = useRef(null);
  const [targetIntensity, setTargetIntensity] = useState(0);
  const [glitchIntensity, setGlitchIntensity] = useState(0);
  const [speechIntensity, setSpeechIntensity] = useState(0); // ADDED
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

        <Model glitchIntensity={glitchIntensity} speechIntensity={speechIntensity} />
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

      <VoiceInterface
        onGlitchIntensity={setTargetIntensity}
        onSpeechIntensity={setSpeechIntensity}   // ADDED
        agentId={agentId}
      />
    </div>
  );
};

export default Avatar;