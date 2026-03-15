console.log("===== NEW BOT VERSION LOADED v2 =====");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL =
  "https://predictionsproject.onrender.com/api/health";

const CHECK_INTERVAL = 30000;

// ---- memory ----

let lastStatus = null;

// ---- discord client ----

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---- render keepalive server ----

const app = express();

app.get("/", (req, res) => {
  res.send("Bot running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server active");
});

// ---- health check ----

async function checkHealth() {

  let currentStatus = "OFFLINE";

  try {

    const res = await axios.get(API_URL, { timeout: 5000 });

    if (res.status === 200) {
      currentStatus = "ONLINE";
    }

  } catch {}

  // only react when status changes

  if (currentStatus === lastStatus) {
    return;
  }

  lastStatus = currentStatus;

  console.log("Status changed →", currentStatus);

  const thread = await client.channels.fetch(CHANNEL_ID);

  const newName =
    currentStatus === "ONLINE"
      ? "🟢 Predictions: Online"
      : "🔴 Predictions: Offline";

  await thread.setName(newName);

  console.log("Thread renamed →", newName);
}

// ---- bot ready ----

client.once("ready", async () => {

  console.log("Bot connected:", client.user.tag);

  setInterval(checkHealth, CHECK_INTERVAL);

  checkHealth();
});

// ---- login ----

client.login(TOKEN);
