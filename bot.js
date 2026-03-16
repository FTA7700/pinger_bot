const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

// =====================
// ENV
// =====================

const TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL =
  "https://predictionsproject.onrender.com/api/health";

const STATUS_PAGE =
  "https://m76wrx70.status.cron-job.org/";

const CHECK_INTERVAL = 30000;

// =====================
// STATE
// =====================

let lastStatus = null;
let onlineSince = null;
let statusMessage = null;

// =====================
// CLIENT
// =====================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// =====================
// HELPERS
// =====================

function formatUptime(ms) {
  if (!ms) return "0s";

  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  return `${h}h ${m}m ${s}s`;
}

function buildEmbed(status) {
  const uptime =
    status === "ONLINE"
      ? formatUptime(Date.now() - onlineSince)
      : "0s";

  return new EmbedBuilder()
    .setTitle("Predictions Service Status")
    .setColor(status === "ONLINE" ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      {
        name: "Status",
        value:
          status === "ONLINE"
            ? "🟢 Predictions: Online"
            : "🔴 Predictions: Offline",
      },
      {
        name: "Uptime",
        value: uptime,
        inline: true,
      },
      {
        name: "Status Page",
        value: STATUS_PAGE,
        inline: true,
      }
    )
    .setTimestamp();
}

// =====================
// RENAME CHANNEL / THREAD
// =====================

async function renameChannel(channel, status) {
  const newName =
    status === "ONLINE"
      ? "🟢 API Online"
      : "🔴 API Offline";

  if (channel.name === newName) return;

  try {
    await channel.setName(newName);
    console.log("Channel renamed →", newName);
  } catch (err) {
    console.log("Rename failed:", err.message);
  }
}

// =====================
// HEALTH CHECK
// =====================

async function checkHealth(channel) {
  let currentStatus = "OFFLINE";

  try {
    const res = await axios.get(API_URL, { timeout: 5000 });
    if (res.status === 200) currentStatus = "ONLINE";
  } catch {}

  if (currentStatus === "ONLINE" && !onlineSince) {
    onlineSince = Date.now();
  }

  if (currentStatus === "OFFLINE") {
    onlineSince = null;
  }

  if (currentStatus === lastStatus) return;

  lastStatus = currentStatus;

  console.log("Status changed →", currentStatus);

  // rename thread/channel
  await renameChannel(channel, currentStatus);

  // update embed
  const embed = buildEmbed(currentStatus);

  try {
    await statusMessage.edit({ embeds: [embed] });
  } catch (err) {
    console.log("Edit failed:", err.message);
  }
}

// =====================
// READY
// =====================

client.once("clientReady", async () => {
  console.log("Bot connected:", client.user.tag);

  const channel = await client.channels.fetch(CHANNEL_ID);

  // find existing bot message
  const messages = await channel.messages.fetch({ limit: 20 });

  statusMessage = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      !m.system
  );

  if (!statusMessage) {
    statusMessage = await channel.send({
      embeds: [buildEmbed("OFFLINE")],
    });

    console.log("Created status message");
  } else {
    console.log("Reusing existing message");
  }

  // start monitoring
  setInterval(() => checkHealth(channel), CHECK_INTERVAL);

  checkHealth(channel);
});

// =====================
// LOGIN
// =====================

client.login(TOKEN);
