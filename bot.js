require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const THREAD_ID       = process.env.THREAD_ID;
const MESSAGE_ID      = process.env.MESSAGE_ID;
const CHANNEL_ID      = process.env.CHANNEL_ID;
const CRONJOB_API_KEY = process.env.CRONJOB_API_KEY;
const CRONJOB_JOB_ID  = process.env.CRONJOB_JOB_ID;

if (!DISCORD_TOKEN || !THREAD_ID || !MESSAGE_ID || !CRONJOB_API_KEY || !CRONJOB_JOB_ID) {
  console.error("Missing environment variables.");
  process.exit(1);
}

/* ===============================
   UPTIME DURATION FORMATTER
================================ */

function formatDuration(seconds) {
  seconds = Math.floor(seconds);
  const days    = Math.floor(seconds / 86400); seconds %= 86400;
  const hours   = Math.floor(seconds / 3600);  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);    seconds %= 60;

  const parts = [];
  if (days)    parts.push(`${days}d`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/* ===============================
   CHART IMAGE GENERATOR
================================ */

async function generateChart(history, count = 30) {
  const recent = history.slice(0, count).reverse();

  const labels    = recent.map((_, i) => i === recent.length - 1 ? "now" : "");
  const colors    = recent.map(h => h.status === 1 ? "#23a55a" : "#da373c");
  const heights   = recent.map(h => h.status === 1 ? 100 : 40);

  const width  = 520;
  const height = 80;

  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: "#2b2d31" });

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: heights,
        backgroundColor: colors,
        borderRadius: 2,
        borderSkipped: "bottom",
        barPercentage: 0.85,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: 110 }
      },
      layout: { padding: { top: 4, bottom: 4, left: 4, right: 4 } }
    }
  };

  return chart.renderToBuffer(config);
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

  const isOnline     = job.lastStatus === 1;
  const responseTime = job.lastDuration ?? null;

  const successful = history.filter(h => h.status === 1).length;
  const uptimePct  = history.length > 0
    ? ((successful / history.length) * 100).toFixed(1)
    : "N/A";

  const incidents     = history.filter(h => h.status !== 1);
  const incidentCount = incidents.length;
  const lastIncident  = incidents[0];

  let continuousUptime;
  if (!isOnline) {
    continuousUptime = "Offline";
  } else if (!lastIncident) {
    const oldest = history[history.length - 1];
    continuousUptime = oldest
      ? formatDuration(Date.now() / 1000 - oldest.date) + "+"
      : "N/A";
  } else {
    continuousUptime = formatDuration(Date.now() / 1000 - lastIncident.date);
  }

  const incidentStr = incidentCount === 0
    ? "None"
    : `${incidentCount} total · last <t:${lastIncident.date}:R>`;

  const [latest, previous] = history;
  const justWentDown  = latest && previous && latest.status !== 1 && previous.status === 1;
  const justRecovered = latest && previous && latest.status === 1 && previous.status !== 1;

  return {
    isOnline, responseTime, uptimePct, continuousUptime,
    incidentStr, justWentDown, justRecovered, history
  };
}

/* ===============================
   DISCORD UPDATE
================================ */

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timeout")), 15000);
    client.once("ready", () => { clearTimeout(timeout); resolve(); });
    client.login(DISCORD_TOKEN).catch(reject);
  });

  console.log(`Logged in as ${client.user.tag}`);

  try {
    const [thread, data] = await Promise.all([
      client.channels.fetch(THREAD_ID),
      fetchJobData()
    ]);

    const {
      isOnline, responseTime, uptimePct, continuousUptime,
      incidentStr, justWentDown, justRecovered, history
    } = data;

    const [message, chartBuffer] = await Promise.all([
      thread.messages.fetch(MESSAGE_ID),
      generateChart(history, 30)
    ]);

    const statusEmoji = isOnline ? "🟢" : "🔴";
    const statusText  = isOnline ? "Online" : "Offline";
    const embedColor  = isOnline ? 0x23a55a : 0xda373c;
    const responseStr = responseTime != null ? `${responseTime}ms` : "N/A";

    const attachment = new AttachmentBuilder(chartBuffer, { name: "status_chart.png" });

    const embed = new EmbedBuilder()
      .setTitle("Predictions Service Status")
      .addFields(
        { name: "Status",        value: `${statusEmoji} Predictions: ${statusText}` },
        { name: "Uptime",        value: continuousUptime, inline: true },
        { name: "Response Time", value: responseStr,      inline: true },
        { name: "Uptime %",      value: `${uptimePct}%`,  inline: true },
        { name: "Incidents",     value: incidentStr },
        { name: "Status Page",   value: "https://1hys9555.status.cron-job.org/" }
      )
      .setImage("attachment://status_chart.png")
      .setColor(embedColor)
      .setTimestamp();

    await Promise.all([
      message.edit({ embeds: [embed], files: [attachment] }),
      thread.setName(`${statusEmoji} Predictions: ${statusText}`)
    ]);

    console.log(`Done — ${statusText}, uptime: ${continuousUptime}, ${uptimePct}%`);

    if (CHANNEL_ID && (justWentDown || justRecovered)) {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (justWentDown) {
        await channel.send(`🔴 @here **Predictions service is DOWN!**`);
      } else if (justRecovered) {
        await channel.send(`🟢 **Predictions service has recovered.**`);
      }
    }

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
