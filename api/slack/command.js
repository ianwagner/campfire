const { createHmac, timingSafeEqual } = require("crypto");
const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const FIREBASE_CLIENT_EMAIL =
  process.env.FIREBASE_CLIENT_EMAIL ||
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
  process.env.GOOGLE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY =
  process.env.FIREBASE_PRIVATE_KEY ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_PRIVATE_KEY;

const missingFirebaseEnvVars = [
  !FIREBASE_PROJECT_ID ? "FIREBASE_PROJECT_ID" : null,
  !FIREBASE_CLIENT_EMAIL ? "FIREBASE_CLIENT_EMAIL" : null,
  !FIREBASE_PRIVATE_KEY ? "FIREBASE_PRIVATE_KEY" : null,
].filter(Boolean);

let firebaseInitError;

if (!admin.apps.length) {
  if (missingFirebaseEnvVars.length) {
    firebaseInitError = new Error(
      `Missing Firebase Admin environment variables: ${missingFirebaseEnvVars.join(", ")}`
    );
    console.error("Firebase Admin SDK initialization error:", firebaseInitError.message);
  } else {
    try {
      const normalizedPrivateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: normalizedPrivateKey,
        }),
        projectId: FIREBASE_PROJECT_ID,
      });
    } catch (error) {
      firebaseInitError = error;
      console.error("Firebase Admin SDK initialization error", error);
    }
  }
}

const db = admin.apps.length ? admin.firestore() : null;

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getHeader(req, header) {
  const value = req.headers[header];
  return Array.isArray(value) ? value[0] : value;
}

function verifySlackSignature({ rawBody, timestamp, signature }) {
  if (!SLACK_SIGNING_SECRET) {
    throw new Error("SLACK_SIGNING_SECRET is not configured");
  }

  if (!timestamp || !signature) {
    return false;
  }

  const ts = Number(timestamp);
  if (Number.isNaN(ts)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60 * 5) {
    return false;
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed = `v0=${createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(baseString)
    .digest("hex")}`;

  const signatureBuffer = Buffer.from(signature, "utf8");
  const computedBuffer = Buffer.from(computed, "utf8");
  if (signatureBuffer.length !== computedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, computedBuffer);
}

function sendEphemeral(res, text) {
  res.status(200).json({
    response_type: "ephemeral",
    text,
  });
}

async function postSlackResponse(responseUrl, text) {
  if (!responseUrl) {
    console.error("Missing response_url; unable to send Slack response", text);
    return;
  }

  try {
    const response = await fetch(responseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        response_type: "ephemeral",
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `Failed to send delayed Slack response: ${response.status} ${body}`
      );
    }
  } catch (error) {
    console.error("Error sending delayed Slack response", error);
  }
}

async function handleConnect(params) {
  const brandCode = params.args[0]?.trim();
  if (!brandCode) {
    return "Please provide a brand code. Usage: /campfire connect BRANDCODE";
  }

  const channelId = params.channelId;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docData = {
    brandCode,
    workspaceId: params.workspaceId,
    connectedBy: params.userId,
    connectedAt: now,
    updatedAt: now,
  };

  if (params.channelName) {
    docData.channelName = params.channelName;
  }

  await db.collection("slackChannelMappings").doc(channelId).set(docData, { merge: true });

  return `Connected this channel to brand ${brandCode}.`;
}

async function handleStatus(params) {
  const snap = await db.collection("slackChannelMappings").doc(params.channelId).get();
  if (!snap.exists) {
    return "not connected.";
  }

  const data = snap.data();
  const brand = data?.brandCode;
  if (!brand) {
    return "not connected.";
  }

  return `This channel is connected to brand ${brand}.`;
}

async function handleDisconnect(params) {
  await db.collection("slackChannelMappings").doc(params.channelId).delete();
  return "Disconnected this channel from any brand.";
}

async function handleTest(params) {
  const snap = await db.collection("slackChannelMappings").doc(params.channelId).get();
  if (!snap.exists) {
    return "Channel is not connected.";
  }

  const data = snap.data();
  const brand = data?.brandCode;
  if (!brand) {
    return "Channel is not connected.";
  }

  if (!SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel: params.channelId,
      text: `Campfire test message for brand ${brand}.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack API error: ${response.status} ${body}`);
  }

  const body = await response.json();
  if (!body.ok) {
    throw new Error(`Slack API error: ${body.error || "unknown_error"}`);
  }

  return `Posted a test message for brand ${brand}.`;
}

async function dispatchCommand(command, params) {
  switch (command) {
    case "connect":
      return handleConnect(params);
    case "status":
      return handleStatus(params);
    case "disconnect":
      return handleDisconnect(params);
    case "test":
      return handleTest(params);
    default:
      return "Unknown command. Available commands: connect, status, disconnect, test.";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const rawBodyBuffer = await readRawBody(req);
    const rawBody = rawBodyBuffer.toString("utf8");

    const timestamp = getHeader(req, "x-slack-request-timestamp");
    const signature = getHeader(req, "x-slack-signature");

    const isValidSignature = verifySlackSignature({
      rawBody,
      timestamp,
      signature,
    });

    if (!isValidSignature) {
      sendEphemeral(
        res,
        "Slack signature verification failed; please re-check the signing secret."
      );
      return;
    }

    if (!db) {
      const firebaseErrorText = missingFirebaseEnvVars.length
        ? `Missing Firebase configuration. Please set ${missingFirebaseEnvVars.join(", ")} in the environment.`
        : firebaseInitError?.message || "Firebase configuration error. See server logs for details.";
      console.error("Firebase Admin SDK is not initialized", firebaseInitError);
      sendEphemeral(res, `Firebase configuration error: ${firebaseErrorText}`);
      return;
    }

    const params = new URLSearchParams(rawBody);
    const text = (params.get("text") || "").trim();
    const channelId = params.get("channel_id");
    const channelName = params.get("channel_name") || undefined;
    const userId = params.get("user_id") || "";
    const workspaceId = params.get("team_id") || "";
    const responseUrl = params.get("response_url") || "";

    if (!channelId) {
      sendEphemeral(res, "Error: Missing channel information in Slack payload.");
      return;
    }

    const args = text ? text.split(/\s+/).filter(Boolean) : [];
    const command = args.shift()?.toLowerCase();

    if (!command) {
      sendEphemeral(
        res,
        "Please provide a subcommand. Available commands: connect, status, disconnect, test."
      );
      return;
    }

    const acknowledgementText = `Processing /campfire ${command}...`;
    sendEphemeral(res, acknowledgementText);

    (async () => {
      try {
        const message = await dispatchCommand(command, {
          args,
          channelId,
          channelName,
          userId,
          workspaceId,
        });

        await postSlackResponse(responseUrl, message);
      } catch (error) {
        console.error("Slack command error", error);
        const errorMessage = `Error: ${error.message || String(error)}`;
        await postSlackResponse(responseUrl, errorMessage);
      }
    })();
    return;
  } catch (error) {
    console.error("Slack command error", error);
    if (!res.headersSent) {
      res.status(200).json({
        response_type: "ephemeral",
        text: `Error: ${error.message || String(error)}`,
      });
    }
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
