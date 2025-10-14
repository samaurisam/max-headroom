import React from "react";
import Avatar from "./components/Avatar"; // We'll create this
import VoiceInterface from "./components/VoiceInterface"; // We'll create this

function App() {
  return (
    <div
      style={{
        background: "#000",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Avatar />
      <VoiceInterface />
    </div>
  );
}

export default App;
