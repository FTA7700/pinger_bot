require("dotenv").config();

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require("canvas");

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN;
const THREAD_ID        = process.env.THREAD_ID;
const MESSAGE_ID       = process.env.MESSAGE_ID;
const CHANNEL_ID       = process.env.CHANNEL_ID;
const FORUM_CHANNEL_ID = process.env.FORUM_CHANNEL_ID;
const CRONJOB_API_KEY  = process.env.CRONJOB_API_KEY;
const CRONJOB_JOB_ID   = process.env.CRONJOB_JOB_ID;
const SETUP_MODE       = process.env.SETUP_MODE === "true";

if (!DISCORD_TOKEN || !CRONJOB_API_KEY || !CRONJOB_JOB_ID) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

if (!SETUP_MODE && (!THREAD_ID || !MESSAGE_ID)) {
  console.error("THREAD_ID and MESSAGE_ID required unless SETUP_MODE=true");
  process.exit(1);
}

if (SETUP_MODE && !FORUM_CHANNEL_ID) {
  console.error("FORUM_CHANNEL_ID required for setup mode");
  process.exit(1);
}

/* ===============================
   UPTIME FORMATTER
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
   IMAGE GENERATOR
================================ */

function generateImage({ isOnline, continuousUptime, responseTime, uptimePct, incidentCount, lastIncidentTs, history }) {
  const W = 520, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const BG       = "#2b2d31";
  const CARD_BG  = "#1e1f22";
  const GREEN    = "#23a55a";
  const RED      = "#da373c";
  const TEXT     = "#f2f3f5";
  const MUTED    = "#80848e";
  const DIVIDER  = "#3b3d44";
  const LINK     = "#00a8fc";

  // Background
  ctx.fillStyle = BG;
  roundRect(ctx, 0, 0, W, H, 10);
  ctx.fill();

  // Header — status dot + title + timestamp
  const dotColor = isOnline ? GREEN : RED;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(24, 28, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = TEXT;
  ctx.font = "bold 15px Arial";
  ctx.fillText(`Predictions: ${isOnline ? "Online" : "Offline"}`, 38, 33);

  ctx.fillStyle = MUTED;
  ctx.font = "11px Arial";
  ctx.textAlign = "right";
  ctx.fillText("updated just now", W - 20, 33);
  ctx.textAlign = "left";

  // Stat cards
  const cards = [
    { label: "Uptime",     value: continuousUptime,                     color: TEXT  },
    { label: "Response",   value: responseTime != null ? `${responseTime}ms` : "N/A", color: TEXT  },
    { label: "Uptime %",   value: `${uptimePct}%`,                      color: GREEN }
  ];

  const cardW = 148, cardH = 48, cardY = 48, cardGap = 8, cardX0 = 16;
  cards.forEach((c, i) => {
    const x = cardX0 + i * (cardW + cardGap);
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, cardY, cardW, cardH, 6);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.font = "11px Arial";
    ctx.fillText(c.label, x + 10, cardY + 16);

    ctx.fillStyle = c.color;
    ctx.font = "bold 14px Arial";
    ctx.fillText(c.value, x + 10, cardY + 36);
  });

  // Chart label
  ctx.fillStyle = MUTED;
  ctx.font = "11px Arial";
  ctx.fillText("Last 30 checks", 16, 118);

  // Bar chart
  const count   = 30;
  const recent  = history.slice(0, count).reverse();
  const barZone = { x: 16, y: 124, w: W - 32, h: 36 };
  const barW    = Math.floor((barZone.w - (count - 1) * 3) / count);

  recent.forEach((h, i) => {
    const barH  = h.status === 1 ? barZone.h : Math.floor(barZone.h * 0.35);
    const x     = barZone.x + i * (barW + 3);
    const y     = barZone.y + (barZone.h - barH);
    ctx.fillStyle = h.status === 1 ? GREEN : RED;
    roundRect(ctx, x, y, barW, barH, 2);
    ctx.fill();
  });

  // Chart axis labels
  ctx.fillStyle = MUTED;
  ctx.font      = "10px Arial";
  ctx.fillText("30 checks ago", 16, 174);
  ctx.textAlign = "right";
  ctx.fillText("now", W - 16, 174);
  ctx.textAlign = "left";

  // Divider
  ctx.strokeStyle = DIVIDER;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(16, 180);
  ctx.lineTo(W - 16, 180);
  ctx.stroke();

  // Footer
  const incidentText = incidentCount === 0
    ? "No incidents recorded"
    : `${incidentCount} incident${incidentCount > 1 ? "s" : ""} · last ${formatDuration(Date.now() / 1000 - lastIncidentTs)} ago`;

  ctx.fillStyle = MUTED;
  ctx.font = "11px Arial";
  ctx.fillText(incidentText, 16, 194);

  ctx.fillStyle = LINK;
  ctx.textAlign = "right";
  ctx.fillText("status page →", W - 16, 194);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

  const job     = (await jobRes.json()).jobDetails;
  const history = (await historyRes.json()).history ?? [];

  const isOnline     = job.lastStatus === 1;
  const responseTime = job.lastDuration ?? null;

  const successful = history.filter(h => h.status === 1).length;
  const uptimePct  = history.length > 0
    ? ((successful / history.length) * 100).toFixed(1)
    : "N/A";

  const incidents      = history.filter(h => h.status !== 1);
  const incidentCount  = incidents.length;
  const lastIncident   = incidents[0];
  const lastIncidentTs = lastIncident?.date ?? null;

  let continuousUptime;
  if (!isOnline) {
    continuousUptime = "Offline";
  } else if (!lastIncident) {
    const oldest = history[history.length - 1];
    continuousUptime = oldest ? formatDuration(Date.now() / 1000 - oldest.date) + "+" : "N/A";
  } else {
    continuousUptime = formatDuration(Date.now() / 1000 - lastIncident.date);
  }

  const [latest, previous] = history;
  const justWentDown  = latest && previous && latest.status !== 1 && previous.status === 1;
  const justRecovered = latest && previous && latest.status === 1 && previous.status !== 1;

  return {
    isOnline, responseTime, uptimePct, continuousUptime,
    incidentCount, lastIncidentTs, justWentDown, justRecovered, history
  };
}

/* ===============================
   DISCORD
================================ */

async function run() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timeout")), 15000);
    client.once("clientReady", () => { clearTimeout(timeout); resolve(); });
    client.login(DISCORD_TOKEN).catch(reject);
  });

  console.log(`Logged in as ${client.user.tag}`);

  try {
    const data       = await fetchJobData();
    const imgBuffer  = generateImage(data);
    const attachment = new AttachmentBuilder(imgBuffer, { name: "status.png" });

    const statusEmoji = data.isOnline ? "🟢" : "🔴";
    const statusText  = data.isOnline ? "Online" : "Offline";
    const content     = "https://1hys9555.status.cron-job.org/";

    if (SETUP_MODE) {
      const forumChannel = await client.channels.fetch(FORUM_CHANNEL_ID);
      const thread = await forumChannel.threads.create({
        name: `${statusEmoji} Predictions: ${statusText}`,
        message: { content, files: [attachment] }
      });
      const starterMessage = await thread.fetchStarterMessage();
      console.log("=== SETUP COMPLETE ===");
      console.log(`THREAD_ID=${thread.id}`);
      console.log(`MESSAGE_ID=${starterMessage.id}`);
      console.log("Add to GitHub secrets, then set SETUP_MODE=false");
    } else {
      const thread  = await client.channels.fetch(THREAD_ID);
      const message = await thread.messages.fetch(MESSAGE_ID);

      await Promise.all([
        message.edit({ content, files: [attachment], attachments: [] }),
        thread.setName(`${statusEmoji} Predictions: ${statusText}`)
      ]);

      console.log(`Done — ${statusText}, uptime: ${data.continuousUptime}, ${data.uptimePct}%`);

      if (CHANNEL_ID && (data.justWentDown || data.justRecovered)) {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (data.justWentDown) {
          await channel.send("🔴 @here **Predictions service is DOWN!**");
        } else if (data.justRecovered) {
          await channel.send("🟢 **Predictions service has recovered.**");
        }
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
