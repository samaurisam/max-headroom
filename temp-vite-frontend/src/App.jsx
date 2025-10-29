// src/App.jsx
import React from "react";
import Avatar from "./components/Avatar.jsx";
import { Routes, Route, useParams } from "react-router-dom";
import "./App.css";

// Wrapper component to use useParams
function AvatarWrapper() {
  const { agentId } = useParams();
  return <Avatar agentId={agentId} />;
}

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
      <Routes>
        {/* :agentId? → optional */}
        <Route path="/:agentId?" element={<AvatarWrapper />} />
      </Routes>
    </div>
  );
}

export default App;