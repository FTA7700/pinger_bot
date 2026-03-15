const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const TOKEN = process.env.BOT_TOKEN;
const THREAD_ID = "1482085188702965942";

const ENDPOINT =
  "https://predictionsproject.onrender.com/api/health";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function checkStatus() {
  try {
    const start = Date.now();

    await axios.get(ENDPOINT, { timeout: 8000 });

    const latency = Date.now() - start;

    const thread = await client.channels.fetch(THREAD_ID);

    await thread.setName(`🟢 API Online (${latency}ms)`);

    console.log("API OK");
  } catch (err) {
    const thread = await client.channels.fetch(THREAD_ID);

    await thread.setName("🔴 API Offline");

    console.log("API DOWN");
  }
}

client.once("ready", () => {
  console.log("Bot started");

  checkStatus();
  setInterval(checkStatus, 60000);
});

client.login(TOKEN);
