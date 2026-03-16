const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

/* ========= ENV ========= */

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

/* ========= CONFIG ========= */

const HEALTH_URL =
  "https://predictionsproject.onrender.com/api/health";

const CHECK_INTERVAL = 30000; // 30 seconds

/* ========= STATE ========= */

let lastStatus = null;

/* ========= DISCORD ========= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* ========= HEALTH CHECK ========= */

async function getStatus() {
  try {
    const res = await axios.get(HEALTH_URL, { timeout: 5000 });
    if (res.status === 200) return "ONLINE";
  } catch {}

  return "OFFLINE";
}

/* ========= UPDATE THREAD ========= */

async function updateThread(status) {
  const thread = await client.channels.fetch(THREAD_ID);

  if (!thread) {
    console.log("Thread not found");
    return;
  }

  const newName =
    status === "ONLINE"
      ? "🟢 Predictions: Online"
      : "🔴 Predictions: Offline";

  if (thread.name === newName) return;

  await thread.setName(newName);

  console.log("Thread renamed →", newName);
}

/* ========= LOOP ========= */

async function checkLoop() {
  const status = await getStatus();

  if (status === lastStatus) return;

  lastStatus = status;

  console.log("Status changed →", status);

  await updateThread(status);
}

/* ========= READY ========= */

client.once("ready", async () => {
  console.log("Bot connected:", client.user.tag);

  try {
    const thread = await client.channels.fetch(THREAD_ID);
    console.log("Monitoring thread:", thread.name);

    await checkLoop();
    setInterval(checkLoop, CHECK_INTERVAL);

  } catch (err) {
    console.error("Startup error:", err.message);
  }
});

/* ========= LOGIN ========= */

client.login(TOKEN);
