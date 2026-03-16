const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// ===== ENV =====

const TOKEN = process.env.BOT_TOKEN;
const THREAD_ID = process.env.THREAD_ID;

if (!TOKEN) {
  console.error("BOT_TOKEN missing");
  process.exit(1);
}

if (!THREAD_ID) {
  console.error("THREAD_ID missing");
  process.exit(1);
}

// ===== CONFIG =====

const API_URL =
  "https://predictionsproject.onrender.com/api/health";

const CHECK_INTERVAL = 30000; // 30s

// ===== STATE =====

let lastStatus = null;

// ===== DISCORD CLIENT =====

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ===== HEALTH CHECK =====

async function getStatus() {
  try {
    const res = await axios.get(API_URL, { timeout: 5000 });

    if (res.status === 200) {
      return "ONLINE";
    }
  } catch {}

  return "OFFLINE";
}

// ===== THREAD UPDATE =====

async function updateThreadName(status) {
  const channel = await client.channels.fetch(THREAD_ID);

  if (!channel) {
    console.log("Thread not found");
    return;
  }

  const newName =
    status === "ONLINE"
      ? "🟢 Predictions: Online"
      : "🔴 Predictions: Offline";

  if (channel.name === newName) return;

  await channel.setName(newName);

  console.log("Thread renamed →", newName);
}

// ===== LOOP =====

async function checkLoop() {
  const status = await getStatus();

  if (status === lastStatus) return;

  lastStatus = status;

  await updateThreadName(status);
}

// ===== READY =====

client.once("clientReady", () => {
  console.log("Bot connected:", client.user.tag);

  checkLoop();
  setInterval(checkLoop, CHECK_INTERVAL);
});

// ===== LOGIN =====

client.login(TOKEN);
