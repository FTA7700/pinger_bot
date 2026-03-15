const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;
const THREAD_ID = "1482085188702965942";

const HEALTH_URL =
  "https://predictionsproject.onrender.com/api/health";

app.get("/check", async (req, res) => {
  let name = "🔴 API Offline";

  try {
    const response = await axios.get(HEALTH_URL, { timeout: 5000 });

    if (response.status === 200) {
      name = "🟢 API Online";
    }
  } catch {}

  try {
    await axios.patch(
      `https://discord.com/api/v10/channels/${THREAD_ID}`,
      { name },
      {
        headers: {
          Authorization: `Bot ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.log("Discord error:", err.message);
  }

  res.send("done");
});

app.get("/", (req, res) => {
  res.send("running");
});

app.listen(PORT, () => {
  console.log("Server started");
});
