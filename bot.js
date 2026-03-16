client.once("ready", async () => {

  console.log("Bot connected:", client.user.tag);

  try {

    console.log("Fetching thread:", THREAD_ID);

    const thread = await client.channels.fetch(THREAD_ID);

    if (!thread) {
      console.log("Thread fetch returned NULL");
      return;
    }

    console.log("Thread found:", thread.name);

    // start monitoring loop
    console.log("Starting health monitor...");

    setInterval(checkHealth, CHECK_INTERVAL);

    await checkHealth();

    console.log("Health monitor started");

  } catch (err) {
    console.log("READY ERROR:", err.message);
  }

});
