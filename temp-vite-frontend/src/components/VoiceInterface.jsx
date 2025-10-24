// src/components/VoiceInterface.jsx
import React, { useRef, useEffect, useState } from "react";
import { Conversation } from "@elevenlabs/client";

const VoiceInterface = ({ onGlitchIntensity }) => {
  // Refs
  const conversationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafIdRef = useRef(null);
  const streamRef = useRef(null);
  const lastSpeechRef = useRef(0);
  const activityIntervalRef = useRef(null);

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Disconnected");
  const [mode, setMode] = useState("unknown");
  const [messages, setMessages] = useState([]);
  const [userMessage, setUserMessage] = useState("");
  const [canSendFeedback, setCanSendFeedback] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [vadState, setVadState] = useState("silent");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null); // ADDED setError

  const AGENT_ID = "agent_7801k81mnfw2e3qbwfw7cs4vhde5";

  // VAD Settings
  const VAD_THRESHOLD = 28;
  const VAD_HOLD_MS = 400;
  const VAD_SILENCE_MS = 900;

  // === AUDIO VISUALIZER + VAD ===
  const startAudioVisualizer = (stream) => {
    streamRef.current = stream;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const visualize = () => {
      rafIdRef.current = requestAnimationFrame(visualize);
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setAudioLevel(average);

      const now = Date.now();
      if (average > VAD_THRESHOLD) {
        lastSpeechRef.current = now;
        if (vadState !== "speaking") setVadState("speaking");
        conversationRef.current?.sendUserActivity?.();
      } else if (vadState === "speaking" && now - lastSpeechRef.current < VAD_HOLD_MS) {
        // Hold
      } else if (now - lastSpeechRef.current > VAD_SILENCE_MS) {
        if (vadState !== "silent") setVadState("silent");
      }
    };
    visualize();
  };

  const stopAudioVisualizer = () => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
  };

  // === START CONVERSATION ===
  const startConversation = async () => {
    if (isConnecting || conversationRef.current) return;
    setIsConnecting(true);
    setStatus("Connecting...");
    setError(null); // Clear previous error
    setMessages([]);
    setAudioLevel(0);
    setVadState("silent");

    try {
      // 1. High-quality mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          volume: 1.0,
        },
      });

      // 2. Clone to 48kHz mono
      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(stream);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      const highQualityStream = destination.stream;

      startAudioVisualizer(highQualityStream);

      // 3. Start session
      const conv = await Conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc",
        audioStream: highQualityStream,

        onConnect: () => {
          setIsConnected(true);
          setStatus("Connected");
          console.log("WebRTC Connected");
        },
        onDisconnect: () => {
          setIsConnected(false);
          setStatus("Disconnected");
        },
        onMessage: (msg) => {
          setMessages(prev => [...prev, { ...msg, timestamp: new Date() }]);
        },
        onError: (err) => {
          console.error("SDK Error:", err);
          setError(err.message || "Connection failed");
          setStatus("Error");
        },
        onStatusChange: (s) => setStatus(typeof s === "object" ? s.status : s),
        onModeChange: (m) => {
          const mode = typeof m === "object" ? m.mode : m;
          setMode(mode);
          if (mode === "speaking") onGlitchIntensity(1);
          else if (mode === "listening") onGlitchIntensity(0);
        },
        onCanSendFeedbackChange: (can) => setCanSendFeedback(can),
      });

      conversationRef.current = conv;

      // 4. Activity pings
      activityIntervalRef.current = setInterval(() => {
        if (conv && vadState === "speaking") {
          conv.sendUserActivity();
        }
      }, 100);

    } catch (err) {
      setError(`Mic access failed: ${err.message}`);
      setStatus("Failed");
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  // === END CONVERSATION ===
  const endConversation = async () => {
    if (conversationRef.current) {
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
      await conversationRef.current.endSession();
    }
    conversationRef.current = null;
    setIsConnected(false);
    setIsRecording(false);
    setStatus("Disconnected");
    setMode("unknown");
    stopAudioVisualizer();
  };

  // === SEND TEXT ===
  const sendUserMessage = () => {
    if (conversationRef.current && userMessage.trim()) {
      conversationRef.current.sendUserMessage(userMessage);
      setMessages(prev => [
        ...prev,
        { source: "user", message: userMessage, timestamp: new Date() }
      ]);
      setUserMessage("");
    }
  };

  // === SEND FEEDBACK ===
  const sendFeedback = (positive) => {
    if (conversationRef.current && canSendFeedback) {
      conversationRef.current.sendFeedback(positive);
    }
  };

  // === CLEANUP ===
  useEffect(() => {
    return () => endConversation();
  }, []);

  // === UI ===
  return (
    <div style={{
      position: "absolute", top: 10, left: 10, zIndex: 10,
      background: "rgba(0,0,0,0.8)", padding: "16px", borderRadius: "12px",
      color: "#fff", fontFamily: "sans-serif", maxWidth: "380px"
    }}>
      <div style={{ marginBottom: "12px" }}>
        <strong>Status:</strong> <span style={{
          color: status === "Connected" ? "#4ade80" : status.includes("Error") ? "#ef4444" : "#94a3b8"
        }}>{status}</span>
      </div>

      {error && <div style={{ color: "#ef4444", marginBottom: "12px" }}>Error: {error}</div>}

      <div style={{ marginBottom: "12px" }}>
        <strong>Mode:</strong> <span style={{
          color: mode === "speaking" ? "#fbbf24" : mode === "listening" ? "#60a5fa" : "#94a3b8"
        }}>
          {mode === "speaking" ? "Agent Speaking" : mode === "listening" ? "Listening..." : mode}
        </span>
      </div>

      {/* Mic + VAD */}
      <div style={{ marginBottom: "12px" }}>
        <strong>Mic:</strong>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "100px", height: "8px", background: "#334155", borderRadius: "4px", overflow: "hidden"
          }}>
            <div style={{
              width: `${Math.min(audioLevel, 100)}%`,
              height: "100%",
              background: audioLevel > 30 ? "#4ade80" : "#94a3b8",
              transition: "width 0.1s"
            }} />
          </div>
          <span style={{ fontSize: "12px" }}>{audioLevel.toFixed(0)}</span>
          <span style={{
            padding: "2px 6px", borderRadius: "4px", fontSize: "11px",
            background: vadState === "speaking" ? "#dc2626" : "#1f2937", color: "#fff"
          }}>
            {vadState === "speaking" ? "Speaking" : "Silent"}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={startConversation}
          disabled={isConnecting || isConnected}
          style={{
            flex: 1, padding: "8px", border: "none", borderRadius: "6px",
            background: isConnecting ? "#64748b" : "#3b82f6", color: "#fff", cursor: "pointer"
          }}
        >
          {isConnecting ? "Connecting..." : "Start"}
        </button>
        <button
          onClick={endConversation}
          disabled={!isConnected}
          style={{
            flex: 1, padding: "8px", border: "none", borderRadius: "6px",
            background: "#ef4444", color: "#fff", cursor: "pointer"
          }}
        >
          Stop
        </button>
      </div>

      {/* Text Input */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input
          type="text"
          value={userMessage}
          onChange={(e) => {
            setUserMessage(e.target.value);
            conversationRef.current?.sendUserActivity?.();
          }}
          onKeyPress={(e) => e.key === "Enter" && sendUserMessage()}
          placeholder="Type or speak..."
          disabled={!isConnected}
          style={{
            flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #475569",
            background: "#1e293b", color: "#fff"
          }}
        />
        <button
          onClick={sendUserMessage}
          disabled={!isConnected || !userMessage.trim()}
          style={{
            padding: "8px 12px", border: "none", borderRadius: "6px",
            background: "#10b981", color: "#fff", cursor: "pointer"
          }}
        >
          Send
        </button>
      </div>

      {/* Feedback */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => sendFeedback(true)}
          disabled={!canSendFeedback}
          style={{
            flex: 1, padding: "6px", border: "none", borderRadius: "6px",
            background: canSendFeedback ? "#10b981" : "#334155", color: "#fff"
          }}
        >
          Positive
        </button>
        <button
          onClick={() => sendFeedback(false)}
          disabled={!canSendFeedback}
          style={{
            flex: 1, padding: "6px", border: "none", borderRadius: "6px",
            background: canSendFeedback ? "#ef4444" : "#334155", color: "#fff"
          }}
        >
          Negative
        </button>
      </div>

      {/* Messages */}
      <div style={{ maxHeight: "200px", overflowY: "auto" }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#94a3b8", textAlign: "center" }}>Say something!</p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: "8px", padding: "8px", borderRadius: "6px",
                background: msg.source === "ai" ? "#1e293b" : "#334155",
                textAlign: msg.source === "ai" ? "left" : "right"
              }}
            >
              <strong style={{ color: msg.source === "ai" ? "#60a5fa" : "#a78bfa" }}>
                {msg.source === "ai" ? "Agent" : "You"}:
              </strong>{" "}
              {msg.message}
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VoiceInterface;