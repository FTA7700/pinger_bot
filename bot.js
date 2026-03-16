const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

/* =========================
   ENV VARIABLES (Render)
========================= */

const TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID = process.env.THREAD_ID;

if (!TOKEN) {
  console.log("DISCORD_TOKEN missing");
  process.exit(1);
}

if (!THREAD_ID) {
  console.log("THREAD_ID missing");
  process.exit(1);
}

/* =========================
   CONFIG
========================= */

const HEALTH_URL =
  "https://predictionsproject.onrender.com/api/health";

const CHECK_INTERVAL = 30000; // 30s

/* =========================
   STATE MEMORY
========================= */

let lastStatus = null;
let onlineSince = null;

/* =========================
   DISCORD CLIENT
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* =========================
   HELPERS
========================= */

function buildThreadName(status) {
  return status === "ONLINE"
    ? "🟢 Predictions: Online"
    : "🔴 Predictions: Offline";
}

/* =========================
   HEALTH CHECK
========================= */

async function checkHealth() {

  let currentStatus = "OFFLINE";

  try {
    const res = await axios.get(HEALTH_URL, { timeout: 5000 });

    if (res.status === 200) {
      currentStatus = "ONLINE";
    }
  } catch {}

  // uptime tracking (internal only)
  if (currentStatus === "ONLINE" && !onlineSince) {
    onlineSince = Date.now();
  }

  if (currentStatus === "OFFLINE") {
    onlineSince = null;
  }

  // ZERO-DUPLICATE UPDATE
  if (currentStatus === lastStatus) {
    return;
  }

  lastStatus = currentStatus;

  console.log("Status changed →", currentStatus);

  try {

    const thread = await client.channels.fetch(THREAD_ID);

    if (!thread) {
      console.log("Thread not found");
      return;
    }

    const newName = buildThreadName(currentStatus);

    await thread.setName(newName);

    console.log("Thread renamed →", newName);

  } catch (err) {
    console.log("Rename error:", err.message);
  }
}

/* =========================
   READY EVENT
========================= */

client.once("ready", async () => {

  console.log("Bot connected:", client.user.tag);

  try {

    const thread = await client.channels.fetch(THREAD_ID);

    if (!thread) {
      console.log("Thread fetch failed");
      return;
    }

    console.log("Monitoring thread:", thread.name);

    // start monitor loop
    setInterval(checkHealth, CHECK_INTERVAL);

    await checkHealth();

  } catch (err) {
    console.log("READY ERROR:", err.message);
  }
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
