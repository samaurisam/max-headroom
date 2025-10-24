import { useEffect, useState } from "react";
import { useConversation } from "@elevenlabs/react";

export default function App() {
  const [text, setText] = useState("");
  const [log, setLog] = useState([]);
  const push = (r, t) => setLog((L) => [...L, { id: crypto.randomUUID(), r, t }]);

  const {
    startSession, endSession, status, isSpeaking,
    sendUserMessage, sendUserActivity, setMicMuted,
  } = useConversation({
    agentId: "agent_7801k81mnfw2e3qbwfw7cs4vhde5",
    connectionType: "webrtc",
    onMessage: (m) => push(m?.role || "agent", m?.text || JSON.stringify(m)),
    onError: (e) => push("error", e?.message || String(e)),
  });

  useEffect(() => {
    // auto-start for testing; you can bind to a button instead
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        await startSession();
      } catch (e) { push("error", e.message); }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h3>Public Agent — WebRTC</h3>
      <p>Status: <b>{status}</b> {isSpeaking ? "• speaking" : ""}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMicMuted(false)}>Mic On</button>
        <button onClick={() => setMicMuted(true)}>Mic Off</button>
        <button onClick={() => endSession()}>End</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); sendUserActivity(); }}
          onKeyDown={(e) => e.key === "Enter" && (sendUserMessage(text), push("user", text), setText(""))}
          placeholder="Type and press Enter (requires text enabled)"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <button onClick={() => (sendUserMessage(text), push("user", text), setText(""))}>
          Send
        </button>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #eee", padding: 12, borderRadius: 8, height: 320, overflow: "auto" }}>
        {log.map(m => (
          <div key={m.id} style={{ marginBottom: 6 }}>
            <b style={{ opacity: 0.65 }}>{m.r}:</b> {m.t}
          </div>
        ))}
      </div>
    </div>
  );
}
