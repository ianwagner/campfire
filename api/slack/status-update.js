const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("./firebase");
const { normalizeAudience } = require("./audience");
const slackMessageConfig = require("../../lib/slackMessageConfig.json");

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const SUPPORTED_STATUSES = Array.isArray(slackMessageConfig.types)
  ? slackMessageConfig.types
      .map((type) => (type && typeof type.id === "string" ? type.id : null))
      .filter((id) => typeof id === "string" && id.trim())
  : ["designed", "briefed", "reviewed", "blocked", "overall-feedback"];

const SLACK_TEMPLATE_CACHE_TTL_MS = 60 * 1000;
const SLACK_TAG_CACHE_TTL_MS = 60 * 1000;
const SLACK_USER_CACHE_TTL_MS = 10 * 60 * 1000;

const slackTemplateCache = { expiresAt: 0, value: null };
const brandTagCache = new Map();
const slackUserCache = new Map();

function createDefaultTemplateState() {
  const defaults = {};
  SUPPORTED_STATUSES.forEach((status) => {
    const templateDefaults =
      slackMessageConfig.defaults && slackMessageConfig.defaults[status]
        ? slackMessageConfig.defaults[status]
        : {};
    defaults[status] = {
      internal:
        typeof templateDefaults.internal === "string"
          ? templateDefaults.internal
          : "",
      external:
        typeof templateDefaults.external === "string"
          ? templateDefaults.external
          : "",
    };
  });
  return defaults;
}

function resolveTemplateSection(overrideEntry, section, fallback) {
  if (overrideEntry === undefined) {
    return fallback;
  }

  if (typeof overrideEntry === "string") {
    return overrideEntry;
  }

  if (overrideEntry && typeof overrideEntry === "object") {
    if (!(section in overrideEntry)) {
      return fallback;
    }
    const value = overrideEntry[section];
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value.text === "string") {
      return value.text;
    }
    return "";
  }

  return fallback;
}

function mergeSlackTemplates(overrides) {
  const defaults = createDefaultTemplateState();
  if (!overrides || typeof overrides !== "object") {
    return defaults;
  }

  const merged = {};
  SUPPORTED_STATUSES.forEach((status) => {
    const defaultEntry = defaults[status];
    const overrideEntry = overrides[status];
    merged[status] = {
      internal: resolveTemplateSection(overrideEntry, "internal", defaultEntry.internal),
      external: resolveTemplateSection(overrideEntry, "external", defaultEntry.external),
    };
  });

  return merged;
}

async function getSlackMessageTemplates() {
  const now = Date.now();
  if (slackTemplateCache.value && slackTemplateCache.expiresAt > now) {
    return slackTemplateCache.value;
  }

  let templates = createDefaultTemplateState();
  try {
    const snap = await db.collection("settings").doc("site").get();
    if (snap.exists) {
      const data = snap.data() || {};
      templates = mergeSlackTemplates(data.slackMessageTemplates || {});
    }
  } catch (error) {
    console.error("Failed to load Slack message templates", error);
    templates = createDefaultTemplateState();
  }

  slackTemplateCache.value = templates;
  slackTemplateCache.expiresAt = now + SLACK_TEMPLATE_CACHE_TTL_MS;
  return templates;
}

function createEmptyBrandTagState() {
  const state = {};
  SUPPORTED_STATUSES.forEach((status) => {
    state[status] = { internal: [], external: [] };
  });
  return state;
}

function normalizeEmailList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
          .filter(Boolean)
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function normalizeBrandSlackTags(value) {
  const base = createEmptyBrandTagState();
  if (!value || typeof value !== "object") {
    return base;
  }

  SUPPORTED_STATUSES.forEach((status) => {
    const entry = value[status];
    if (!entry || typeof entry !== "object") {
      base[status] = { internal: [], external: [] };
      return;
    }

    base[status] = {
      internal: normalizeEmailList(entry.internal),
      external: normalizeEmailList(entry.external),
    };
  });

  return base;
}

async function getBrandSlackTags(brandCandidates) {
  const now = Date.now();
  const candidateSet = new Set();

  if (Array.isArray(brandCandidates)) {
    brandCandidates.forEach((candidate) => {
      if (typeof candidate !== "string") {
        return;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        return;
      }
      candidateSet.add(trimmed);
      candidateSet.add(normalizeBrandCode(trimmed));
    });
  }

  const uniqueCandidates = Array.from(candidateSet).filter(Boolean);
  const cacheKey = uniqueCandidates[0] || "";

  if (cacheKey) {
    const cached = brandTagCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  const base = createEmptyBrandTagState();

  try {
    for (const candidate of uniqueCandidates) {
      const snap = await db
        .collection("brands")
        .where("code", "==", candidate)
        .limit(1)
        .get();

      if (!snap.empty) {
        const data = snap.docs[0].data() || {};
        const normalized = normalizeBrandSlackTags(data.slackMessageTags);
        if (cacheKey) {
          brandTagCache.set(cacheKey, {
            value: normalized,
            expiresAt: now + SLACK_TAG_CACHE_TTL_MS,
          });
        }
        return normalized;
      }
    }
  } catch (error) {
    console.error("Failed to load brand Slack tagging", error);
  }

  if (cacheKey) {
    brandTagCache.set(cacheKey, {
      value: base,
      expiresAt: now + SLACK_TAG_CACHE_TTL_MS,
    });
  }

  return base;
}

async function lookupSlackUserIdByEmail(token, workspaceKey, email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) {
    return null;
  }

  const cacheKey = `${workspaceKey || ""}:${normalizedEmail}`;
  const now = Date.now();
  const cached = slackUserCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.userId;
  }

  try {
    const response = await fetchWithFallback(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(normalizedEmail)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const body = await response.json();
    if (!response.ok || !body.ok) {
      const errorCode = body.error || `${response.status}`;
      console.error("Slack lookupByEmail failed", {
        email: normalizedEmail,
        workspaceKey,
        error: errorCode,
      });
      slackUserCache.set(cacheKey, {
        userId: null,
        expiresAt: now + SLACK_USER_CACHE_TTL_MS,
      });
      return null;
    }

    const userId = body.user && typeof body.user.id === "string" ? body.user.id : null;
    slackUserCache.set(cacheKey, {
      userId,
      expiresAt: now + SLACK_USER_CACHE_TTL_MS,
    });
    return userId;
  } catch (error) {
    console.error("Slack lookupByEmail error", {
      email: normalizedEmail,
      workspaceKey,
      error,
    });
    slackUserCache.set(cacheKey, {
      userId: null,
      expiresAt: now + SLACK_USER_CACHE_TTL_MS,
    });
    return null;
  }
}

async function resolveSlackMentions(emails, token, workspaceKey) {
  if (!Array.isArray(emails) || !emails.length) {
    return "";
  }

  const normalized = Array.from(
    new Set(
      emails
        .map((email) => (typeof email === "string" ? email.trim().toLowerCase() : ""))
        .filter(Boolean)
    )
  );

  if (!normalized.length) {
    return "";
  }

  const lookups = await Promise.all(
    normalized.map((email) => lookupSlackUserIdByEmail(token, workspaceKey, email))
  );

  const userIds = lookups.filter((id) => typeof id === "string" && id);
  const unique = Array.from(new Set(userIds));
  if (!unique.length) {
    return "";
  }

  return unique.map((id) => `<@${id}>`).join(" ");
}

const workspaceAccessTokenCache = new Map();

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

function createTemplateContext(context, mentionText) {
  const brand = formatInlineCode(context.brandCode, context.brandCode || "UNKNOWN");
  const adGroup = formatInlineCode(context.adGroupName, context.adGroupName || "Ad Group");
  const designer = formatInlineCode(
    context.designerName,
    context.designerName || "Unassigned"
  );
  const editor = formatInlineCode(context.editorName, context.editorName || "Unknown");
  const approved = formatInlineCode(String(Number(context.approvedCount) || 0), "0");
  const editRequests = formatInlineCode(
    String(Number(context.editRequestedCount) || 0),
    "0"
  );
  const rejections = formatInlineCode(String(Number(context.rejectedCount) || 0), "0");
  const reviewLink = context.reviewUrl
    ? `<${context.reviewUrl}|View details>`
    : "View details";
  const adGroupLink = context.adGroupUrl
    ? `<${context.adGroupUrl}|View details>`
    : reviewLink;
  const noteText =
    typeof context.note === "string" && context.note.trim() ? context.note.trim() : "";
  const noteBlock = noteText ? `*Note:*\n${noteText}` : "";
  const feedbackNote = noteText || "No additional note provided.";
  const productTags = formatProductTags(context.productNames || []);
  const productTagsLine = productTags.length
    ? `Offers in this batch: ${productTags.join(" ")}`
    : "";
  const mentions = mentionText ? mentionText.trim() : "";
  const mentionsLine = mentions ? `Notify: ${mentions}` : "";

  return {
    brand,
    adGroup,
    designer,
    editor,
    approved,
    editRequests,
    rejected,
    reviewLink,
    reviewLinkLine: reviewLink,
    adGroupLink,
    adGroupLinkLine: adGroupLink,
    note: noteText,
    noteLine: noteText,
    noteBlock,
    feedbackNote,
    productTags: productTags.join(" "),
    productTagsLine,
    mentions,
    mentionsLine,
    brandCode: context.brandCode,
    adGroupName: context.adGroupName,
    designerName: context.designerName,
    editorName: context.editorName,
    approvedCount: context.approvedCount,
    editRequestedCount: context.editRequestedCount,
    rejectedCount: context.rejectedCount,
    reviewUrl: context.reviewUrl,
    adGroupUrl: context.adGroupUrl,
    productNames: context.productNames,
  };
}

function applyTemplate(templateText, templateContext) {
  if (typeof templateText !== "string" || !templateText) {
    return "";
  }

  const replaced = templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(templateContext, key)) {
      const value = templateContext[key];
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    }
    return "";
  });

  const lines = replaced
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""))
    .reduce((acc, line) => {
      if (!line.trim()) {
        if (acc.length === 0 || acc[acc.length - 1] === "") {
          return acc;
        }
        acc.push("");
      } else {
        acc.push(line);
      }
      return acc;
    }, []);

  while (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n").trim();
}

function buildBlocksFromTemplate(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  const segments = text.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean);
  if (!segments.length) {
    return null;
  }

  return segments.map((segment) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: segment,
    },
  }));
}

function buildDefaultInternalMessage(status, context) {
  const sections = [];
  const lines = [];
  const addSection = (text) => {
    if (typeof text !== "string") {
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: trimmed,
      },
    });
    lines.push(trimmed);
  };

  const addDivider = () => {
    sections.push({ type: "divider" });
  };

  switch (status) {
    case "designed":
      addSection(context.brand);
      addSection(`Ad group: ${context.adGroup} has been designed by ${context.designer}!`);
      addSection(context.adGroupLink);
      break;
    case "briefed":
      addSection(context.brand);
      addSection(`Ad group: ${context.adGroup} has been briefed by ${context.editor}!`);
      if (context.noteLine) {
        addDivider();
        addSection(context.noteLine);
      }
      addSection(context.adGroupLink);
      break;
    case "reviewed": {
      const header = [context.brand, context.editor, context.designer].join("  ");
      addSection(header);
      addSection(`Ad group: ${context.adGroup} has been reviewed!`);
      addSection(`Approved: ${context.approved}`);
      addSection(`Edit Requests: ${context.editRequests}`);
      addSection(`Rejections: ${context.rejected}`);
      addSection(context.adGroupLink);
      break;
    }
    case "blocked": {
      const header = [context.brand, context.editor, context.designer].join("  ");
      addSection(header);
      addSection(`Ad group: ${context.adGroup} is blocked!`);
      if (context.noteLine) {
        addDivider();
        addSection(context.noteLine);
      }
      addSection(context.adGroupLink);
      break;
    }
    case "overall-feedback": {
      const header = [context.brand, context.editor, context.designer].join("  ");
      addSection(header);
      addSection(`Overall feedback note received for ${context.adGroup}`);
      addDivider();
      addSection(context.feedbackNote);
      addSection(context.adGroupLink);
      break;
    }
    default:
      return null;
  }

  if (context.mentionsLine) {
    addSection(context.mentionsLine);
  }

  if (!lines.length) {
    return null;
  }

  return {
    text: lines.join("\n"),
    blocks: sections,
  };
}

function buildInternalMessage(status, context, templates, mentionText) {
  const templateEntry = templates && templates[status] ? templates[status].internal : undefined;
  if (templateEntry === "") {
    return null;
  }

  const templateContext = createTemplateContext(context, mentionText);
  if (typeof templateEntry === "string" && templateEntry) {
    const rendered = applyTemplate(templateEntry, templateContext);
    if (rendered) {
      const blocks = buildBlocksFromTemplate(rendered);
      return blocks ? { text: rendered, blocks } : { text: rendered };
    }
  }

  return buildDefaultInternalMessage(status, templateContext);
}

function buildDefaultExternalMessage(status, context) {
  switch (status) {
    case "designed": {
      const lines = [`Ad group: ${context.adGroup} is ready for review.`];
      if (context.productTagsLine) {
        lines.push(context.productTagsLine);
      }
      lines.push(context.reviewLinkLine);
      if (context.mentionsLine) {
        lines.push(context.mentionsLine);
      }
      return lines.filter((line) => typeof line === "string" && line.trim()).join("\n");
    }
    case "reviewed": {
      const lines = [
        `Review completed for ${context.adGroup}`,
        `Approved: ${context.approved}`,
        `Edit Requests: ${context.editRequests}`,
        `Rejections: ${context.rejected}`,
        context.reviewLinkLine,
      ];
      if (context.mentionsLine) {
        lines.push(context.mentionsLine);
      }
      return lines.filter((line) => typeof line === "string" && line.trim()).join("\n");
    }
    default:
      return null;
  }
}

function buildExternalMessage(status, context, templates, mentionText) {
  const templateEntry = templates && templates[status] ? templates[status].external : undefined;
  if (templateEntry === "") {
    return null;
  }

  const templateContext = createTemplateContext(context, mentionText);
  if (typeof templateEntry === "string" && templateEntry) {
    const rendered = applyTemplate(templateEntry, templateContext);
    if (rendered) {
      return rendered;
    }
  }

  return buildDefaultExternalMessage(status, templateContext);
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

  if (!status || !SUPPORTED_STATUSES.includes(status)) {
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

    const resolvedBrandCodeRaw = brandCandidates.find(
      (value) => typeof value === "string" && value.trim()
    );

    const brandCodeForMessage = resolvedBrandCodeRaw
      ? normalizeBrandCode(resolvedBrandCodeRaw)
      : normalizedBrandCode;

    const [templates, brandSlackTags] = await Promise.all([
      getSlackMessageTemplates(),
      getBrandSlackTags(brandCandidates),
    ]);

    const statusTagConfig = brandSlackTags[status] || { internal: [], external: [] };

    const baseContext = {
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
      productNames,
    };

    const results = [];
    const mentionCache = new Map();
    for (const doc of docsById.values()) {
      try {
        const docData = doc.data() || {};
        const audience = normalizeAudience(docData.audience) || "external";
        let token;
        let workspaceKey = "internal";

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

          workspaceKey = workspaceId;
          token = await getWorkspaceAccessToken(workspaceId);

          if (!token) {
            throw new Error(
              `No Slack access token found for workspace ${workspaceId}. Please reinstall the Slack app.`,
            );
          }
        }

        const mentionEmails =
          audience === "internal"
            ? statusTagConfig.internal || []
            : statusTagConfig.external || [];

        let mentionText = "";
        if (mentionEmails.length) {
          const mentionCacheKey = `${workspaceKey}:${audience}:${status}`;
          if (mentionCache.has(mentionCacheKey)) {
            mentionText = mentionCache.get(mentionCacheKey);
          } else {
            mentionText = await resolveSlackMentions(mentionEmails, token, workspaceKey);
            mentionCache.set(mentionCacheKey, mentionText);
          }
        }

        let payload;
        if (audience === "internal") {
          payload = buildInternalMessage(status, baseContext, templates, mentionText);
        } else {
          const externalText = buildExternalMessage(
            status,
            baseContext,
            templates,
            mentionText,
          );
          payload = externalText ? { text: externalText } : null;
        }

        if (!payload) {
          results.push({
            channel: doc.id,
            ok: true,
            skipped: true,
            message: "No message available for this status.",
          });
          continue;
        }

        const response = await postSlackMessage(doc.id, payload, token);
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
