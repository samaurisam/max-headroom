import React, { useEffect, useRef, useState } from "react";
import { VFX } from "@vfx-js/core";
import maxHeadroomImg from "../assets/max.png"; // Import your image

const Avatar = () => {
  const imgRef = useRef(null);
  const vfxRef = useRef(null);
  const [glitchIntensity, setGlitchIntensity] = useState(0); // 0-1, later driven by audio

  useEffect(() => {
    if (imgRef.current) {
      vfxRef.current = new VFX();
      vfxRef.current.add(imgRef.current, {
        shader: "glitch", // Built-in glitch
        overflow: 50,
      });

      // Custom shader for more control (RGB shift + scan lines)
      const customShader = `
        uniform vec2 resolution;
        uniform sampler2D src;
        uniform float time;
        uniform float intensity; // For dynamic glitches
        out vec4 outColor;

        void main() {
          vec2 uv = gl_FragCoord.xy / resolution;
          float scan = sin(uv.y * 800.0 + time * 5.0) * 0.05 * intensity;
          vec4 cr = texture(src, uv + vec2(0.01 * intensity + scan, 0.0));
          vec4 cg = texture(src, uv);
          vec4 cb = texture(src, uv - vec2(0.01 * intensity + scan, 0.0));
          outColor = vec4(cr.r, cg.g, cb.b, 1.0);
        }
      `;
      vfxRef.current.add(imgRef.current, {
        shader: customShader,
        uniforms: {
          time: () => performance.now() / 1000,
          intensity: () => glitchIntensity,
        },
      });
    }

    return () => {
      if (vfxRef.current) vfxRef.current.destroy();
    };
  }, [glitchIntensity]);

  // Public method to trigger glitches (call from VoiceInterface)
  window.setGlitch = setGlitchIntensity; // Exposed globally for now; use context later

  return (
    <img
      ref={imgRef}
      src={maxHeadroomImg}
      alt="Max Headroom"
      style={{ width: "400px", height: "auto", imageRendering: "pixelated" }} // Retro pixel look
    />
  );
};

export default Avatar;
