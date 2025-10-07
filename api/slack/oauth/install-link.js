const { randomBytes } = require("crypto");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("../firebase");

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI;
const SLACK_DEFAULT_SCOPES = process.env.SLACK_INSTALL_SCOPES || "commands,chat:write";

function buildAuthorizeUrl({ clientId, redirectUri, scopes, state }) {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const missingSlackEnv = [];
  if (!SLACK_CLIENT_ID) missingSlackEnv.push("SLACK_CLIENT_ID");
  if (!SLACK_REDIRECT_URI) missingSlackEnv.push("SLACK_REDIRECT_URI");

  if (missingSlackEnv.length) {
    console.error("Missing Slack OAuth configuration", missingSlackEnv);
    res.status(500).json({ error: "Slack OAuth not configured" });
    return;
  }

  if (!db) {
    const firebaseErrorText = missingFirebaseEnvVars.length
      ? `Missing Firebase configuration. Please set ${missingFirebaseEnvVars.join(", ")} in the environment.`
      : firebaseInitError?.message || "Firebase configuration error. See server logs for details.";
    console.error("Firebase Admin SDK is not initialized", firebaseErrorText);
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  const state = randomBytes(16).toString("hex");

  try {
    await db.collection("slackOauthStates").doc(state).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      redirectUri: SLACK_REDIRECT_URI,
      used: false,
    });
  } catch (error) {
    console.error("Failed to store Slack OAuth state", error);
    res.status(500).json({ error: "Failed to prepare OAuth state" });
    return;
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId: SLACK_CLIENT_ID,
    redirectUri: SLACK_REDIRECT_URI,
    scopes: SLACK_DEFAULT_SCOPES,
    state,
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ url: authorizeUrl });
};
