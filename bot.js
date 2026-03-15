const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// --------------------
// Discord Client
// --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --------------------
// Web server (Render requires this)
// --------------------
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

// endpoint cron will ping
app.get("/check", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// --------------------
// Bot Ready Event
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 10 });

    // find existing status message
    let statusMessage = messages.find(m =>
      m.author.id === client.user.id
    );

    if (statusMessage) {
      await statusMessage.edit("🟢 Predictions: Online");
      console.log("Status message updated");
    } else {
      await channel.send("🟢 Predictions: Online");
      console.log("Status message created");
    }

  } catch (err) {
    console.error("Error updating status:", err);
  }
});

// --------------------
client.login(TOKEN);
