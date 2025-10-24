import React, { useState, useEffect, useRef } from 'react';
import { Conversation } from '@elevenlabs/client';
import './App.css';

function App() {
  const [conversation, setConversation] = useState(null);
  const [status, setStatus] = useState('Disconnected');
  const [mode, setMode] = useState('unknown');
  const [messages, setMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [canSendFeedback, setCanSendFeedback] = useState(false);
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [vadState, setVadState] = useState('silent');
  const [isConnecting, setIsConnecting] = useState(false);

  // REPLACE WITH YOUR AGENT ID FROM ELEVENLABS DASHBOARD
  const agentId = 'agent_7801k81mnfw2e3qbwfw7cs4vhde5';

  // VAD Settings
  const VAD_THRESHOLD = 28;
  const VAD_HOLD_MS = 400;
  const VAD_SILENCE_MS = 900;

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafIdRef = useRef(null);
  const streamRef = useRef(null);
  const lastSpeechRef = useRef(0);
  const activityIntervalRef = useRef(null);

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
        if (vadState !== 'speaking') setVadState('speaking');
        conversation?.sendUserActivity?.();
      } else if (vadState === 'speaking' && now - lastSpeechRef.current < VAD_HOLD_MS) {
        // Hold
      } else if (now - lastSpeechRef.current > VAD_SILENCE_MS) {
        if (vadState !== 'silent') setVadState('silent');
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
    if (isConnecting || conversation) return;
    setIsConnecting(true);
    setError(null);
    setMessages([]);
    setAudioLevel(0);
    setVadState('silent');

    try {
      // 1. Get high-quality mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          volume: 1.0,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
        },
      });

      // 2. Clone stream via AudioContext to ensure 48kHz mono
      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(stream);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      const highQualityStream = destination.stream;

      startAudioVisualizer(highQualityStream);

      // 3. Start session
      const conv = await Conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        audioStream: highQualityStream,
        onConnect: () => {
          setStatus('Connected');
          console.log('WebRTC Connected');
        },
        onDisconnect: () => {
          setStatus('Disconnected');
          console.log('Disconnected');
        },
        onMessage: (msg) => {
          console.log('AI Message:', msg);
          setMessages(prev => [...prev, { ...msg, timestamp: new Date() }]);
        },
        onError: (err) => {
          console.error('SDK Error:', err);
          setError(err.message || 'Connection failed');
        },
        onStatusChange: (raw) => {
          const s = typeof raw === 'object' ? raw.status : raw;
          setStatus(s);
        },
        onModeChange: (raw) => {
          const m = typeof raw === 'object' ? raw.mode : raw;
          setMode(m);
          console.log('Mode:', m);
        },
        onCanSendFeedbackChange: (can) => setCanSendFeedback(can),
      });

      setConversation(conv);

      // 4. Aggressive activity pings while speaking
      activityIntervalRef.current = setInterval(() => {
        if (conv && vadState === 'speaking') {
          conv.sendUserActivity();
        }
      }, 100);

    } catch (err) {
      setError('Mic access failed: ' + err.message);
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  // === END CONVERSATION ===
  const endConversation = async () => {
    if (conversation) {
      if (activityIntervalRef.current) clearInterval(activityIntervalRef.current);
      await conversation.endSession();
    }
    setConversation(null);
    setStatus('Disconnected');
    setMode('unknown');
    stopAudioVisualizer();
  };

  // === SEND TEXT ===
  const sendUserMessage = () => {
    console.log('Sending user message:', userMessage);
    if (conversation && userMessage.trim()) {
      conversation.sendUserMessage(userMessage);
      setMessages(prev => [
        ...prev,
        { source: 'user', message: userMessage, timestamp: new Date() }
      ]);
      setUserMessage('');
    }
  };

  // === SEND FEEDBACK ===
  const sendFeedback = (positive) => {
    if (conversation && canSendFeedback) {
      conversation.sendFeedback(positive);
    }
  };

  // === CLEANUP ===
  useEffect(() => {
    return () => endConversation();
  }, []);

  return (
    <div className="app-container">
      <div className="card">
        <h1>ElevenLabs Voice Agent</h1>

        <div className="status-bar">
          <p><strong>Status:</strong> <span className={`status ${status?.toLowerCase()}`}>{status}</span></p>
          <p><strong>Mode:</strong> <span className={`mode ${mode}`}>
            {mode === 'speaking' ? 'Agent Speaking' : mode === 'listening' ? 'Listening...' : mode}
          </span></p>
        </div>

        {error && <div className="error">Error: {error}</div>}

        {/* Mic + VAD */}
        <div className="mic-visualizer">
          <strong>Mic:</strong>
          <div className="level-bar">
            <div className="level-fill" style={{
              width: `${Math.min(audioLevel, 100)}%`,
              background: audioLevel > 30 ? '#4ade80' : '#94a3b8'
            }} />
          </div>
          <span>{audioLevel.toFixed(0)}</span>
          <span className={`vad-badge ${vadState}`}>
            {vadState === 'speaking' ? 'Speaking' : 'Silent'}
          </span>
        </div>

        {/* Controls */}
        <div className="controls">
          <button onClick={startConversation} disabled={isConnecting || !!conversation} className="btn primary">
            {isConnecting ? 'Connecting...' : 'Start'}
          </button>
          <button onClick={endConversation} disabled={!conversation} className="btn danger">
            Stop
          </button>
        </div>

        {/* Text Input */}
        <div className="text-input">
          <input
            type="text"
            value={userMessage}
            onChange={(e) => {
              setUserMessage(e.target.value);
              conversation?.sendUserActivity?.();
            }}
            onKeyPress={(e) => e.key === 'Enter' && sendUserMessage()}
            placeholder="Type or speak..."
            disabled={!conversation}
          />
          <button onClick={sendUserMessage} disabled={!conversation || !userMessage.trim()} className="btn send">
            Send
          </button>
        </div>

        {/* Feedback */}
        <div className="feedback">
          <button onClick={() => sendFeedback(true)} disabled={!canSendFeedback} className="btn positive">
            Positive
          </button>
          <button onClick={() => sendFeedback(false)} disabled={!canSendFeedback} className="btn negative">
            Negative
          </button>
        </div>

        {/* Messages */}
        <div className="messages">
          <h2>Conversation</h2>
          {messages.length === 0 ? (
            <p className="empty">Say something!</p>
          ) : (
            <div className="message-list">
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.source === 'ai' ? 'ai' : 'user'}`}>
                  <strong>{msg.source === 'ai' ? 'Agent' : 'You'}:</strong> {msg.message}
                  <span className="time">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

