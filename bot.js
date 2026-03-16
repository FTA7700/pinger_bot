console.log("BOT PROCESS STARTED");

const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

// ===============================
// ENVIRONMENT VARIABLES
// ===============================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID = process.env.THREAD_ID;

if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN missing");
  process.exit(1);
}

if (!THREAD_ID) {
  console.error("THREAD_ID missing");
  process.exit(1);
}

// ===============================
// CONFIG
// ===============================

const HEALTH_URL =
  "https://predictionsproject.onrender.com/api/health";

const CHECK_INTERVAL = 30000; // 30 seconds

// ===============================
// STATE MEMORY
// ===============================

let lastStatus = null;
let threadChannel = null;

// ===============================
// DISCORD CLIENT
// ===============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===============================
// HEALTH CHECK
// ===============================

async function checkHealth() {

  let currentStatus = "OFFLINE";

  try {
    const res = await axios.get(HEALTH_URL, { timeout: 5000 });

    if (res.status === 200) {
      currentStatus = "ONLINE";
    }
  } catch {}

  // ---- ZERO DUPLICATE UPDATER ----
  if (currentStatus === lastStatus) {
    return;
  }

  lastStatus = currentStatus;

  const newName =
    currentStatus === "ONLINE"
      ? "🟢 Predictions: Online"
      : "🔴 Predictions: Offline";

  try {
    await threadChannel.setName(newName);
    console.log("Thread renamed →", newName);
  } catch (err) {
    console.log("Rename error:", err.message);
  }
}

// ===============================
// READY EVENT
// ===============================

client.once("ready", async () => {

  console.log("Bot connected:", client.user.tag);

  try {
    console.log("Fetching thread:", THREAD_ID);

    threadChannel = await client.channels.fetch(THREAD_ID);

    if (!threadChannel) {
      console.log("Thread not found");
      return;
    }

    console.log("Thread found:", threadChannel.name);

    // start monitor
    setInterval(checkHealth, CHECK_INTERVAL);

    await checkHealth();

    console.log("Health monitor started");

  } catch (err) {
    console.log("READY ERROR:", err.message);
  }

});

// ===============================
// LOGIN
// ===============================

client.login(DISCORD_TOKEN);
