// server/index.js
const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); // ← Dynamic import

const app = express();
app.use(cors());
app.use(express.json());

const XI_API_KEY =
  "4a603640df2e412f4c2e45687695120caa9c7b19b7c33d938af929d91902dfdc"; // ← Replace with your real key
const AGENT_ID = "agent_7801k81mnfw2e3qbwfw7cs4vhde5";

app.get("/agents", async (req, res) => {
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/agents", {
      headers: { "xi-api-key": XI_API_KEY },
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/token", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/agents/${AGENT_ID}/conversations`,
      {
        method: "POST",
        headers: {
          "xi-api-key": XI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }

    res.json({ conversationToken: data.token });
  } catch (error) {
    console.error("Token error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(4000, () => {
  console.log("Token server running on http://localhost:4000");
});
