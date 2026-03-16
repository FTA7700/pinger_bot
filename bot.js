require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const MESSAGE_ID = process.env.MESSAGE_ID;

if (!TOKEN || !THREAD_ID || !MESSAGE_ID) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

console.log("BOT PROCESS STARTED");

/* ===============================
   UPTIME FORMATTER
================================ */

function formatUptime(seconds) {
  seconds = Math.floor(seconds);

  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/* ===============================
   STATUS UPDATE LOOP
================================ */

async function startMonitor() {
  console.log("Fetching thread:", THREAD_ID);

  const thread = await client.channels.fetch(THREAD_ID);

  if (!thread) {
    console.error("Thread not found");
    return;
  }

  console.log("Thread found:", thread.name);

  const message = await thread.messages.fetch(MESSAGE_ID);

  if (!message) {
    console.error("Message not found");
    return;
  }

  console.log("Status message located");

  async function updateStatus() {
    try {
      const uptime = formatUptime(process.uptime());

      const embed = new EmbedBuilder()
        .setTitle("Predictions Service Status")
        .addFields(
          {
            name: "Status",
            value: "🟢 Predictions: Online"
          },
          {
            name: "Uptime",
            value: uptime,
            inline: true
          },
          {
            name: "Status Page",
            value: "https://m76wrx70.status.cron-job.org/"
          }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      await message.edit({ embeds: [embed] });

      // also update thread title
      await thread.setName("🟢 Predictions: Online");

      console.log("Status updated");
    } catch (err) {
      console.error("Update failed:", err.message);
    }
  }

  // run immediately
  await updateStatus();

  // update every 60 seconds
  setInterval(updateStatus, 60 * 1000);

  console.log("Health monitor started");
}

/* ===============================
   CLIENT READY
================================ */

client.once("clientReady", async () => {
  console.log(`Bot connected: ${client.user.tag}`);
  startMonitor();
});

client.login(TOKEN);
