require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const THREAD_ID       = process.env.THREAD_ID;
const MESSAGE_ID      = process.env.MESSAGE_ID;
const CRONJOB_API_KEY = process.env.CRONJOB_API_KEY;
const CRONJOB_JOB_ID  = process.env.CRONJOB_JOB_ID;

if (!DISCORD_TOKEN || !THREAD_ID || !MESSAGE_ID || !CRONJOB_API_KEY || !CRONJOB_JOB_ID) {
  console.error("Missing environment variables.");
  process.exit(1);
}

/* ===============================
   CRON-JOB.ORG API
================================ */

async function fetchJobData() {
  const headers = {
    "Authorization": `Bearer ${CRONJOB_API_KEY}`,
    "Content-Type": "application/json"
  };

  // Fetch job details + history in parallel
  const [jobRes, historyRes] = await Promise.all([
    fetch(`https://api.cron-job.org/jobs/${CRONJOB_JOB_ID}`, { headers }),
    fetch(`https://api.cron-job.org/jobs/${CRONJOB_JOB_ID}/history?count=50`, { headers })
  ]);

  const jobData     = await jobRes.json();
  const historyData = await historyRes.json();

  const history = historyData.history ?? [];

  // Latest check
  const latest = history[0];
  const isOnline = latest?.status === 1; // 1 = success on cron-job.org

  // Uptime % from last 50 checks
  const successful = history.filter(h => h.status === 1).length;
  const uptimePct  = history.length > 0
    ? ((successful / history.length) * 100).toFixed(1)
    : "N/A";

  // Last incident = last failed check
  const lastIncident = history.find(h => h.status !== 1);
  let lastIncidentStr = "No incidents recorded";
  if (lastIncident) {
    const d = new Date(lastIncident.date * 1000);
    lastIncidentStr = `<t:${Math.floor(lastIncident.date)}:R>`;
  }

  return { isOnline, uptimePct, lastIncidentStr };
}

/* ===============================
   DISCORD UPDATE
================================ */

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(DISCORD_TOKEN);

  // Wait for ready
  await new Promise(resolve => client.once("clientReady", resolve));
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const [thread, { isOnline, uptimePct, lastIncidentStr }] = await Promise.all([
      client.channels.fetch(THREAD_ID),
      fetchJobData()
    ]);

    const message = await thread.messages.fetch(MESSAGE_ID);

    const statusEmoji = isOnline ? "🟢" : "🔴";
    const statusText  = isOnline ? "Online" : "Offline";
    const embedColor  = isOnline ? 0x2ecc71 : 0xe74c3c;

    const embed = new EmbedBuilder()
      .setTitle("Predictions Service Status")
      .addFields(
        { name: "Status",        value: `${statusEmoji} Predictions: ${statusText}` },
        { name: "Uptime (50 checks)", value: `${uptimePct}%`, inline: true },
        { name: "Last Incident", value: lastIncidentStr, inline: true },
        { name: "Status Page",   value: "https://1hys9555.status.cron-job.org/" }
      )
      .setColor(embedColor)
      .setTimestamp();

    await Promise.all([
      message.edit({ embeds: [embed] }),
      thread.setName(`${statusEmoji} Predictions: ${statusText}`)
    ]);

    console.log(`Done — status: ${statusText}, uptime: ${uptimePct}%`);
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

run();
