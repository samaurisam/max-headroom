import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  EffectComposer,
  RGBShiftShader,
  Noise,
} from "@react-three/drei"; // Drei helpers
import * as THREE from "three";

// Inner 3D scene component (declarative like React)
function MaxModel({ glitchIntensity }) {
  const { scene } = useGLTF("../assets/max-headroom.glb"); // Load model
  const ref = useRef();

  // Animate subtly (jerky head movement for Max style)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y =
        Math.sin(state.clock.elapsedTime) * 0.1 * glitchIntensity; // Glitch-driven wobble
    }
  });

  return <primitive ref={ref} object={scene} scale={2} position={[0, 0, 0]} />;
}

const Avatar = () => {
  const [glitchIntensity, setGlitchIntensity] = useState(0); // 0-1, driven by voice

  // Expose setter for VoiceInterface (or use React Context for better architecture)
  useEffect(() => {
    window.setGlitch = setGlitchIntensity;
  }, []);

  return (
    <div
      style={{
        width: "600px",
        height: "600px",
        border: "2px solid #0f0",
        boxShadow: "0 0 20px #0f0",
      }}
    >
      {" "}
      {/* Retro frame */}
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        {/* Lights and controls */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <OrbitControls enableZoom={false} />{" "}
        {/* Optional: Drag to rotate view */}
        {/* The model */}
        <MaxModel glitchIntensity={glitchIntensity} />
        {/* Post-processing glitches */}
        <EffectComposer>
          {/* RGB Shift for color glitch */}
          <RGBShiftShader
            amount={0.005 * glitchIntensity * 10}
            angle={0}
          />{" "}
          {/* Intensity tie-in */}
          {/* Noise for static/scan lines */}
          <Noise opacity={0.1 * glitchIntensity} />
          {/* Custom shader pass example (add more in a ShaderPass) */}
          {/* Import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
              Define a custom glitch shader and add <primitive object={new ShaderPass(customShader)} /> */}
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Avatar;
