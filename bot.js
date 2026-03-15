const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL =
  "https://predictionsproject.onrender.com/api/health";

const STATUS_PAGE =
  "https://m76wrx70.status.cron-job.org/";

const CHECK_INTERVAL = 30000;

// ---- state memory ----

let lastStatus = null;
let onlineSince = null;
let statusMessage = null;

// ---- discord client ----

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---- web server for Render ----

const app = express();

app.get("/", (req, res) => {
  res.send("Bot running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server active");
});

// ---- uptime formatter ----

function formatUptime(ms) {
  if (!ms) return "0s";

  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  return `${h}h ${m}m ${s}s`;
}

// ---- build embed ----

function buildEmbed(status) {

  const uptime = status === "ONLINE"
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
        inline: false
      },
      {
        name: "Uptime",
        value: uptime,
        inline: true
      },
      {
        name: "Status Page",
        value: STATUS_PAGE,
        inline: true
      }
    )
    .setTimestamp();
}

// ---- health check ----

async function checkHealth() {

  let currentStatus = "OFFLINE";

  try {

    const res = await axios.get(API_URL, { timeout: 5000 });

    if (res.status === 200) {
      currentStatus = "ONLINE";
    }

  } catch {}

  if (currentStatus === "ONLINE" && !onlineSince) {
    onlineSince = Date.now();
  }

  if (currentStatus === "OFFLINE") {
    onlineSince = null;
  }

  // zero-duplicate logic

  if (currentStatus === lastStatus) {
    return;
  }

  lastStatus = currentStatus;

  console.log("Status changed →", currentStatus);

  const embed = buildEmbed(currentStatus);

  await statusMessage.edit({ embeds: [embed] });
}

// ---- bot ready ----

client.once("ready", async () => {

  console.log("Bot connected:", client.user.tag);

  const channel = await client.channels.fetch(CHANNEL_ID);

  const messages = await channel.messages.fetch({ limit: 20 });

  statusMessage = messages.find(
    m => m.author.id === client.user.id
  );

  if (!statusMessage) {

    const embed = buildEmbed("OFFLINE");

    statusMessage = await channel.send({
      embeds: [embed]
    });

    console.log("Created status message");

  } else {

    console.log("Reusing existing status message");

  }

  // start monitoring loop

  setInterval(checkHealth, CHECK_INTERVAL);

  checkHealth();

});

// ---- login ----

client.login(TOKEN);
