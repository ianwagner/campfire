const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("./firebase");
const { normalizeAudience } = require("./audience");
const defaultSlackMessageTemplates = require("../../lib/slackMessageTemplates.json");

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const workspaceAccessTokenCache = new Map();
const siteSettingsCache = { data: null, expiresAt: 0 };
const agencyNotificationCache = new Map();
const channelDocCache = new Map();
const mentionLookupCache = new Map();

async function getWorkspaceAccessToken(workspaceId) {
  const normalizedWorkspaceId = typeof workspaceId === "string" ? workspaceId.trim() : "";

  if (!normalizedWorkspaceId) {
    return null;
  }

  if (workspaceAccessTokenCache.has(normalizedWorkspaceId)) {
    return workspaceAccessTokenCache.get(normalizedWorkspaceId);
  }

  try {
    const snap = await db.collection("slackWorkspaces").doc(normalizedWorkspaceId).get();
    if (!snap.exists) {
      workspaceAccessTokenCache.set(normalizedWorkspaceId, null);
      return null;
    }

    const data = snap.data() || {};
    const accessToken =
      typeof data.accessToken === "string" && data.accessToken.trim()
        ? data.accessToken.trim()
        : null;

    workspaceAccessTokenCache.set(normalizedWorkspaceId, accessToken);
    return accessToken;
  } catch (error) {
    console.error(
      "Failed to load Slack workspace access token",
      normalizedWorkspaceId,
      error,
    );
    throw error;
  }
}

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

function shouldCollectProductEntryKey(key) {
  if (typeof key !== "string") {
    return false;
  }

  const lower = key.toLowerCase();
  if (!lower.includes("product")) {
    return false;
  }

  const excludedTerms = [
    "benefit",
    "description",
    "detail",
    "reason",
    "why",
  ];

  if (excludedTerms.some((term) => lower.includes(term))) {
    return false;
  }

  return true;
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

function renderTemplate(templateValue, replacements, { includeBlocks = false } = {}) {
  const templateString =
    typeof templateValue === "string" ? templateValue.replace(/\r\n/g, "\n") : "";
  const trimmed = templateString.trim();

  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(/\n{2,}/);
  const blocks = [];
  const lines = [];

  segments.forEach((segment) => {
    const cleanSegment = segment.replace(/\r/g, "").trim();
    if (!cleanSegment) {
      return;
    }

    if (/^\[divider\]$/i.test(cleanSegment)) {
      if (includeBlocks) {
        blocks.push({ type: "divider" });
      }
      return;
    }

    const replaced = cleanSegment.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
      const replacement = replacements[key];
      if (replacement === null || replacement === undefined) {
        return "";
      }
      return String(replacement);
    });

    const finalText = replaced.trim();
    if (!finalText) {
      return;
    }

    lines.push(finalText);

    if (includeBlocks) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: finalText,
        },
      });
    }
  });

  if (!lines.length && !blocks.length) {
    return null;
  }

  const text = lines.join("\n\n");

  if (includeBlocks) {
    return {
      text: text || "",
      blocks,
    };
  }

  return text || "";
}

function resolveTemplateValue(templates, audience, status) {
  if (!templates || !audience || !status) {
    return { value: "", found: false };
  }

  const bucket = templates[audience];
  if (!bucket || typeof bucket !== "object") {
    return { value: "", found: false };
  }

  if (Object.prototype.hasOwnProperty.call(bucket, status)) {
    const rawValue = bucket[status];
    if (Array.isArray(rawValue)) {
      return {
        value: rawValue
          .map((entry) => (entry == null ? "" : String(entry)))
          .join("\n\n"),
        found: true,
      };
    }
    if (typeof rawValue === "string") {
      return { value: rawValue, found: true };
    }
    return { value: "", found: true };
  }

  return { value: "", found: false };
}

function getTemplateValue(templates, audience, status) {
  const direct = resolveTemplateValue(templates, audience, status);
  if (direct.found) {
    return direct.value;
  }

  const normalizedKey = status.replace(/[-\s]+/g, "");
  if (normalizedKey && normalizedKey !== status) {
    const alternate = resolveTemplateValue(templates, audience, normalizedKey);
    if (alternate.found) {
      return alternate.value;
    }
  }

  return "";
}

function formatProductTags(names) {
  if (!Array.isArray(names)) {
    return [];
  }

  const tags = [];
  const seen = new Set();

  names.forEach((name) => {
    if (typeof name !== "string") {
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const normalized = trimmed
      .replace(/\s+/g, "-")
      .replace(/[^-a-zA-Z0-9_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const tagBody = normalized || trimmed.replace(/\s+/g, "-");
    const tag = `#${tagBody}`;
    const dedupeKey = tag.toLowerCase();

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      tags.push(tag);
    }
  });

  return tags;
}

function createTemplateReplacements(context = {}) {
  const note =
    typeof context.note === "string" && context.note.trim()
      ? context.note.trim()
      : "";
  const productTags = formatProductTags(context.productNames || []);
  const tagsJoined = productTags.join(" ");
  const offersLine = tagsJoined ? `Offers in this batch: ${tagsJoined}` : "";
  const reviewLink = context.reviewUrl
    ? `<${context.reviewUrl}|View details>`
    : "View details";
  const adGroupLink = context.adGroupUrl
    ? `<${context.adGroupUrl}|View details>`
    : reviewLink;

  return {
    brand: formatInlineCode(context.brandCode, context.brandCode || "UNKNOWN"),
    brandName: context.brandCode || "UNKNOWN",
    adGroup: formatInlineCode(
      context.adGroupName,
      context.adGroupName || "Ad Group",
    ),
    adGroupName: context.adGroupName || "Ad Group",
    designer: formatInlineCode(
      context.designerName,
      context.designerName || "Unassigned",
    ),
    designerName: context.designerName || "Unassigned",
    editor: formatInlineCode(context.editorName, context.editorName || "Unknown"),
    editorName: context.editorName || "Unknown",
    approvedCount: formatInlineCode(
      String(Number(context.approvedCount) || 0),
      "0",
    ),
    editRequestedCount: formatInlineCode(
      String(Number(context.editRequestedCount) || 0),
      "0",
    ),
    rejectedCount: formatInlineCode(
      String(Number(context.rejectedCount) || 0),
      "0",
    ),
    reviewLink,
    reviewUrl: context.reviewUrl || "",
    adGroupLink,
    adGroupUrl: context.adGroupUrl || "",
    note,
    noteBlock: note ? `*Note:* ${note}` : "",
    noteSection: note,
    productTags: tagsJoined,
    offerTags: offersLine,
    productList: (context.productNames || []).join(", "),
  };
}

function buildInternalMessage(status, context, templates) {
  const replacements = createTemplateReplacements(context);
  const siteTemplate = getTemplateValue(templates, "internal", status);
  const renderedSiteTemplate = renderTemplate(siteTemplate, replacements, {
    includeBlocks: true,
  });
  if (renderedSiteTemplate) {
    return renderedSiteTemplate;
  }

  const fallbackTemplate = getTemplateValue(
    defaultSlackMessageTemplates,
    "internal",
    status,
  );
  const renderedFallback = renderTemplate(fallbackTemplate, replacements, {
    includeBlocks: true,
  });

  return renderedFallback || null;
}

function buildExternalMessage(status, context, templates) {
  const replacements = createTemplateReplacements(context);
  const siteTemplate = getTemplateValue(templates, "external", status);
  const renderedSiteTemplate = renderTemplate(siteTemplate, replacements, {
    includeBlocks: false,
  });
  if (typeof renderedSiteTemplate === "string" && renderedSiteTemplate.trim()) {
    return renderedSiteTemplate;
  }

  const fallbackTemplate = getTemplateValue(
    defaultSlackMessageTemplates,
    "external",
    status,
  );
  const renderedFallback = renderTemplate(fallbackTemplate, replacements, {
    includeBlocks: false,
  });

  if (typeof renderedFallback === "string" && renderedFallback.trim()) {
    return renderedFallback;
  }

  return null;
}

function normalizeChannelIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );
}

async function getSiteSettingsData() {
  const now = Date.now();
  if (siteSettingsCache.data && siteSettingsCache.expiresAt > now) {
    return siteSettingsCache.data;
  }

  try {
    const snap = await db.collection("settings").doc("site").get();
    if (!snap.exists) {
      siteSettingsCache.data = null;
      siteSettingsCache.expiresAt = now + 30000;
      return null;
    }

    const data = snap.data() || {};
    siteSettingsCache.data = data;
    siteSettingsCache.expiresAt = now + 60000;
    return data;
  } catch (error) {
    console.error("Failed to load site settings", error);
    siteSettingsCache.data = null;
    siteSettingsCache.expiresAt = now + 15000;
    return null;
  }
}

async function getSiteSlackTemplates() {
  const data = await getSiteSettingsData();
  return data?.slackMessageTemplates || null;
}

async function getSiteSlackNotificationDefaults() {
  const data = await getSiteSettingsData();
  if (!data) {
    return [];
  }
  return normalizeChannelIdList(data.defaultSlackNotificationChannelIds || []);
}

async function getAgencySlackNotifications(agencyId) {
  const trimmedId = typeof agencyId === "string" ? agencyId.trim() : "";
  if (!trimmedId) {
    return null;
  }

  const now = Date.now();
  const cached = agencyNotificationCache.get(trimmedId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const snap = await db.collection("agencies").doc(trimmedId).get();
    if (!snap.exists) {
      agencyNotificationCache.set(trimmedId, { value: null, expiresAt: now + 60000 });
      return null;
    }

    const data = snap.data() || {};
    const mode = data.slackNotificationMode === "custom" ? "custom" : "default";
    const channelIds = normalizeChannelIdList(data.slackNotificationChannelIds || []);
    const value = { mode, channelIds };
    agencyNotificationCache.set(trimmedId, { value, expiresAt: now + 60000 });
    return value;
  } catch (error) {
    console.error("Failed to load agency Slack notifications", trimmedId, error);
    agencyNotificationCache.set(trimmedId, { value: null, expiresAt: now + 15000 });
    return null;
  }
}

async function loadSlackChannelMapping(channelId) {
  const trimmed = typeof channelId === "string" ? channelId.trim() : "";
  if (!trimmed) {
    return null;
  }

  const now = Date.now();
  const cached = channelDocCache.get(trimmed);
  if (cached && cached.expiresAt > now) {
    return cached.doc;
  }

  try {
    const snap = await db.collection("slackChannelMappings").doc(trimmed).get();
    if (!snap.exists) {
      channelDocCache.set(trimmed, { doc: null, expiresAt: now + 60000 });
      return null;
    }

    channelDocCache.set(trimmed, { doc: snap, expiresAt: now + 60000 });
    return snap;
  } catch (error) {
    console.error("Failed to load Slack channel mapping", trimmed, error);
    channelDocCache.set(trimmed, { doc: null, expiresAt: now + 15000 });
    return null;
  }
}

function normalizeMentionEmails(entry) {
  const emails = new Set();
  const addEmail = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return;
    }
    if (!/.+@.+\..+/.test(trimmed)) {
      return;
    }
    emails.add(trimmed);
  };

  if (Array.isArray(entry)) {
    entry.forEach(addEmail);
  } else if (typeof entry === "string") {
    entry
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .forEach(addEmail);
  } else if (entry && typeof entry === "object") {
    if (Array.isArray(entry.emails)) {
      entry.emails.forEach(addEmail);
    } else if (typeof entry.email === "string") {
      addEmail(entry.email);
    }
  }

  return Array.from(emails);
}

function getMentionEmailsForStatus(config, status) {
  if (!config || typeof config !== "object") {
    return [];
  }

  const direct = normalizeMentionEmails(config[status]);
  if (direct.length) {
    return direct;
  }

  const normalizedKey = status.replace(/[-\s]+/g, "");
  if (normalizedKey && normalizedKey !== status) {
    const alternate = normalizeMentionEmails(config[normalizedKey]);
    if (alternate.length) {
      return alternate;
    }
  }

  const fallbackKeys = ["default", "all", "any"];
  for (const key of fallbackKeys) {
    const fallback = normalizeMentionEmails(config[key]);
    if (fallback.length) {
      return fallback;
    }
  }

  return [];
}

async function lookupSlackUserIdByEmail(email, token) {
  if (!email || !token) {
    return null;
  }

  const cacheKey = `${token}:${email}`;
  if (mentionLookupCache.has(cacheKey)) {
    return mentionLookupCache.get(cacheKey);
  }

  try {
    const response = await fetchWithFallback(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Slack lookup failed", response.status, body);
      mentionLookupCache.set(cacheKey, null);
      return null;
    }

    const body = await response.json();
    if (body.ok && body.user && body.user.id) {
      const userId = body.user.id;
      mentionLookupCache.set(cacheKey, userId);
      return userId;
    }

    console.warn("Slack lookup returned no user", email, body.error);
    mentionLookupCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error("Slack lookup error", email, error);
    mentionLookupCache.set(cacheKey, null);
    return null;
  }
}

function appendMentionsToPayload(payload, mentionText) {
  if (!mentionText) {
    return payload;
  }

  if (!payload) {
    return { text: mentionText };
  }

  const updated = { ...payload };

  if (Array.isArray(payload.blocks) && payload.blocks.length) {
    updated.blocks = [
      {
        type: "section",
        text: { type: "mrkdwn", text: mentionText },
      },
      ...payload.blocks,
    ];
  }

  if (typeof payload.text === "string" && payload.text.trim()) {
    updated.text = `${mentionText}\n${payload.text}`.trim();
  } else {
    updated.text = mentionText;
  }

  return updated;
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
        if (shouldCollectProductEntryKey(key)) {
          collectStringValues(value, addName);
        }
      });

      Object.entries(components).forEach(([key, value]) => {
        if (shouldCollectProductEntryKey(key)) {
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

async function postSlackMessage(channel, payload, token) {
  if (!token) {
    throw new Error("Slack access token is not configured");
  }

  const response = await fetchWithFallback("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
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
  const reviewUrlRaw =
    typeof payload.url === "string" ? payload.url.trim() : "";
  const adGroupUrlRaw =
    typeof payload.adGroupUrl === "string" ? payload.adGroupUrl.trim() : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (!normalizedBrandCode) {
    res.status(400).json({ error: "brandCode is required" });
    return;
  }

  if (
    !status ||
    !["designed", "briefed", "reviewed", "blocked", "overall-feedback"].includes(status)
  ) {
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
    const brandIdCandidates = new Set();
    if (adGroupData) {
      if (typeof adGroupData.brandId === "string" && adGroupData.brandId.trim()) {
        brandIdCandidates.add(adGroupData.brandId.trim());
      }
      if (adGroupData.brand && typeof adGroupData.brand === "object") {
        const nestedBrand = adGroupData.brand;
        if (typeof nestedBrand.id === "string" && nestedBrand.id.trim()) {
          brandIdCandidates.add(nestedBrand.id.trim());
        }
        if (typeof nestedBrand.brandId === "string" && nestedBrand.brandId.trim()) {
          brandIdCandidates.add(nestedBrand.brandId.trim());
        }
        if (typeof nestedBrand.docId === "string" && nestedBrand.docId.trim()) {
          brandIdCandidates.add(nestedBrand.docId.trim());
        }
      }
      if (
        adGroupData.brandRef &&
        typeof adGroupData.brandRef === "object" &&
        typeof adGroupData.brandRef.id === "string" &&
        adGroupData.brandRef.id.trim()
      ) {
        brandIdCandidates.add(adGroupData.brandRef.id.trim());
      }
    }

    let reviewUrl = reviewUrlRaw || "";
    let adGroupUrl = adGroupUrlRaw || "";

    if (!adGroupUrl && reviewUrl && adGroupId) {
      const replacePath = (value) =>
        value.replace(/\/review\/(?:[^/?#]+)/i, `/ad-group/${adGroupId}`);

      if (/^https?:\/\//i.test(reviewUrl)) {
        try {
          const parsed = new URL(reviewUrl);
          parsed.pathname = replacePath(parsed.pathname);
          adGroupUrl = parsed.toString();
        } catch (error) {
          adGroupUrl = replacePath(reviewUrl);
        }
      } else if (reviewUrl.startsWith("/")) {
        adGroupUrl = replacePath(reviewUrl);
      }
    }

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

    let productNames = [];
    if (status === "designed") {
      productNames = await getRecipeProductNames(adGroupId);
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

    let brandDocData = null;
    let brandDocId = null;

    const idCandidates = Array.from(brandIdCandidates).filter(Boolean);
    for (const candidateId of idCandidates) {
      try {
        const snap = await db.collection("brands").doc(candidateId).get();
        if (snap.exists) {
          brandDocId = snap.id;
          brandDocData = snap.data() || {};
          break;
        }
      } catch (error) {
        console.error("Failed to load brand by ID", candidateId, error);
      }
    }

    if (!brandDocData) {
      const codeCandidates = Array.from(
        new Set(
          brandCandidates
            .concat([rawBrandCode, normalizedBrandCode])
            .filter((value) => typeof value === "string" && value.trim()),
        ),
      );

      for (const candidateCode of codeCandidates) {
        try {
          const snap = await db
            .collection("brands")
            .where("code", "==", candidateCode)
            .limit(1)
            .get();
          if (!snap.empty) {
            const docSnap = snap.docs[0];
            brandDocId = docSnap.id;
            brandDocData = docSnap.data() || {};
            break;
          }
        } catch (error) {
          console.error("Failed to load brand by code", candidateCode, error);
        }
      }
    }

    const siteDefaultChannelIds = await getSiteSlackNotificationDefaults();
    let fallbackChannelIds = siteDefaultChannelIds;
    const agencyIdRaw =
      brandDocData && typeof brandDocData.agencyId === "string"
        ? brandDocData.agencyId.trim()
        : "";
    if (agencyIdRaw) {
      const agencyNotification = await getAgencySlackNotifications(agencyIdRaw);
      if (agencyNotification) {
        if (agencyNotification.mode === "custom") {
          fallbackChannelIds = agencyNotification.channelIds;
        } else if (agencyNotification.mode === "default") {
          fallbackChannelIds = siteDefaultChannelIds;
        }
      }
    }

    const additionalChannelIds = normalizeChannelIdList(fallbackChannelIds || []);
    if (additionalChannelIds.length) {
      for (const channelId of additionalChannelIds) {
        if (docsById.has(channelId)) {
          continue;
        }
        const channelDoc = await loadSlackChannelMapping(channelId);
        if (channelDoc) {
          docsById.set(channelId, channelDoc);
        }
      }
    }

    if (!docsById.size) {
      res
        .status(200)
        .json({ ok: true, message: "No Slack channel connected for this brand." });
      return;
    }

    const brandSlackMentions =
      brandDocData && typeof brandDocData.slackMentions === "object"
        ? brandDocData.slackMentions
        : null;

    const resolvedBrandCodeRaw = brandCandidates.find(
      (value) => typeof value === "string" && value.trim()
    );

    let brandCodeForMessage = normalizedBrandCode;
    if (resolvedBrandCodeRaw) {
      brandCodeForMessage = normalizeBrandCode(resolvedBrandCodeRaw);
    } else if (brandDocData && typeof brandDocData.code === "string") {
      brandCodeForMessage = normalizeBrandCode(brandDocData.code);
    }

    const siteTemplates = await getSiteSlackTemplates();

    const internalMessage = buildInternalMessage(status, {
      brandCode: brandCodeForMessage,
      adGroupName: displayName,
      designerName,
      editorName,
      approvedCount,
      editRequestedCount,
      rejectedCount,
      reviewUrl,
      adGroupUrl,
      note,
    }, siteTemplates);

    const externalText = buildExternalMessage(status, {
      adGroupName: displayName,
      approvedCount,
      editRequestedCount,
      rejectedCount,
      reviewUrl,
      productNames,
    }, siteTemplates);

    const externalPayload = externalText ? { text: externalText } : null;
    const mentionEmails = getMentionEmailsForStatus(brandSlackMentions, status);
    const mentionTextByToken = new Map();

    const results = [];
    for (const doc of docsById.values()) {
      try {
        const docData = doc.data() || {};
        const audience = normalizeAudience(docData.audience) || "external";
        const basePayload =
          audience === "internal" ? internalMessage : externalPayload;

        if (!basePayload) {
          results.push({
            channel: doc.id,
            ok: true,
            skipped: true,
            message: "No message available for this status.",
          });
          continue;
        }

        let token;

        if (audience === "internal") {
          if (!SLACK_BOT_TOKEN) {
            throw new Error("SLACK_BOT_TOKEN is not configured");
          }
          token = SLACK_BOT_TOKEN;
        } else {
          const workspaceId =
            typeof docData.workspaceId === "string" ? docData.workspaceId.trim() : "";

          if (!workspaceId) {
            throw new Error("Slack workspace ID is not configured for this channel");
          }

          token = await getWorkspaceAccessToken(workspaceId);

          if (!token) {
            throw new Error(
              `No Slack access token found for workspace ${workspaceId}. Please reinstall the Slack app.`,
            );
          }
        }

        let payloadToSend = basePayload;
        if (mentionEmails.length) {
          let mentionText = mentionTextByToken.get(token);
          if (mentionText === undefined) {
            const resolvedMentions = [];
            for (const email of mentionEmails) {
              const userId = await lookupSlackUserIdByEmail(email, token);
              if (userId) {
                const formatted = `<@${userId}>`;
                if (!resolvedMentions.includes(formatted)) {
                  resolvedMentions.push(formatted);
                }
              }
            }
            mentionText = resolvedMentions.join(" ");
            mentionTextByToken.set(token, mentionText);
          }

          if (mentionText) {
            payloadToSend = appendMentionsToPayload(basePayload, mentionText);
          }
        }

        const response = await postSlackMessage(doc.id, payloadToSend, token);
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
