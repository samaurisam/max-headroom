// src/components/ParticleSwarm.jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ParticleSwarm = ({
  glbPath = '/assets/max5.glb',
  gatherDuration = 30,
  pulseDuration = 30,
  looseness = 0.08,
  particleCount = 20000,
  particleSize = 0.015,
  floatSpeed = 1.2,
  floatAmplitude = 0.04,
  rotationSpeed = 0.03,
}) => {
  const mountRef = useRef(null);
  const particlesRef = useRef(null);
  const targetPositionsRef = useRef(null);
  const startPositionsRef = useRef(null);
  const offsetsRef = useRef(null);
  const isGatheringRef = useRef(true);
  const gatherStartTimeRef = useRef(0);
  const pulseStartTimeRef = useRef(0);
// GLOBAL: Prevent double GLB load in React 18 dev mode
let glbLoaded = false;


  useEffect(() => {
    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x000000);
    // scene.background = null;
    
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.8, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const light = new THREE.PointLight(0xffffff, 2, 15);
    light.position.set(0, 1.5, 4);
    scene.add(light);

    const loader = new GLTFLoader();
    loader.load(
      glbPath,
      (gltf) => {
        if (glbLoaded) {
          console.warn("[ParticleSwarm] GLB already loaded — skipping duplicate");
          return;
        }
        glbLoaded = true;
        console.log('[ParticleSwarm] GLB loaded');

        const meshes = [];
        gltf.scene.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });

        if (meshes.length === 0) {
          console.error('No meshes found in GLB');
          return;
        }

        const target = new Float32Array(particleCount * 3);
        const start = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
          const mesh = meshes[Math.floor(Math.random() * meshes.length)];
          const geom = mesh.geometry;
          const pos = geom.attributes.position.array;
          const idx = geom.index?.array;
          const faceCount = idx ? idx.length / 3 : pos.length / 9;

          const faceIdx = Math.floor(Math.random() * faceCount) * 3;
          const i0 = idx ? idx[faceIdx] : faceIdx;
          const i1 = idx ? idx[faceIdx + 1] : faceIdx + 1;
          const i2 = idx ? idx[faceIdx + 2] : faceIdx + 2;

          const v0 = new THREE.Vector3(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]);
          const v1 = new THREE.Vector3(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]);
          const v2 = new THREE.Vector3(pos[i2 * 3], pos[i2 * 3 + 1], pos[i2 * 3 + 2]);

          const r1 = Math.random(), r2 = Math.random();
          const sqrtR1 = Math.sqrt(r1);
          const a = 1 - sqrtR1, b = sqrtR1 * (1 - r2), c = sqrtR1 * r2;

          const localPos = new THREE.Vector3()
            .addScaledVector(v0, a)
            .addScaledVector(v1, b)
            .addScaledVector(v2, c);

          const worldPos = localPos.clone().applyMatrix4(mesh.matrixWorld);

          // TARGET
          target[i * 3] = worldPos.x + (Math.random() - 0.5) * looseness;
          target[i * 3 + 1] = worldPos.y + (Math.random() - 0.5) * looseness;
          target[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * looseness;

          // START
          const angle = Math.random() * Math.PI * 2;
          const height = (Math.random() - 0.5) * 6;
          const radius = 4 + Math.random() * 4;
          start[i * 3] = Math.cos(angle) * radius;
          start[i * 3 + 1] = height;
          start[i * 3 + 2] = Math.sin(angle) * radius;

          // COLOR
          colors[i * 3] = Math.random();
          colors[i * 3 + 1] = Math.random();
          colors[i * 3 + 2] = Math.random();

          sizes[i] = 0.8 + Math.random() * 0.6;

          offsets[i * 3] = Math.random() * Math.PI * 2;
          offsets[i * 3 + 1] = Math.random() * Math.PI * 2;
          offsets[i * 3 + 2] = Math.random() * Math.PI * 2;
        }

        targetPositionsRef.current = target;
        startPositionsRef.current = start;
        offsetsRef.current = offsets;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(start, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
          size: particleSize,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const particles = new THREE.Points(geometry, material);
        // === 1. SCALE ===
        particles.scale.set(4.5, 4.5, 4.5); // 2× larger

        // === 2. ANCHOR TO BOTTOM ===
        particles.position.y = -1.2; // Move down (adjust as needed)

        // === 3. (Optional) Center horizontally ===
        particles.position.x = 0;

        scene.add(particles);
        particlesRef.current = particles;

        const clock = new THREE.Clock();
        gatherStartTimeRef.current = clock.getElapsedTime();
        pulseStartTimeRef.current = gatherStartTimeRef.current;

        const animate = () => {
          const now = clock.getElapsedTime();
          const pos = geometry.attributes.position;
          const start = startPositionsRef.current;
          const target = targetPositionsRef.current;
          const offsets = offsetsRef.current;

          let t = 0;

          if (isGatheringRef.current) {
            const elapsed = now - gatherStartTimeRef.current;
            if (elapsed < gatherDuration) {
              t = elapsed / gatherDuration;
            } else {
              isGatheringRef.current = false;
              pulseStartTimeRef.current = now;
              t = 1;
            }
          } else {
            const pulseElapsed = now - pulseStartTimeRef.current;
            const cycleT = (pulseElapsed % pulseDuration) / pulseDuration;
            t = 0.5 + Math.sin(cycleT * Math.PI * 2) * 0.5;
          }

          for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const ox = offsets[i3], oy = offsets[i3 + 1], oz = offsets[i3 + 2];

            const tx = THREE.MathUtils.lerp(start[i3], target[i3], t);
            const ty = THREE.MathUtils.lerp(start[i3 + 1], target[i3 + 1], t);
            const tz = THREE.MathUtils.lerp(start[i3 + 2], target[i3 + 2], t);

            pos.array[i3] = tx + Math.sin(now * floatSpeed + ox) * floatAmplitude;
            pos.array[i3 + 1] = ty + Math.sin(now * (floatSpeed * 1.25) + oy) * floatAmplitude;
            pos.array[i3 + 2] = tz + Math.sin(now * (floatSpeed * 1.08) + oz) * floatAmplitude;

            sizes[i] = 0.8 + Math.sin(now * 3 + i * 0.01) * 0.4;
          }

          pos.needsUpdate = true;
          geometry.attributes.size.needsUpdate = true;

          particles.rotation.y = now * rotationSpeed;

          renderer.render(scene, camera);
          requestAnimationFrame(animate);
        };
        animate();
      },
      undefined,
      (err) => console.error('GLTF load error:', err)
    );

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [
    glbPath,
    gatherDuration,
    pulseDuration,
    looseness,
    particleCount,
    particleSize,
    floatSpeed,
    floatAmplitude,
    rotationSpeed,
  ]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
      }}
    />
  );
};

export default ParticleSwarm;