const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Keepalive server running");
});

app.listen(PORT, () => {
  console.log("Keepalive server running");
});const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Keepalive server running");
});

app.listen(PORT, () => {
  console.log("Keepalive server running");
});
