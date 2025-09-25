const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("./firebase");

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

function fetchWithFallback(url, options = {}) {
  if (typeof global.fetch === "function") {
    return global.fetch(url, options);
  }

  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";
      const requestFn = isHttps ? httpsRequest : httpRequest;
      const method = options.method || "GET";
      const headers = options.headers || {};
      const body = options.body;

      const requestOptions = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers,
      };

      const req = requestFn(requestOptions, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const textBody = buffer.toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            text: async () => textBody,
            json: async () => {
              if (!textBody) {
                return {};
              }

              try {
                return JSON.parse(textBody);
              } catch (error) {
                throw new Error(
                  `Failed to parse JSON response: ${error.message}`,
                );
              }
            },
          });
        });
      });

      req.on("error", reject);

      if (body) {
        req.write(body);
      }

      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function verifyAuth(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1];
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Failed to verify ID token", error);
    return null;
  }
}

function formatStatus(status) {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function postSlackMessage(channel, payload) {
  if (!SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  const response = await fetchWithFallback("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel,
      unfurl_links: false,
      unfurl_media: false,
      ...payload,
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

  return body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!db) {
    const firebaseErrorText = missingFirebaseEnvVars.length
      ? `Missing Firebase configuration. Please set ${missingFirebaseEnvVars.join(", ")} in the environment.`
      : firebaseInitError?.message || "Firebase configuration error. See server logs for details.";
    console.error("Firebase Admin SDK is not initialized", firebaseInitError);
    res.status(500).json({ error: `Firebase configuration error: ${firebaseErrorText}` });
    return;
  }

  let payload = req.body;
  if (!payload || typeof payload !== "object") {
    try {
      payload = JSON.parse(req.body || "{}");
    } catch (error) {
      res.status(400).json({ error: "Invalid JSON payload" });
      return;
    }
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const brandCode = typeof payload.brandCode === "string" ? payload.brandCode.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  const adGroupId = typeof payload.adGroupId === "string" ? payload.adGroupId.trim() : "";
  const adGroupName = typeof payload.adGroupName === "string" ? payload.adGroupName.trim() : "";
  const adGroupUrl = typeof payload.url === "string" ? payload.url.trim() : "";

  if (!brandCode) {
    res.status(400).json({ error: "brandCode is required" });
    return;
  }

  if (!status || !["designed", "reviewed"].includes(status)) {
    res.status(400).json({ error: "Unsupported status" });
    return;
  }

  try {
    const snap = await db
      .collection("slackChannelMappings")
      .where("brandCode", "==", brandCode)
      .get();

    if (snap.empty) {
      res.status(200).json({ ok: true, message: "No Slack channel connected for this brand." });
      return;
    }

    const statusLabel = formatStatus(status);
    const identifier = adGroupName || adGroupId || "an ad group";
    const baseText = `Ad group *${identifier}* for brand *${brandCode}* is now *${statusLabel}*.`;
    const linkText = adGroupUrl ? ` <${adGroupUrl}|View details>` : "";
    const text = `${baseText}${linkText}`;

    const results = [];
    for (const doc of snap.docs) {
      try {
        const response = await postSlackMessage(doc.id, { text });
        results.push({ channel: doc.id, ok: true, ts: response.ts });
      } catch (error) {
        console.error("Failed to post Slack message", error);
        results.push({ channel: doc.id, ok: false, error: error.message });
      }
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length && failed.length === results.length) {
      res.status(502).json({ error: "Failed to post Slack message", results });
      return;
    }

    res.status(200).json({ ok: true, results });
  } catch (error) {
    console.error("Slack status update error", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};
