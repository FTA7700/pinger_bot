const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

// ================= CONFIG =================

const TOKEN = process.env.BOT_TOKEN;
const THREAD_ID = "1482085188702965942";

const API_URL =
  "https://predictionsproject.onrender.com/api/health";

const STATUS_PAGE =
  "https://m76wrx70.status.cron-job.org/";

const CHECK_INTERVAL = 30000; // 30s

// ================= STATE =================

let lastStatus = null;
let onlineSince = null;
let statusMessage = null;

// ================= DISCORD =================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ================= HELPERS =================

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

// ================= HEALTH CHECK =================

async function checkHealth() {
  let currentStatus = "OFFLINE";

  try {
    const res = await axios.get(API_URL, { timeout: 5000 });

    if (res.status === 200) {
      currentStatus = "ONLINE";
    }
  } catch {}

  // uptime tracking
  if (currentStatus === "ONLINE" && !onlineSince) {
    onlineSince = Date.now();
  }

  if (currentStatus === "OFFLINE") {
    onlineSince = null;
  }

  // ZERO-DUPLICATE SMART UPDATE
  if (currentStatus === lastStatus) return;

  lastStatus = currentStatus;

  console.log("Status changed →", currentStatus);

  const thread = await client.channels.fetch(THREAD_ID);

  // rename thread
  const newName =
    currentStatus === "ONLINE"
      ? "🟢 Predictions: Online"
      : "🔴 Predictions: Offline";

  await thread.setName(newName);

  // update embed
  const embed = buildEmbed(currentStatus);
  await statusMessage.edit({ embeds: [embed] });
}

// ================= READY =================

client.once("ready", async () => {
  console.log("Bot connected:", client.user.tag);

  const thread = await client.channels.fetch(THREAD_ID);

  const messages = await thread.messages.fetch({ limit: 20 });

  statusMessage = messages.find(
    (m) => m.author.id === client.user.id
  );

  if (!statusMessage) {
    statusMessage = await thread.send({
      embeds: [buildEmbed("OFFLINE")],
    });

    console.log("Created status message");
  } else {
    console.log("Reusing existing message");
  }

  setInterval(checkHealth, CHECK_INTERVAL);
  checkHealth();
});

// ================= START =================

client.login(TOKEN);
