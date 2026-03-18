require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

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
   UPTIME BAR
================================ */

function buildUptimeBar(history, length = 20) {
  // Take last `length` checks, oldest first
  const recent = history.slice(0, length).reverse();
  const bar = recent.map(h => h.status === 1 ? "▓" : "░").join("");
  // Pad if fewer than `length` checks exist
  const padded = "░".repeat(Math.max(0, length - recent.length)) + bar;
  return padded;
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

  const isOnline      = job.lastStatus === 1;
  const responseTime  = job.lastDuration ?? null;

  // Uptime % from all history
  const successful  = history.filter(h => h.status === 1).length;
  const uptimePct   = history.length > 0
    ? ((successful / history.length) * 100).toFixed(1)
    : "N/A";

  // Incident count + last incident
  const incidents       = history.filter(h => h.status !== 1);
  const incidentCount   = incidents.length;
  const lastIncident    = incidents[0];
  const lastIncidentStr = lastIncident
    ? `<t:${lastIncident.date}:R>`
    : "None";

  // Uptime bar (last 20 checks)
  const uptimeBar = buildUptimeBar(history, 20);

  // Status flip detection — compare last 2 checks
  const [latest, previous] = history;
  const justWentDown      = latest && previous && latest.status !== 1 && previous.status === 1;
  const justRecovered     = latest && previous && latest.status === 1 && previous.status !== 1;

  return {
    isOnline,
    responseTime,
    uptimePct,
    uptimeBar,
    incidentCount,
    lastIncidentStr,
    justWentDown,
    justRecovered
  };
}

/* ===============================
   DISCORD UPDATE
================================ */

async function run() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
    const [thread, data] = await Promise.all([
      client.channels.fetch(THREAD_ID),
      fetchJobData()
    ]);

    const {
      isOnline,
      responseTime,
      uptimePct,
      uptimeBar,
      incidentCount,
      lastIncidentStr,
      justWentDown,
      justRecovered
    } = data;

    const message      = await thread.messages.fetch(MESSAGE_ID);
    const statusEmoji  = isOnline ? "🟢" : "🔴";
    const statusText   = isOnline ? "Online" : "Offline";
    const embedColor   = isOnline ? 0x2ecc71 : 0xe74c3c;
    const responseStr  = responseTime != null ? `${responseTime}ms` : "N/A";
    const incidentStr  = incidentCount === 0
      ? "None"
      : `${incidentCount} total · last ${lastIncidentStr}`;

    const embed = new EmbedBuilder()
      .setTitle("Predictions Service Status")
      .addFields(
        { name: "Status",         value: `${statusEmoji} Predictions: ${statusText}` },
        { name: "Response Time",  value: responseStr,   inline: true },
        { name: "Uptime",         value: `${uptimePct}%`, inline: true },
        { name: "Last 20 Checks", value: `\`${uptimeBar}\`` },
        { name: "Incidents",      value: incidentStr },
        { name: "Status Page",    value: "https://1hys9555.status.cron-job.org/" }
      )
      .setColor(embedColor)
      .setTimestamp();

    await Promise.all([
      message.edit({ embeds: [embed] }),
      thread.setName(`${statusEmoji} Predictions: ${statusText}`)
    ]);

    console.log(`Done — ${statusText}, uptime: ${uptimePct}%, incidents: ${incidentCount}`);

    // Downtime alert — post in parent channel if CHANNEL_ID is set
    if (CHANNEL_ID && (justWentDown || justRecovered)) {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (justWentDown) {
        await channel.send(`🔴 @here **Predictions service is DOWN!**`);
        console.log("Alert sent: service went down");
      } else if (justRecovered) {
        await channel.send(`🟢 **Predictions service has recovered.**`);
        console.log("Alert sent: service recovered");
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
