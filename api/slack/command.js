export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  // Slack will POST here when you run /campfire in a channel
  res.status(200).send("Campfire slash command endpoint is alive ✅");
}
