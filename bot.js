require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const MESSAGE_ID = process.env.MESSAGE_ID;

if (!TOKEN || !THREAD_ID || !MESSAGE_ID) {
  console.error("Missing environment variables");
  process.exit(1);
}

client.once("clientReady", async () => {
  console.log(`Bot connected: ${client.user.tag}`);

  try {
    // Fetch thread
    const thread = await client.channels.fetch(THREAD_ID);
    console.log("Thread found:", thread.name);

    // Fetch EXISTING message
    const message = await thread.messages.fetch(MESSAGE_ID);
    console.log("Existing status message loaded");

    async function updateStatus() {
      const uptime = Math.floor(process.uptime());

      const embed = new EmbedBuilder()
        .setTitle("Predictions Service Status")
        .addFields(
          {
            name: "Status",
            value: "🟢 Predictions: Online"
          },
          {
            name: "Uptime",
            value: `${uptime}s`,
            inline: true
          },
          {
            name: "Status Page",
            value: "https://m76wrx70.status.cron-job.org/"
          }
        )
        .setColor("Green")
        .setTimestamp();

      await message.edit({ embeds: [embed] });

      console.log("Message edited successfully");
    }

    // run immediately
    await updateStatus();

    // repeat every 60s
    setInterval(updateStatus, 60000);

  } catch (err) {
    console.error("Startup error:", err);
  }
});

client.login(TOKEN);
