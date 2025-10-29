// src/components/VoiceInterface.jsx
import React, { useRef, useEffect, useState, useCallback } from "react";
import { Conversation } from "@elevenlabs/client";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPaperPlane, faStop, faPlay } from '@fortawesome/free-solid-svg-icons';

const VoiceInterface = ({
  onConversationStart,
  onShowMain,
  onGlitchIntensity,
  onSpeechIntensity,
  agentId,
}) => {
  const conversationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafIdRef = useRef(null);
  const streamRef = useRef(null);
  const lastSpeechRef = useRef(0);
  const activityIntervalRef = useRef(null);
  const micPulseClickRef = useRef(null);

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
  const [error, setError] = useState(null);
  const [showControls, setShowControls] = useState(false);

  const AGENT_ID = agentId || "agent_7801k81mnfw2e3qbwfw7cs4vhde5";
  const VAD_THRESHOLD = 28;
  const VAD_HOLD_MS = 400;
  const VAD_SILENCE_MS = 900;

  // MicPulse: Click + Spacebar support
  const MicPulse = ({ audioLevel }) => {
    const level = Math.min(Math.max(audioLevel / 100, 0), 1);
    const scale = 1 + level * 2;
    const isActive = isConnected || isConnecting;

    const handleClick = useCallback(async () => {
      if (isConnected || isConnecting) return;

      if (onShowMain) onShowMain();
      await new Promise(r => setTimeout(r, 150));
      startConversation();
    }, [isConnected, isConnecting, onShowMain]);

    useEffect(() => {
      micPulseClickRef.current = handleClick;
    }, [handleClick]);

    return (
      <div
        onPointerDown={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Start conversation"
        style={{
          position: "fixed",
          bottom: 24,
          right: 60,
          zIndex: 2147483647,
          width: 120,
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isActive ? "default" : "pointer",
          touchAction: "manipulation",
          userSelect: "none",
          background: "transparent",
          outline: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "none",
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#fff",
            transform: `scale(${scale})`,
            transition: "transform 50ms linear",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: isActive ? 1 : 0.4,
          }}
        >
          <FontAwesomeIcon
            icon={isActive ? faMicrophone : faPlay}
            style={{ color: "#ccc", fontSize: "16px" }}
          />
        </div>
      </div>
    );
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat && micPulseClickRef.current) {
        e.preventDefault();
        micPulseClickRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const Captions = ({ messages }) => {
    const agentMessages = messages.filter(msg => msg.source === "ai");
    const latestAgentMessage = agentMessages.length > 0 ? agentMessages[agentMessages.length - 1] : null;

    return (
      <div style={{
        position: "fixed",
        bottom: 24,
        left: 0,
        zIndex: 1000,
        width: "100%",
        height: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "#fff",
      }}>
        <div style={{ maxHeight: "200px", overflowY: "auto" }}>
          {latestAgentMessage ? (
            <div style={{
              borderRadius: "4px",
              background: "#1e293b",
              textAlign: "center",
              padding: "20px",
              lineHeight: "1.4",
              fontFamily: "sans-serif",
              width: "45vw",
              height: "auto",
              fontSize: "20px",
              overflow: "hidden",
            }}>
              {latestAgentMessage.message}
            </div>
          ) : ""}
        </div>
      </div>
    );
  };

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

  const startConversation = async () => {
    if (isConnecting || conversationRef.current) return;
    setIsConnecting(true);
    setStatus("Connecting...");
    setError(null);
    setMessages([]);
    setAudioLevel(0);
    setVadState("silent");

    try {
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

      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(stream);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      const highQualityStream = destination.stream;

      startAudioVisualizer(highQualityStream);

      const conv = await Conversation.startSession({
        agentId: AGENT_ID,
        connectionType: "webrtc",
        audioStream: highQualityStream,

        onConnect: () => {
          setIsConnected(true);
          setIsConnecting(false);
          setStatus("Connected");
          console.log("WebRTC Connected");
        },
        onDisconnect: () => {
          setIsConnected(false);
          setStatus("Disconnected");
          onGlitchIntensity(0);
          if (onSpeechIntensity) onSpeechIntensity(0);
        },
        onMessage: (msg) => {
          setMessages(prev => [...prev, { ...msg, timestamp: new Date() }]);
        },
        onError: (err) => {
          console.error("SDK Error:", err);
          setError(err.message || "Connection failed");
          setStatus("Error");
          setIsConnecting(false);
        },
        onStatusChange: (s) => setStatus(typeof s === "object" ? s.status : s),
        onModeChange: (m) => {
          const newMode = typeof m === "object" ? m.mode : m;
          setMode(newMode);

          const isSpeaking = newMode === "speaking";

          // CRITICAL FIX: Reset intensities when NOT speaking
          if (isSpeaking) {
            onGlitchIntensity(1);
            if (onSpeechIntensity) onSpeechIntensity(1);
          } else {
            onGlitchIntensity(0);
            if (onSpeechIntensity) onSpeechIntensity(0);
          }

          console.log("[Voice] Mode:", newMode, "→ glitch/speech =", isSpeaking ? 1 : 0);
        },
        onEndOfUtterance: () => {
          console.log("Agent finished speaking → resetting");
          onGlitchIntensity(0);
          if (onSpeechIntensity) onSpeechIntensity(0);
        },
        onCanSendFeedbackChange: (can) => setCanSendFeedback(can),
      });

      conversationRef.current = conv;

      if (onConversationStart) onConversationStart();

      activityIntervalRef.current = setInterval(() => {
        if (conv && vadState === "speaking") {
          conv.sendUserActivity();
        }
      }, 100);

    } catch (err) {
      setError(`Mic access failed: ${err.message}`);
      setStatus("Failed");
      setIsConnecting(false);
      console.error(err);
    }
  };

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
    onGlitchIntensity(0);
    if (onSpeechIntensity) onSpeechIntensity(0);
  };

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

  useEffect(() => {
    return () => endConversation();
  }, []);

  return (
    <>
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 10,
        background: "rgba(0,0,0,0.8)", padding: "16px", borderRadius: "12px",
        color: "#fff", fontFamily: "sans-serif", maxWidth: "380px",
        display: showControls ? "block" : "none"
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

        <button
          onClick={() => setShowControls(v => !v)}
          style={{
            width: "100%", padding: "6px", border: "none", borderRadius: "6px",
            background: "#475569", color: "#fff", fontSize: "12px"
          }}
        >
          {showControls ? "Hide" : "Show"} Controls
        </button>
      </div>

      <Captions messages={messages} />
      <MicPulse audioLevel={audioLevel} />
    </>
  );
};

export default VoiceInterface;