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

  const [jobRes, historyRes] = await Promise.all([
    fetch(`https://api.cron-job.org/jobs/${CRONJOB_JOB_ID}`, { headers }),
    fetch(`https://api.cron-job.org/jobs/${CRONJOB_JOB_ID}/history`, { headers })
  ]);

  if (!jobRes.ok) throw new Error(`Job API error: ${jobRes.status}`);
  if (!historyRes.ok) throw new Error(`History API error: ${historyRes.status}`);

  const jobData     = await jobRes.json();
  const historyData = await historyRes.json();

  const job     = jobData.jobDetails;
  const history = historyData.history ?? [];

  const isOnline = job.lastStatus === 1;

  const successful = history.filter(h => h.status === 1).length;
  const uptimePct  = history.length > 0
    ? ((successful / history.length) * 100).toFixed(1)
    : "N/A";

  const lastIncident = history.find(h => h.status !== 1);
  const lastIncidentStr = lastIncident
    ? `<t:${lastIncident.date}:R>`
    : "No incidents recorded";

  return { isOnline, uptimePct, lastIncidentStr };
}

/* ===============================
   DISCORD UPDATE
================================ */

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Wait for ready with a timeout fallback
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timeout")), 15000);
    client.once("ready", () => {
      clearTimeout(timeout);
      resolve();
    });
    client.login(DISCORD_TOKEN).catch(reject);
  });

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
        { name: "Uptime",        value: `${uptimePct}%`, inline: true },
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

run().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
