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
import ParticleSwarm from "./ParticleSwarm";
import ProceduralBackdrop from "./ProceduralBackdrop";

/* ==============================================================
   PERF KNOBS
   ============================================================== */
const PERF = {
  DPR_CAP: 1,
  TARGET_FPS: 30,
  NOISE_DENSITY_DIV: 24000,
  BLOOM_ALPHA: 0.03,
  SHADOW_BLUR_BASE: 10,
};

/* ==============================================================
   VISUAL CONFIG
   ============================================================== */
const GLITCH_CONFIG = {
  enableRotationJumps: true,
  maxJumpDegrees: 20,
  jumpIntervalMs: 600,
  enableScaleJump: true,
  maxScaleJumpPercent: 18,
  scaleJumpChance: 60,
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
  SPEED: 0.85,
  BOTTOM_MAX: 0.55,
  TOP_MAX: -0.2,
  TONGUE_AMP: 0.12,
  TONGUE_SPEED: 0.012,
  POWER: 0.85,
};

const UPPER = {
  BIAS_ROT_X: -0.15,
  BIAS_POS_Y: -0.0105,
  BIAS_POS_Z: 0.0,
  MOVE_Y: -0.01,
  MOVE_Z: 0.0,
};

const TALK = {
  THRESH: 0.05,
  MIN_HZ: 4.0,
  MAX_HZ: 9.0,
  JITTER: 0.2,
  ATTACK: 0.25,
  RELEASE: 0.35,
};

/* ==============================================================
   3D MODEL (with mouth + glitch return)
   ============================================================== */
function Model({ glitchIntensity, speechIntensity }) {
  const { scene } = useGLTF("/assets/max.glb");
  const groupRef = useRef();
  const jumpTimeoutRef = useRef();
  const hasScaleJumped = useRef(false);

  const bottomDentureRef = useRef(null);
  const topDentureRef = useRef(null);
  const tongueRef = useRef(null);

  const talkPhaseRef = useRef(0);
  const mouthEnvRef = useRef(0);
  const initialTopRotX = useRef(0);
  const initialTopPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (child.name === "max_headroom_denture_bottom")
        bottomDentureRef.current = child;
      if (child.name === "max_headroom_denture_top") {
        topDentureRef.current = child;
        initialTopRotX.current = child.rotation.x;
        initialTopPos.current.copy(child.position);
        child.rotation.x = initialTopRotX.current + UPPER.BIAS_ROT_X;
        child.position.set(
          initialTopPos.current.x,
          initialTopPos.current.y + UPPER.BIAS_POS_Y,
          initialTopPos.current.z + UPPER.BIAS_POS_Z
        );
      }
      if (child.name === "max_headroom_tongue") tongueRef.current = child;
    });
  }, [scene]);

  // MOUTH ANIMATION
  useFrame((state, delta) => {
    const si = Math.max(0, speechIntensity || 0);
    const speaking = si > TALK.THRESH;

    const targetEnv = speaking ? si : 0;
    const rate = speaking ? TALK.ATTACK : TALK.RELEASE;
    mouthEnvRef.current +=
      (targetEnv - mouthEnvRef.current) *
      Math.min(1, (delta / (1 / 60)) * rate);
    const env = Math.min(1, Math.max(0, mouthEnvRef.current));

    let hz = TALK.MIN_HZ + (TALK.MAX_HZ - TALK.MIN_HZ) * Math.pow(si, 0.6);
    if (speaking && TALK.JITTER > 0) {
      hz *= 1 + (Math.random() * 2 - 1) * (TALK.JITTER * 0.15);
      hz = Math.max(0.1, hz);
    }

    if (speaking) {
      talkPhaseRef.current += Math.PI * 2 * hz * delta;
    } else {
      talkPhaseRef.current *= 1 - Math.min(1, delta * 3);
    }

    const chatter = 0.5 * (1 - Math.cos(talkPhaseRef.current));
    const open = Math.pow(chatter, 0.9) * Math.pow(env, 0.8);

    const lerp = 1 - Math.pow(1 - MOUTH.SPEED, delta * 60);

    if (bottomDentureRef.current) {
      const target = open * MOUTH.BOTTOM_MAX;
      const cur = bottomDentureRef.current.rotation.x;
      bottomDentureRef.current.rotation.x = cur + (target - cur) * lerp;
    }

    if (topDentureRef.current) {
      const baseRotX = initialTopRotX.current + UPPER.BIAS_ROT_X;
      const basePos = initialTopPos.current;
      const targetRotX = baseRotX + open * MOUTH.TOP_MAX;
      const targetY = basePos.y + UPPER.BIAS_POS_Y + open * UPPER.MOVE_Y;
      const targetZ = basePos.z + UPPER.BIAS_POS_Z + open * UPPER.MOVE_Z;

      const rcur = topDentureRef.current.rotation.x;
      topDentureRef.current.rotation.x = rcur + (targetRotX - rcur) * lerp;

      const p = topDentureRef.current.position;
      p.y = p.y + (targetY - p.y) * lerp;
      p.z = p.z + (targetZ - p.z) * lerp;
    }
  });

  // GLITCH JUMPS
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

  // RETURN TO NORMAL
  useFrame(() => {
    if (!groupRef.current || glitchIntensity >= 0.01) return;

    const rotCurrent = groupRef.current.rotation.y;
    const rotDiff = -rotCurrent;
    const rotStep = rotDiff * GLITCH_CONFIG.returnSpeed;
    if (Math.abs(rotStep) < 0.001) {
      groupRef.current.rotation.y = 0;
    } else {
      groupRef.current.rotation.y += rotStep;
    }

    const scaleCurrent = groupRef.current.scale.x;
    const scaleTarget = 5;
    const scaleDiff = scaleTarget - scaleCurrent;
    const scaleStep = scaleDiff * GLITCH_CONFIG.returnSpeed;
    if (Math.abs(scaleStep) < 0.001) {
      groupRef.current.scale.setScalar(scaleTarget);
    } else {
      groupRef.current.scale.setScalar(scaleCurrent + scaleStep);
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
   ShaderEffect
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
   MAIN Avatar Component
   ============================================================== */
const Avatar = ({ agentId }) => {
  const [showMain, setShowMain] = useState(false);
  const [fade, setFade] = useState(0);
  const [speechIntensity, setSpeechIntensity] = useState(0);
  const [glitchIntensity, setGlitchIntensity] = useState(0); // ADDED
  const animRef = useRef();

  useEffect(() => {
    let start = null;
    const duration = 350;

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setFade(progress);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };

    if (showMain) {
      animRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [showMain]);

  const handleConversationStart = () => {
    setShowMain(true);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* PARTICLE SWARM */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1 - fade,
          transform: `scale(${1 - fade * 0.3})`,
          transition: "opacity 0.35s ease, transform 0.35s ease",
          pointerEvents: showMain ? "none" : "auto",
        }}
      >
        <ParticleSwarm />
      </div>

      {/* MAIN SCENE */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: fade,
          pointerEvents: showMain ? "auto" : "none",
        }}
      >
        <ProceduralBackdrop intensity={fade} />
        <Canvas
          camera={{ position: [0, 1.0, 5], fov: 40 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <ambientLight intensity={1.0} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <directionalLight position={[0, 10, 0]} intensity={1} />
          <Model
            glitchIntensity={glitchIntensity}
            speechIntensity={speechIntensity}
          />
          <ShaderEffect glitchIntensity={glitchIntensity} />
          <OrbitControls minDistance={2} maxDistance={10} />
        </Canvas>
      </div>

      {/* VOICE INTERFACE */}
      <VoiceInterface
        onConversationStart={handleConversationStart}
        onGlitchIntensity={setGlitchIntensity}
        onSpeechIntensity={setSpeechIntensity}
        agentId={agentId}
      />

      {/* Vignette */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </div>
  );
};

export default Avatar;
