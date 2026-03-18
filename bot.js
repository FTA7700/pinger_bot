require("dotenv").config();

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID     = process.env.THREAD_ID;
const MESSAGE_ID    = process.env.MESSAGE_ID;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const HEALTH_URL    = "https://predictionsproject.onrender.com/api/health";
const HISTORY_FILE  = path.join(process.env.GITHUB_WORKSPACE || ".", "history.json");
const MAX_HISTORY   = 30;

if (!DISCORD_TOKEN || !THREAD_ID || !MESSAGE_ID) {
  console.error("Missing required env vars: DISCORD_TOKEN, THREAD_ID, MESSAGE_ID");
  process.exit(1);
}

function setupFont() {
  const reg  = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"].find(f => fs.existsSync(f));
  const bold = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"].find(f => fs.existsSync(f));
  if (reg)  registerFont(reg,  { family: "UI", weight: "normal" });
  if (bold) registerFont(bold, { family: "UI", weight: "bold" });
}

function formatDuration(seconds) {
  seconds = Math.floor(seconds);
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hrs  = Math.floor(seconds / 3600);  seconds %= 3600;
  const mins = Math.floor(seconds / 60);    seconds %= 60;
  const p = [];
  if (days) p.push(`${days}d`);
  if (hrs)  p.push(`${hrs}h`);
  if (mins) p.push(`${mins}m`);
  if (seconds || p.length === 0) p.push(`${seconds}s`);
  return p.join(" ");
}

async function pingService() {
  const start = Date.now();
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    const duration = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    console.log(`Ping: ${res.status} in ${duration}ms`);
    return { status: ok ? 1 : 0, duration, date: Math.floor(Date.now() / 1000) };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`Ping failed: ${err.message}`);
    return { status: 0, duration, date: Math.floor(Date.now() / 1000) };
  }
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    }
  } catch (e) {
    console.log("No history file, starting fresh");
  }
  return [];
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function computeStats(history, currentCheck) {
  const all = [currentCheck, ...history].slice(0, MAX_HISTORY);
  const isOnline     = currentCheck.status === 1;
  const responseTime = currentCheck.duration;
  const successful   = all.filter(h => h.status === 1).length;
  const uptimePct    = all.length > 0 ? ((successful / all.length) * 100).toFixed(1) : "N/A";
  const incidents    = all.filter(h => h.status !== 1);
  const lastIncident = incidents[0];

  let continuousUptime;
  if (!isOnline) {
    continuousUptime = "Offline";
  } else if (!lastIncident) {
    const oldest = all[all.length - 1];
    continuousUptime = oldest ? formatDuration(Date.now() / 1000 - oldest.date) + "+" : "N/A";
  } else {
    continuousUptime = formatDuration(Date.now() / 1000 - lastIncident.date);
  }

  const [latest, previous] = all;
  return {
    isOnline, responseTime, uptimePct, continuousUptime,
    incidentCount: incidents.length,
    lastIncidentTs: lastIncident?.date ?? null,
    justWentDown:  latest && previous && latest.status !== 1 && previous.status === 1,
    justRecovered: latest && previous && latest.status === 1 && previous.status !== 1,
    history: all
  };
}

function generateImage({ isOnline, continuousUptime, responseTime, uptimePct, incidentCount, lastIncidentTs, history }) {
  const W = 520, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const BG    = "#2b2d31";
  const GREEN = "#23a55a";
  const RED   = "#da373c";
  const TEXT  = "#f2f3f5";
  const MUTED = "#80848e";

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const dotColor = isOnline ? GREEN : RED;
  const statusText = isOnline ? "Online" : "Offline";

  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(W / 2, 34, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = TEXT;
  ctx.font = "bold 28px UI";
  ctx.textAlign = "center";
  ctx.fillText(statusText, W / 2, 72);

  ctx.fillStyle = dotColor;
  ctx.font = "bold 14px UI";
  ctx.fillText(`${uptimePct}% uptime`, W / 2, 94);

  ctx.fillStyle = MUTED;
  ctx.font = "12px UI";
  ctx.fillText(`${continuousUptime}  ·  ${responseTime}ms`, W / 2, 114);

  const count  = Math.min(history.length, MAX_HISTORY);
  const recent = history.slice(0, count).reverse();
  const bx = 20, by = 128, bw = W - 40, bh = 44;
  const barW = Math.floor((bw - (count - 1) * 3) / count);

  recent.forEach((h, i) => {
    const barH = h.status === 1 ? bh : Math.floor(bh * 0.3);
    const x    = bx + i * (barW + 3);
    const y    = by + (bh - barH);
    ctx.fillStyle = h.status === 1 ? GREEN : RED;
    ctx.fillRect(x, y, barW, barH);
  });

  ctx.fillStyle = MUTED;
  ctx.font = "10px UI";
  ctx.textAlign = "left";
  ctx.fillText(`${count} checks ago`, bx, by + bh + 14);
  ctx.textAlign = "right";
  ctx.fillText("now", bx + bw, by + bh + 14);
  ctx.textAlign = "center";

  const incidentText = incidentCount === 0
    ? "No incidents recorded"
    : `${incidentCount} incident${incidentCount > 1 ? "s" : ""} · last ${formatDuration(Date.now() / 1000 - lastIncidentTs)} ago`;
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.fillText(incidentText, W / 2, 210);

  const buf = canvas.toBuffer("image/png");
  console.log(`Image buffer: ${buf.length} bytes`);
  return buf;
}

async function run() {
  setupFont();

  const history      = loadHistory();
  const currentCheck = await pingService();
  const data         = computeStats(history, currentCheck);
  saveHistory(data.history);

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
    const imgBuffer   = generateImage(data);
    const attachment  = new AttachmentBuilder(imgBuffer, { name: "status.png" });
    const statusEmoji = data.isOnline ? "🟢" : "🔴";
    const statusText  = data.isOnline ? "Online" : "Offline";

    const thread  = await client.channels.fetch(THREAD_ID);
    const message = await thread.messages.fetch(MESSAGE_ID);
    const edited  = await message.edit({ content: "", files: [attachment], attachments: [], embeds: [] });
    console.log(`Edited: ${edited.id}, attachments: ${edited.attachments.size}`);
    await thread.setName(`${statusEmoji} Predictions: ${statusText}`);
    console.log(`Done — ${statusText}, uptime: ${data.continuousUptime}, ${data.uptimePct}%`);

    if (CHANNEL_ID && (data.justWentDown || data.justRecovered)) {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (data.justWentDown)  await channel.send("🔴 @here **Predictions service is DOWN!**");
      if (data.justRecovered) await channel.send("🟢 **Predictions service has recovered.**");
    }
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

run().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
