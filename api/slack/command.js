const { createHmac, timingSafeEqual } = require("crypto");
const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("./firebase");
const { normalizeAudience: normalizeAudienceValue } = require("./audience");

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
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
                  `Failed to parse JSON response: ${error.message}`
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
    const response = await fetchWithFallback(responseUrl, {
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

function normalizeBrandCode(value) {
  return value.trim().toUpperCase();
}

function uniqueNormalizedBrands(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalizeBrandCode(trimmed);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function getExistingBrandCodes(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  const candidates = [];

  if (Array.isArray(data.brandCodesNormalized)) {
    candidates.push(...data.brandCodesNormalized);
  }

  if (Array.isArray(data.brandCodes)) {
    candidates.push(...data.brandCodes);
  }

  if (typeof data.brandCodeNormalized === "string") {
    candidates.push(data.brandCodeNormalized);
  }

  if (typeof data.brandCode === "string") {
    candidates.push(data.brandCode);
  }

  return uniqueNormalizedBrands(candidates);
}

function formatBrandList(brands) {
  return brands.join(", ");
}

async function handleConnect(params) {
  const argList = Array.isArray(params.args) ? params.args : [];
  const rawBrandText = argList.join(" ").trim();

  if (!rawBrandText) {
    return "Please provide at least one brand code. Usage: /campfire connect BRANDCODE[, BRANDCODE2...]";
  }

  const requestedBrandCodes = uniqueNormalizedBrands(
    rawBrandText
      .split(",")
      .flatMap((segment) =>
        segment
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean)
      )
  );

  if (!requestedBrandCodes.length) {
    return "Please provide at least one brand code. Usage: /campfire connect BRANDCODE[, BRANDCODE2...]";
  }

  const channelId = params.channelId;
  const docRef = db.collection("slackChannelMappings").doc(channelId);
  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : null;
  const existingBrands = getExistingBrandCodes(existingData);
  const newBrands = requestedBrandCodes.filter(
    (code) => !existingBrands.includes(code)
  );
  const updatedBrands = uniqueNormalizedBrands([
    ...existingBrands,
    ...requestedBrandCodes,
  ]);

  if (!newBrands.length) {
    const connectedList = formatBrandList(existingBrands);

    if (requestedBrandCodes.length === 1) {
      const requestedBrand = requestedBrandCodes[0];
      return connectedList
        ? `This channel is already connected to brand ${requestedBrand}. Connected brands: ${connectedList}.`
        : `This channel is already connected to brand ${requestedBrand}.`;
    }

    return connectedList
      ? `All requested brands are already connected. Connected brands: ${connectedList}.`
      : "Channel is already connected to the requested brands.";
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const docData = {
    brandCode: updatedBrands[0] || requestedBrandCodes[0],
    brandCodeNormalized: updatedBrands[0] || requestedBrandCodes[0],
    brandCodes: updatedBrands,
    brandCodesNormalized: updatedBrands,
    workspaceId: params.workspaceId,
    updatedAt: now,
  };

  if (params.channelName) {
    docData.channelName = params.channelName;
  }

  if (!existingBrands.length) {
    docData.connectedAt = now;
    docData.connectedBy = params.userId;
  } else {
    docData.lastUpdatedAt = now;
    docData.lastUpdatedBy = params.userId;
  }

  await docRef.set(docData, { merge: true });

  if (!existingBrands.length) {
    if (newBrands.length === 1) {
      return `Connected this channel to brand ${newBrands[0]}.`;
    }

    return `Connected this channel to brands ${formatBrandList(newBrands)}.`;
  }

  const addedList = formatBrandList(newBrands);
  const connectedList = formatBrandList(updatedBrands);

  if (newBrands.length === 1) {
    return `Added brand ${newBrands[0]} to this channel. Connected brands: ${connectedList}.`;
  }

  return `Added brands ${addedList} to this channel. Connected brands: ${connectedList}.`;
}

async function handleStatus(params) {
  const snap = await db.collection("slackChannelMappings").doc(params.channelId).get();
  if (!snap.exists) {
    return "not connected.";
  }

  const data = snap.data();
  const brands = getExistingBrandCodes(data);
  if (!brands.length) {
    return "not connected.";
  }

  if (brands.length === 1) {
    return `This channel is connected to brand ${brands[0]}.`;
  }

  return `This channel is connected to brands ${formatBrandList(brands)}.`;
}

async function handleDisconnect(params) {
  const rawBrandCode = typeof params.args[0] === "string" ? params.args[0].trim() : "";
  const docRef = db.collection("slackChannelMappings").doc(params.channelId);

  if (!rawBrandCode) {
    await docRef.delete();
    return "Disconnected this channel from any brand.";
  }

  const normalizedBrandCode = normalizeBrandCode(rawBrandCode);
  const snap = await docRef.get();

  if (!snap.exists) {
    return "Channel is not connected.";
  }

  const data = snap.data();
  const existingBrands = getExistingBrandCodes(data);

  if (!existingBrands.includes(normalizedBrandCode)) {
    const connectedList = formatBrandList(existingBrands);
    if (connectedList) {
      return `Channel is not connected to brand ${normalizedBrandCode}. Connected brands: ${connectedList}.`;
    }

    return `Channel is not connected to brand ${normalizedBrandCode}.`;
  }

  const updatedBrands = existingBrands.filter((code) => code !== normalizedBrandCode);

  if (!updatedBrands.length) {
    await docRef.delete();
    return `Disconnected brand ${normalizedBrandCode}. This channel is no longer connected to any brands.`;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await docRef.set(
    {
      brandCode: updatedBrands[0],
      brandCodeNormalized: updatedBrands[0],
      brandCodes: updatedBrands,
      brandCodesNormalized: updatedBrands,
      updatedAt: now,
      lastUpdatedAt: now,
      lastUpdatedBy: params.userId,
    },
    { merge: true }
  );

  return `Disconnected brand ${normalizedBrandCode}. Remaining brands: ${formatBrandList(updatedBrands)}.`;
}

async function handleTest(params) {
  const snap = await db.collection("slackChannelMappings").doc(params.channelId).get();
  if (!snap.exists) {
    return "Channel is not connected.";
  }

  const data = snap.data();
  const brands = getExistingBrandCodes(data);
  if (!brands.length) {
    return "Channel is not connected.";
  }

  const requestedBrandRaw = typeof params.args[0] === "string" ? params.args[0].trim() : "";
  const requestedBrand = requestedBrandRaw ? normalizeBrandCode(requestedBrandRaw) : "";

  let brand;

  if (requestedBrand) {
    if (!brands.includes(requestedBrand)) {
      return brands.length
        ? `Channel is not connected to brand ${requestedBrand}. Connected brands: ${formatBrandList(brands)}.`
        : `Channel is not connected to brand ${requestedBrand}.`;
    }

    brand = requestedBrand;
  } else if (brands.length === 1) {
    brand = brands[0];
  } else {
    return `Channel is connected to multiple brands (${formatBrandList(brands)}). Please specify one: /campfire test BRANDCODE.`;
  }

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

const ADMIN_WORKSPACE_ID = "T08QFEF5L7R";

async function handleAudience(params) {
  const docRef = db.collection("slackChannelMappings").doc(params.channelId);
  const snap = await docRef.get();
  const existingData = snap.exists ? snap.data() || {} : {};
  const currentAudience =
    normalizeAudienceValue(existingData.audience) || "external";

  const requested = normalizeAudienceValue(params.args?.[0] || "");

  if (!requested) {
    return `Current audience for this channel is ${currentAudience}. To update, use /campfire audience internal|external.`;
  }

  if (requested === currentAudience) {
    return `Audience is already set to ${requested}.`;
  }

  if (requested === "internal" && params.workspaceId !== ADMIN_WORKSPACE_ID) {
    return "Setting the audience to internal is admin only.";
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const update = {
    audience: requested,
    updatedAt: now,
    lastUpdatedAt: now,
    lastUpdatedBy: params.userId,
  };

  if (params.channelName) {
    update.channelName = params.channelName;
  }

  if (params.workspaceId) {
    update.workspaceId = params.workspaceId;
  }

  await docRef.set(update, { merge: true });

  return `Audience updated to ${requested}.`;
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
    case "audience":
      return handleAudience(params);
    default:
      return "Unknown command. Available commands: connect, status, disconnect, test, audience.";
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
        "Please provide a subcommand. Available commands: connect, status, disconnect, test, audience."
      );
      return;
    }

    const commandPromise = dispatchCommand(command, {
      args,
      channelId,
      channelName,
      userId,
      workspaceId,
    });

    const COMMAND_TIMEOUT_MS = 2500;
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({ type: "timeout" });
      }, COMMAND_TIMEOUT_MS);
    });

    const raceResult = await Promise.race([
      commandPromise
        .then((message) => ({ type: "success", message }))
        .catch((error) => ({ type: "error", error })),
      timeoutPromise,
    ]);

    clearTimeout(timeoutId);

    if (raceResult?.type === "success") {
      sendEphemeral(res, raceResult.message);
      return;
    }

    if (raceResult?.type === "error") {
      const errorMessage = `Error: ${raceResult.error?.message || String(raceResult.error)}`;
      sendEphemeral(res, errorMessage);
      return;
    }

    const acknowledgementText = `Processing /campfire ${command}...`;
    sendEphemeral(res, acknowledgementText);

    commandPromise
      .then(async (message) => {
        if (!message) {
          return;
        }

        await postSlackResponse(responseUrl, message);
      })
      .catch(async (error) => {
        console.error("Slack command error", error);
        const errorMessage = `Error: ${error.message || String(error)}`;
        await postSlackResponse(responseUrl, errorMessage);
      });

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
