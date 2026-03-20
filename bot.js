require("dotenv").config();

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
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
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  let loaded = 0;
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      GlobalFonts.registerFromPath(f, "UI");
      loaded++;
    }
  }
  console.log(`Fonts loaded: ${loaded}`);
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
  const W = 520, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const BG    = "#2b2d31";
  const GREEN = "#23a55a";
  const RED   = "#da373c";
  const TEXT  = "#f2f3f5";
  const MUTED = "#80848e";
  const DIM   = "#4e5058";

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const dotColor = isOnline ? GREEN : RED;
  const statusText = isOnline ? "Online" : "Offline";

  // Status dot + text (left aligned)
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(22, 26, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = TEXT;
  ctx.font = "bold 28px UI";
  ctx.textAlign = "left";
  ctx.fillText(statusText, 40, 36);

  // Labels row
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.fillText("Last check  |  Uptime", 20, 60);

  // Values row
  const lastCheckDate = new Date(history[0].date * 1000);
  const timeStr = lastCheckDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" });
  ctx.fillStyle = TEXT;
  ctx.font = "bold 20px UI";
  ctx.fillText(`${timeStr}  `, 20, 84);
  const timeWidth = ctx.measureText(`${timeStr}  `).width;
  ctx.fillStyle = DIM;
  ctx.font = "18px UI";
  ctx.fillText("|  ", 20 + timeWidth, 84);
  const sepWidth = ctx.measureText("|  ").width;
  ctx.fillStyle = TEXT;
  ctx.font = "bold 20px UI";
  ctx.fillText(continuousUptime, 20 + timeWidth + sepWidth, 84);

  const count  = Math.min(history.length, MAX_HISTORY);
  const recent = history.slice(0, count).reverse();
  const bx = 20, by = 98, bw = W - 40, bh = 68;

  // Red incident columns
  recent.forEach((h, i) => {
    if (h.status !== 1) {
      const x = bx + (i / Math.max(recent.length - 1, 1)) * bw;
      ctx.fillStyle = "rgba(218,55,60,0.35)";
      ctx.fillRect(x - 5, by, 10, bh);
    }
  });

  // Y positions based on response time
  const validTimes = recent.filter(h => h.status === 1).map(h => h.duration);
  const maxTime = validTimes.length > 0 ? Math.max(...validTimes) * 1.2 : 1000;

  const pts = recent.map((h, i) => ({
    x: bx + (i / Math.max(recent.length - 1, 1)) * bw,
    y: h.status === 1 ? by + bh - (h.duration / maxTime) * (bh - 6) : null
  }));

  // Filled gradient area
  const grad = ctx.createLinearGradient(0, by, 0, by + bh);
  grad.addColorStop(0, "rgba(35,165,90,0.5)");
  grad.addColorStop(1, "rgba(35,165,90,0.02)");

  ctx.beginPath();
  let areaStarted = false;
  pts.forEach(p => {
    if (!p.y) { areaStarted = false; return; }
    if (!areaStarted) { ctx.moveTo(p.x, by + bh); ctx.lineTo(p.x, p.y); areaStarted = true; }
    else ctx.lineTo(p.x, p.y);
  });
  if (areaStarted) {
    const lastValid = [...pts].reverse().find(p => p.y);
    if (lastValid) ctx.lineTo(lastValid.x, by + bh);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Line on top
  ctx.beginPath();
  let lineStarted = false;
  pts.forEach(p => {
    if (!p.y) { lineStarted = false; return; }
    if (!lineStarted) { ctx.moveTo(p.x, p.y); lineStarted = true; }
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Last check timestamp (right side)
  ctx.fillStyle = MUTED;
  ctx.font = "10px UI";
  ctx.textAlign = "right";
  ctx.fillText(`last check ${timeStr}`, bx + bw, by + bh + 13);
  ctx.textAlign = "center";



  const incidentText = incidentCount === 0
    ? "No incidents recorded"
    : `${incidentCount} incident${incidentCount > 1 ? "s" : ""} · last ${formatDuration(Date.now() / 1000 - lastIncidentTs)} ago`;
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.fillStyle = MUTED;
  ctx.font = "11px UI";
  ctx.textAlign = "left";
  ctx.fillText(incidentText, 20, 193);
  ctx.fillStyle = DIM;
  ctx.textAlign = "right";
  ctx.fillText(`${responseTime}ms`, W - 20, 193);

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
    const attachment  = new AttachmentBuilder(imgBuffer, { name: `status_${Date.now()}.png` });
    const statusEmoji = data.isOnline ? "🟢" : "🔴";
    const statusText  = data.isOnline ? "Online" : "Offline";

    console.log(`Fetching thread: ${THREAD_ID}, message: ${MESSAGE_ID}`);
    const thread  = await client.channels.fetch(THREAD_ID);
    console.log(`Thread name: ${thread.name}`);
    const message = await thread.messages.fetch(MESSAGE_ID);
    console.log(`Message author: ${message.author.tag}, content length: ${message.content.length}`);
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
