import React, { useEffect, useRef } from "react";
import io from "socket.io-client";

const SOCKET_SERVER_URL = "http://localhost:3001"; // Your backend URL/port

const VoiceInterface = () => {
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(new AudioContext());
  const analyserRef = useRef(null);

  useEffect(() => {
    // Connect to backend
    socketRef.current = io(SOCKET_SERVER_URL);

    // Setup mic
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          event.data.arrayBuffer().then((buffer) => {
            socketRef.current.emit("audio-in", buffer);
          });
        }
      };
      mediaRecorderRef.current.start(250); // Send chunks every 250ms

      // Audio analyser for volume/glitch trigger
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
    });

    // Receive audio from backend (OpenAI response)
    socketRef.current.on("audio-out", (audioChunk) => {
      audioContextRef.current.decodeAudioData(audioChunk, (buffer) => {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start();

        // Trigger glitch on speech (analyze volume)
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
        window.setGlitch(Math.min(volume / 128, 1)); // Intensify based on output volume
      });
    });

    return () => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      socketRef.current.disconnect();
    };
  }, []);

  return null; // Invisible component for audio logic
};

export default VoiceInterface;
