require("dotenv").config();

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

// Register a font that actually exists on Ubuntu
function setupFont() {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  let regular = null, bold = null;
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      if (!regular && !f.includes("Bold")) { regular = f; }
      if (!bold && f.includes("Bold")) { bold = f; }
    }
  }
  if (!regular) {
    // Find any ttf
    try {
      const found = execSync("find /usr/share/fonts -name '*.ttf' | head -2").toString().trim().split("\n");
      regular = found[0] || null;
      bold = found[1] || found[0] || null;
    } catch(e) {}
  }
  if (regular) {
    registerFont(regular, { family: "UI", weight: "normal" });
    console.log(`Font registered: ${regular}`);
  }
  if (bold) {
    registerFont(bold, { family: "UI", weight: "bold" });
    console.log(`Bold font registered: ${bold}`);
  }
  return !!regular;
}

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

function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function generateImage({ isOnline, continuousUptime, responseTime, uptimePct, incidentCount, lastIncidentTs, history }) {
  const W = 520, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const BG      = "#2b2d31";
  const CARD_BG = "#1e1f22";
  const GREEN   = "#23a55a";
  const RED     = "#da373c";
  const TEXT    = "#f2f3f5";
  const MUTED   = "#80848e";
  const DIVIDER = "#3b3d44";
  const LINK    = "#00a8fc";

  fillRoundRect(ctx, 0, 0, W, H, 10, BG);

  // Status dot
  ctx.save();
  ctx.fillStyle = isOnline ? GREEN : RED;
  ctx.beginPath();
  ctx.arc(24, 28, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Title
  ctx.save();
  ctx.fillStyle = TEXT;
  ctx.font = "bold 15px UI";
  ctx.fillText(`Predictions: ${isOnline ? "Online" : "Offline"}`, 38, 33);
  ctx.restore();

  // Timestamp
  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.textAlign = "right";
  ctx.fillText("updated just now", W - 20, 33);
  ctx.restore();

  // Stat cards
  const cards = [
    { label: "Uptime",   value: continuousUptime,                              color: TEXT  },
    { label: "Response", value: responseTime != null ? `${responseTime}ms` : "N/A", color: TEXT  },
    { label: "Uptime %", value: `${uptimePct}%`,                               color: GREEN }
  ];
  const cardW = 148, cardH = 48, cardY = 48, gap = 8, x0 = 16;
  cards.forEach((c, i) => {
    const x = x0 + i * (cardW + gap);
    fillRoundRect(ctx, x, cardY, cardW, cardH, 6, CARD_BG);

    ctx.save();
    ctx.fillStyle = MUTED;
    ctx.font = "11px UI";
    ctx.fillText(c.label, x + 10, cardY + 16);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = c.color;
    ctx.font = "bold 14px UI";
    ctx.fillText(c.value, x + 10, cardY + 36);
    ctx.restore();
  });

  // Chart label
  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.fillText("Last 30 checks", 16, 118);
  ctx.restore();

  // Bars
  const count  = 30;
  const recent = history.slice(0, count).reverse();
  const bx = 16, by = 124, bw = W - 32, bh = 36;
  const barW = Math.floor((bw - (count - 1) * 3) / count);

  recent.forEach((h, i) => {
    const barH = h.status === 1 ? bh : Math.floor(bh * 0.35);
    const x    = bx + i * (barW + 3);
    const y    = by + (bh - barH);
    fillRoundRect(ctx, x, y, barW, barH, 2, h.status === 1 ? GREEN : RED);
  });

  // Axis labels
  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = "10px UI";
  ctx.fillText("30 checks ago", 16, 174);
  ctx.textAlign = "right";
  ctx.fillText("now", W - 16, 174);
  ctx.restore();

  // Divider
  ctx.save();
  ctx.strokeStyle = DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 180);
  ctx.lineTo(W - 16, 180);
  ctx.stroke();
  ctx.restore();

  // Footer
  const incidentText = incidentCount === 0
    ? "No incidents recorded"
    : `${incidentCount} incident${incidentCount > 1 ? "s" : ""} · last ${formatDuration(Date.now() / 1000 - lastIncidentTs)} ago`;

  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.fillText(incidentText, 16, 194);
  ctx.fillStyle = LINK;
  ctx.textAlign = "right";
  ctx.fillText("status page →", W - 16, 194);
  ctx.restore();

  const buf = canvas.toBuffer("image/png");
  console.log(`Image buffer: ${buf.length} bytes`);
  return buf;
}

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
  const successful   = history.filter(h => h.status === 1).length;
  const uptimePct    = history.length > 0 ? ((successful / history.length) * 100).toFixed(1) : "N/A";
  const incidents    = history.filter(h => h.status !== 1);
  const lastIncident = incidents[0];

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
  return {
    isOnline, responseTime, uptimePct, continuousUptime,
    incidentCount: incidents.length,
    lastIncidentTs: lastIncident?.date ?? null,
    justWentDown:  latest && previous && latest.status !== 1 && previous.status === 1,
    justRecovered: latest && previous && latest.status === 1 && previous.status !== 1,
    history
  };
}

async function run() {
  const fontOk = setupFont();
  console.log(`Font setup: ${fontOk ? "ok" : "no font found"}`);

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

    if (SETUP_MODE) {
      const forumChannel = await client.channels.fetch(FORUM_CHANNEL_ID);
      const thread = await forumChannel.threads.create({
        name: `${statusEmoji} Predictions: ${statusText}`,
        message: { files: [attachment] }
      });
      const starterMessage = await thread.fetchStarterMessage();
      console.log("=== SETUP COMPLETE ===");
      console.log(`THREAD_ID=${thread.id}`);
      console.log(`MESSAGE_ID=${starterMessage.id}`);
    } else {
      const thread  = await client.channels.fetch(THREAD_ID);
      const message = await thread.messages.fetch(MESSAGE_ID);
      await Promise.all([
        message.edit({ content: "", files: [attachment], attachments: [], embeds: [] }),
        thread.setName(`${statusEmoji} Predictions: ${statusText}`)
      ]);
      console.log(`Done — ${statusText}, uptime: ${data.continuousUptime}, ${data.uptimePct}%`);

      if (CHANNEL_ID && (data.justWentDown || data.justRecovered)) {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (data.justWentDown)  await channel.send("🔴 @here **Predictions service is DOWN!**");
        if (data.justRecovered) await channel.send("🟢 **Predictions service has recovered.**");
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
