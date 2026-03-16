require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const THREAD_ID = process.env.THREAD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let statusMessageId = null;

// ---------- STATUS CHECK ----------
async function getStatus() {
  // replace with your real health check if needed
  return {
    online: true,
    uptime: process.uptime()
  };
}

// ---------- EMBED BUILDER ----------
function buildEmbed(status) {
  return new EmbedBuilder()
    .setTitle('Predictions Service Status')
    .setColor(status.online ? 0x57F287 : 0xED4245)
    .addFields(
      {
        name: 'Status',
        value: status.online
          ? '🟢 Predictions: Online'
          : '🔴 Predictions: Offline'
      },
      {
        name: 'Uptime',
        value: `${Math.floor(status.uptime)}s`
      },
      {
        name: 'Status Page',
        value: 'https://m7owxr70.status.cron-job.org/'
      }
    )
    .setTimestamp();
}

// ---------- UPDATE MESSAGE ----------
async function updateStatus() {
  try {
    const thread = await client.channels.fetch(THREAD_ID);

    if (!thread) {
      console.log('Thread not found');
      return;
    }

    const status = await getStatus();
    const embed = buildEmbed(status);

    // FIRST RUN → create message
    if (!statusMessageId) {
      const msg = await thread.send({ embeds: [embed] });
      statusMessageId = msg.id;
      console.log('Status message created:', statusMessageId);
      return;
    }

    // EDIT EXISTING MESSAGE
    const message = await thread.messages.fetch(statusMessageId);
    await message.edit({ embeds: [embed] });

    console.log('Status message updated');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

// ---------- READY ----------
client.once('clientReady', async () => {
  console.log(`Bot connected: ${client.user.tag}`);

  await updateStatus();

  // update every 60 seconds
  setInterval(updateStatus, 60000);
});

// ---------- LOGIN ----------
client.login(DISCORD_TOKEN);
