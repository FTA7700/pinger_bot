require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* ================================
   CONFIG
================================ */

const STATUS_URL = "https://m76wrx70.status.cron-job.org/";
const CHANNEL_ID = process.env.CHANNEL_ID;
const MESSAGE_ID = process.env.MESSAGE_ID;

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

let lastStatus = null;
let statusMessage = null;
let intervalStarted = false;

/* ================================
   HELPERS
================================ */

async function fetchStatus() {
  try {
    const res = await fetch(STATUS_URL, {
      headers: { "User-Agent": "DiscordStatusBot" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();

    // simple detection (cron-job status pages contain these words)
    if (text.toLowerCase().includes("up")) {
      return "ONLINE";
    }

    return "OFFLINE";
  } catch (err) {
    console.log("Status fetch failed:", err.message);
    return "OFFLINE";
  }
}

function buildEmbed(status) {
  const isOnline = status === "ONLINE";

  return new EmbedBuilder()
    .setTitle("Predictions Service Status")
    .setColor(isOnline ? 0x2ecc71 : 0xe74c3c)
    .addFields({
      name: "Status",
      value: isOnline
        ? "🟢 Predictions: Online"
        : "🔴 Predictions: Offline",
    })
    .setTimestamp(new Date());
}

/* ================================
   CORE HEALTH CHECK
================================ */

async function checkHealth() {
  console.log("Checking health...");

  const status = await fetchStatus();

  if (!statusMessage) {
    const channel = await client.channels.fetch(CHANNEL_ID);
    statusMessage = await channel.messages.fetch(MESSAGE_ID);
    console.log("Reusing existing message");
  }

  // update embed every check
  await statusMessage.edit({
    embeds: [buildEmbed(status)],
  });

  // rename thread ONLY if status changed
  if (status !== lastStatus) {
    const thread = statusMessage.channel;

    const newName =
      status === "ONLINE"
        ? "🟢 Predictions: Online"
        : "🔴 Predictions: Offline";

    try {
      await thread.setName(newName);
      console.log(`Thread renamed → ${newName}`);
    } catch (e) {
      console.log("Thread rename failed:", e.message);
    }

    console.log(`Status changed → ${status}`);
    lastStatus = status;
  } else {
    console.log("Status unchanged");
  }
}

/* ================================
   READY EVENT
================================ */

client.once("clientReady", async () => {
  console.log(`Bot connected: ${client.user.tag}`);

  // run immediately
  await checkHealth();

  // prevent duplicate intervals after reconnects
  if (!intervalStarted) {
    intervalStarted = true;

    setInterval(async () => {
      console.log("Running scheduled health check...");
      await checkHealth();
    }, CHECK_INTERVAL);
  }
});

/* ================================
   LOGIN
================================ */

client.login(process.env.DISCORD_TOKEN);
