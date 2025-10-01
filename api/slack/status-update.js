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

function normalizeBrandCode(value) {
  return value.trim().toUpperCase();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value.toNumber === "function") {
    const converted = value.toNumber();
    return Number.isFinite(converted) ? converted : 0;
  }

  return 0;
}

function collectStringValues(value, add) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, add));
    return;
  }

  if (typeof value === "object") {
    const possibleKeys = ["value", "name", "label", "text", "product", "productName"];
    for (const key of possibleKeys) {
      if (key in value) {
        collectStringValues(value[key], add);
      }
    }
    if ("values" in value) {
      collectStringValues(value.values, add);
    }
  }
}

const userNameCache = new Map();

async function getUserDisplayName(userId) {
  if (!userId) {
    return "";
  }

  if (userNameCache.has(userId)) {
    return userNameCache.get(userId);
  }

  try {
    const snap = await db.collection("users").doc(userId).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const candidates = [
        data.fullName,
        data.displayName,
        data.name,
        data.email,
      ];
      const resolved = candidates.find(
        (value) => typeof value === "string" && value.trim()
      );
      const finalValue = resolved ? resolved.trim() : snap.id;
      userNameCache.set(userId, finalValue);
      return finalValue;
    }
  } catch (error) {
    console.error("Failed to load user name", userId, error);
  }

  userNameCache.set(userId, userId);
  return userId;
}

function sanitizeInlineCodeValue(value) {
  return String(value == null ? "" : value).replace(/`/g, "'");
}

function formatInlineCode(value, fallback) {
  const hasValue = typeof value === "string" && value.trim();
  const base = hasValue ? value.trim() : fallback;
  const finalValue = base == null ? "" : String(base);
  return `\`${sanitizeInlineCodeValue(finalValue)}\``;
}

function normalizeAudience(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "internal" || normalized === "external"
    ? normalized
    : "";
}

function buildInternalMessage(status, context) {
  const brand = formatInlineCode(
    context.brandCode,
    context.brandCode || "UNKNOWN"
  );
  const adGroup = formatInlineCode(
    context.adGroupName,
    context.adGroupName || "Ad Group"
  );
  const designer = formatInlineCode(
    context.designerName,
    context.designerName || "Unassigned"
  );
  const editor = formatInlineCode(
    context.editorName,
    context.editorName || "Unknown"
  );
  const approved = formatInlineCode(
    String(Number(context.approvedCount) || 0),
    "0"
  );
  const editRequests = formatInlineCode(
    String(Number(context.editRequestedCount) || 0),
    "0"
  );
  const rejections = formatInlineCode(
    String(Number(context.rejectedCount) || 0),
    "0"
  );
  const reviewLink = context.reviewUrl
    ? `<${context.reviewUrl}|View details>`
    : "View details";

  switch (status) {
    case "designed":
      return [
        brand,
        `Ad group: ${adGroup} has been designed by ${designer}!`,
        reviewLink,
      ].join("\n");
    case "briefed":
      return [
        brand,
        `Ad group: ${adGroup} has been briefed by ${editor}!`,
        reviewLink,
      ].join("\n");
    case "reviewed": {
      const header = [brand, editor, designer].join("  ");
      return [
        header,
        `Ad group: ${adGroup} has been reviewed!`,
        `Approved: ${approved}`,
        `Edit Requests: ${editRequests}`,
        `Rejections: ${rejections}`,
        reviewLink,
      ].join("\n");
    }
    default:
      return null;
  }
}

async function getRecipeProductNames(adGroupId) {
  if (!adGroupId) {
    return [];
  }

  try {
    const snap = await db
      .collection("adGroups")
      .doc(adGroupId)
      .collection("recipes")
      .get();

    const seen = new Set();
    const names = [];

    const addName = (name) => {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        names.push(name);
      }
    };

    snap.forEach((doc) => {
      const data = doc.data() || {};
      const metadata = data.metadata || {};
      const components = data.components || {};

      const directValues = [
        data.product,
        data.productName,
        data.productDisplayName,
        data.products,
        metadata.product,
        metadata.productName,
        metadata.products,
      ];
      directValues.forEach((value) => collectStringValues(value, addName));

      Object.entries(metadata).forEach(([key, value]) => {
        if (typeof key === "string" && key.toLowerCase().includes("product")) {
          collectStringValues(value, addName);
        }
      });

      Object.entries(components).forEach(([key, value]) => {
        if (typeof key === "string" && key.toLowerCase().includes("product")) {
          collectStringValues(value, addName);
        }
      });
    });

    return names;
  } catch (error) {
    console.error("Failed to load recipe product names", error);
    return [];
  }
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

  const rawBrandCode =
    typeof payload.brandCode === "string" ? payload.brandCode.trim() : "";
  const normalizedBrandCode = rawBrandCode ? normalizeBrandCode(rawBrandCode) : "";
  const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  const adGroupId = typeof payload.adGroupId === "string" ? payload.adGroupId.trim() : "";
  let adGroupName = typeof payload.adGroupName === "string" ? payload.adGroupName.trim() : "";
  const adGroupUrl = typeof payload.url === "string" ? payload.url.trim() : "";

  if (!normalizedBrandCode) {
    res.status(400).json({ error: "brandCode is required" });
    return;
  }

  if (!status || !["designed", "briefed", "reviewed"].includes(status)) {
    res.status(400).json({ error: "Unsupported status" });
    return;
  }

  try {
    const collection = db.collection("slackChannelMappings");
    const brandCodeQueries = [
      collection.where("brandCodesNormalized", "array-contains", normalizedBrandCode).get(),
      collection.where("brandCodeNormalized", "==", normalizedBrandCode).get(),
      collection.where("brandCode", "==", normalizedBrandCode).get(),
    ];

    brandCodeQueries.push(
      collection.where("brandCodes", "array-contains", normalizedBrandCode).get()
    );

    if (rawBrandCode && rawBrandCode !== normalizedBrandCode) {
      brandCodeQueries.push(collection.where("brandCode", "==", rawBrandCode).get());
      brandCodeQueries.push(
        collection.where("brandCodes", "array-contains", rawBrandCode).get()
      );
    }

    const snapshots = await Promise.all(brandCodeQueries);
    const docsById = new Map();

    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        if (!docsById.has(doc.id)) {
          docsById.set(doc.id, doc);
        }
      }
    }

    if (!docsById.size) {
      res
        .status(200)
        .json({ ok: true, message: "No Slack channel connected for this brand." });
      return;
    }

    let adGroupData = null;
    if (adGroupId) {
      try {
        const adGroupSnap = await db.collection("adGroups").doc(adGroupId).get();
        if (adGroupSnap.exists) {
          adGroupData = adGroupSnap.data() || {};
          if (!adGroupName && typeof adGroupData.name === "string") {
            adGroupName = adGroupData.name;
          }
        }
      } catch (fetchError) {
        console.error("Failed to fetch ad group data", fetchError);
      }
    }

    const displayName = adGroupName || adGroupId || "this ad group";
    const reviewUrl = adGroupUrl || "";

    const [designerName, editorName] = await Promise.all([
      getUserDisplayName(adGroupData?.designerId || ""),
      getUserDisplayName(adGroupData?.editorId || ""),
    ]);

    let approvedCount = 0;
    let editRequestedCount = 0;
    let rejectedCount = 0;

    if (adGroupData) {
      approvedCount = toNumber(adGroupData.approvedCount);
      editRequestedCount = toNumber(adGroupData.editCount);
      rejectedCount = toNumber(adGroupData.rejectedCount);
    }

    let externalText;

    if (status === "designed") {
      const productNames = await getRecipeProductNames(adGroupId);
      const lines = ["✅ Your ads are ready for review!", "", displayName];
      if (productNames.length) {
        lines.push(`Products in this batch: ${productNames.join(", ")}`);
      }
      lines.push(reviewUrl ? `<${reviewUrl}|Review here>` : "Review here");
      externalText = lines.join("\n");
    } else if (status === "briefed") {
      const fallbackEditor =
        (adGroupData && typeof adGroupData.editorId === "string" && adGroupData.editorId.trim())
          ? adGroupData.editorId.trim()
          : "An editor";
      const lines = [
        `📝 Brief created for ${displayName}`,
        editorName
          ? `${editorName} just briefed this ad group.`
          : `${fallbackEditor} just briefed this ad group.`,
        reviewUrl ? `<${reviewUrl}|View details>` : "View details",
      ];
      externalText = lines.join("\n");
    } else if (status === "reviewed") {
      externalText = [
        `📝 Review completed for ${displayName}`,
        `Approved: ${approvedCount} | Edits requested: ${editRequestedCount} | Rejected: ${rejectedCount}`,
        reviewUrl ? `<${reviewUrl}|View details>` : "View details",
      ].join("\n");
    } else {
      externalText = reviewUrl ? `<${reviewUrl}|${displayName}>` : displayName;
    }

    const brandCandidates = [];
    if (adGroupData) {
      brandCandidates.push(adGroupData.brandCode);
      brandCandidates.push(adGroupData.brandCodeNormalized);
      if (adGroupData.brand && typeof adGroupData.brand === "object") {
        brandCandidates.push(adGroupData.brand.code);
        brandCandidates.push(adGroupData.brand.codeId);
      }
    }
    brandCandidates.push(rawBrandCode);
    brandCandidates.push(normalizedBrandCode);

    const resolvedBrandCodeRaw = brandCandidates.find(
      (value) => typeof value === "string" && value.trim()
    );

    const brandCodeForMessage = resolvedBrandCodeRaw
      ? normalizeBrandCode(resolvedBrandCodeRaw)
      : normalizedBrandCode;

    const internalMessage = buildInternalMessage(status, {
      brandCode: brandCodeForMessage,
      adGroupName: displayName,
      designerName,
      editorName,
      approvedCount,
      editRequestedCount,
      rejectedCount,
      reviewUrl,
    });

    const results = [];
    for (const doc of docsById.values()) {
      try {
        const docData = doc.data() || {};
        const audience = normalizeAudience(docData.audience) || "external";
        const messageText =
          audience === "internal" && internalMessage ? internalMessage : externalText;
        if (!messageText) {
          results.push({
            channel: doc.id,
            ok: false,
            error: "No message available for this status.",
          });
          continue;
        }

        const response = await postSlackMessage(doc.id, { text: messageText });
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
