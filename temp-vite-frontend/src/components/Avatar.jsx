import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import { EffectComposer, Glitch, ChromaticAberration, Scanline } from "@react-three/postprocessing";
import * as THREE from "three";

// Load and render the 3D model
function Model({ glitchIntensity }) {
  const { scene } = useGLTF("/assets/max.glb");
  const ref = useRef();
  //console.log("Model Scene:", scene); // Debug: Check if model loads

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.01 * glitchIntensity; // Rotate based on intensity
      //console.log("Rotating:", ref.current.rotation.y); // Debug rotation
    }
  });

  // Debug bounding box
  const box = new THREE.Box3().setFromObject(scene);
  //console.log("Model Bounding Box:", box.min, box.max);

  // Enhance material debug and handle normal map
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        //console.log("Mesh:", child.name, "Original Material:", child.material);
        if (child.material) {
          child.material.needsUpdate = true; // Force material update
          //console.log("Material updated:", child.material);
          // Disable transparency and alpha completely
          child.material.transparent = false; // Explicitly disable
          child.material.opacity = 1; // Full opacity
          child.material.alphaMap = null; // Disable alpha map
          child.material.alphaTest = 0; // No alpha testing
          child.material.depthWrite = true; // Ensure depth buffer
          child.material.depthTest = true; // Enable depth testing
          child.material.side = THREE.FrontSide; // Backface culling
          // Handle textures
          if (child.material.map) {
            //console.log("Base Color Texture found:", child.material.map);
            child.material.map.needsUpdate = true; // Force update
            child.material.color.set(0xffffff); // White base
          }
          // Check for normal map (assuming .1001 is normal)
          if (child.material.normalMap) {
            //console.log("Normal Map found:", child.material.normalMap);
            child.material.normalMap.needsUpdate = true; // Force update
          } else {
            // Attempt to assign normal map if named correctly
            const normalTexture = child.material.map?.name?.includes("Normal")
              ? child.material.map
              : null;
            if (normalTexture) {
              child.material.normalMap = normalTexture;
              child.material.normalMap.needsUpdate = true;
              //console.log("Assigned normal map:", normalTexture);
            }
          }
          child.material.metalness = 0; // Neutral
          child.material.roughness = 0.5; // Moderate
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffa500,
            emissive: 0xffa500,
            emissiveIntensity: 0.5,
            metalness: 0.2,
            roughness: 0.5,
          });
          //console.log("Applied fallback material to:", child.name);
        }
      }
    });
    // Adjust render order for face mesh
    scene.traverse((child) => {
      if (child.isMesh && child.name.includes("Plane001")) child.renderOrder = 1; // Face on top
    });
  }, [scene]);

  return <primitive ref={ref} object={scene} scale={5} position={[0, -2.5, 0]} />; // Shift downward to anchor bottom
}

// ShaderEffect component for post-processing effects
function ShaderEffect({ glitchIntensity }) {
  const composer = useRef();
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    //console.log("Composer initialized:", composer.current);
  }, [composer]);

  useFrame(() => {
    if (composer.current) {
      composer.current.render(); // Manual render
      //console.log("Frame Rendered with Composer");
    } else {
      gl.render(scene, camera); // Fallback render
      //console.log("Fallback Rendered");
    }
  }, 1); // Higher priority

  return (
    <EffectComposer ref={composer}>
      <Glitch
        delay={new THREE.Vector2(1.5, 1.5)}
        duration={new THREE.Vector2(0.1, 0.1)}
        strength={new THREE.Vector2(0.1 * glitchIntensity, 0.1 * glitchIntensity)}
        active
      /> {/* Glitch effect */}
      <ChromaticAberration
        offset={new THREE.Vector2(0.002 * glitchIntensity, 0.002 * glitchIntensity)}
      /> {/* Color fringe */}
      <Scanline
        density={0.5 + 0.5 * glitchIntensity}
        opacity={0.4 * glitchIntensity}
      /> {/* Scan lines */}
    </EffectComposer>
  );
}

// Avatar component
const Avatar = () => {
  const canvasRef = useRef(null);
  const [glitchIntensity, setGlitchIntensity] = useState(0);

  useEffect(() => {
    window.setGlitch = setGlitchIntensity; // Expose for VoiceInterface
    const handleContextLost = () => console.log("WebGL Context Lost");
    const handleContextRestored = () => console.log("WebGL Context Restored");
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);
    }
    return () => {
      if (canvas) {
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      }
    };
  }, [canvasRef]);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas
        ref={canvasRef}
        camera={{ position: [0, 1.0, 5], fov: 35 }} // Shift camera up to focus on bottom
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#000000"]} /> {/* Black background */}
        <ambientLight intensity={1.0} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[0, 10, 0]} intensity={1} />
        <Model glitchIntensity={glitchIntensity} />
        <ShaderEffect glitchIntensity={glitchIntensity} />
        <OrbitControls minDistance={2} maxDistance={10} />
      </Canvas>
    </div>
  );
};

export default Avatar;