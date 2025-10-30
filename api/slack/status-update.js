const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const crypto = require("crypto");
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
const siteTemplateCache = { templates: null, expiresAt: 0 };
const mentionLookupCache = new Map();
const MENTION_LOOKUP_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MENTION_LOOKUP_FAILURE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const RECENT_STATUS_NOTIFICATION_TTL_MS = 15 * 1000; // 15 seconds
const recentStatusNotificationCache = new Map();
const STATUS_NOTIFICATION_LOCK_COLLECTION = "slackStatusNotificationLocks";

function pruneRecentStatusNotifications(now = Date.now()) {
  for (const [key, entry] of recentStatusNotificationCache.entries()) {
    if (!entry || typeof entry.timestamp !== "number") {
      recentStatusNotificationCache.delete(key);
      continue;
    }
    if (now - entry.timestamp > RECENT_STATUS_NOTIFICATION_TTL_MS) {
      recentStatusNotificationCache.delete(key);
    }
  }
}

function normalizeForCache(value, { lower = false } = {}) {
  if (typeof value !== "string") {
    return "";
  }
  let normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (lower) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

function normalizeUrlForCache(value) {
  const normalized = normalizeForCache(value);
  if (!normalized) {
    return "";
  }
  return normalized.replace(/\/+$/, "");
}

function buildStatusNotificationCacheKey({
  brandCode,
  adGroupId,
  status,
  reviewUrl,
  adGroupUrl,
  note,
}) {
  return JSON.stringify({
    brandCode: normalizeForCache(brandCode, { lower: true }),
    adGroupId: normalizeForCache(adGroupId, { lower: true }),
    status: normalizeForCache(status, { lower: true }),
    reviewUrl: normalizeUrlForCache(reviewUrl),
    adGroupUrl: normalizeUrlForCache(adGroupUrl),
    note: normalizeForCache(note),
  });
}

function markStatusNotificationProcessed(key) {
  if (!key) {
    return;
  }
  recentStatusNotificationCache.set(key, {
    timestamp: Date.now(),
    inFlight: false,
  });
}

function clearStatusNotificationEntry(key) {
  if (!key) {
    return;
  }
  recentStatusNotificationCache.delete(key);
}

function getTimestampMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value.toMillis === "function") {
    try {
      return value.toMillis();
    } catch (error) {
      console.error("Failed to convert Firestore timestamp", error);
      return 0;
    }
  }

  return 0;
}

function getStatusNotificationLockRef(dedupeKey) {
  if (!dedupeKey) {
    return null;
  }

  const hash = crypto.createHash("sha256").update(dedupeKey).digest("hex");
  return db.collection(STATUS_NOTIFICATION_LOCK_COLLECTION).doc(hash);
}

async function acquireStatusNotificationLock(dedupeKey, now = Date.now()) {
  const docRef = getStatusNotificationLockRef(dedupeKey);
  if (!docRef) {
    return { allowed: true, docRef: null };
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? snap.data() || {} : {};
      const pendingSinceMs = getTimestampMillis(data.pendingSince);
      if (pendingSinceMs && now - pendingSinceMs < RECENT_STATUS_NOTIFICATION_TTL_MS) {
        return { allowed: false, reason: "pending" };
      }

      const lastSuccessMs = getTimestampMillis(data.lastSuccess);
      if (lastSuccessMs && now - lastSuccessMs < RECENT_STATUS_NOTIFICATION_TTL_MS) {
        return { allowed: false, reason: "recent" };
      }

      tx.set(
        docRef,
        {
          key: dedupeKey,
          pending: true,
          pendingSince: admin.firestore.Timestamp.fromMillis(now),
          updatedAt: admin.firestore.Timestamp.fromMillis(now),
          expiresAt: admin.firestore.Timestamp.fromMillis(
            now + RECENT_STATUS_NOTIFICATION_TTL_MS * 10,
          ),
        },
        { merge: true },
      );

      return { allowed: true };
    });

    return { ...result, docRef };
  } catch (error) {
    console.error("Failed to acquire Slack notification dedupe lock", error);
    return { allowed: true, docRef };
  }
}

async function releaseStatusNotificationLock(docRef, { success = false, now = Date.now() } = {}) {
  if (!docRef) {
    return;
  }

  const update = {
    pending: false,
    updatedAt: admin.firestore.Timestamp.fromMillis(now),
    expiresAt: admin.firestore.Timestamp.fromMillis(
      now + RECENT_STATUS_NOTIFICATION_TTL_MS * 10,
    ),
    pendingSince: admin.firestore.FieldValue.delete(),
  };

  if (success) {
    update.lastSuccess = admin.firestore.Timestamp.fromMillis(now);
  }

  try {
    await docRef.set(update, { merge: true });
  } catch (error) {
    console.error("Failed to release Slack notification dedupe lock", error);
  }
}

const SINGLE_MENTION_SENTINEL = "__SLACK_MENTION__";
const MULTI_MENTION_SENTINEL = "__SLACK_MENTIONS__";

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

function getFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "";
}

function resolveIntegrationNameFromGroup(groupData) {
  if (!groupData || typeof groupData !== "object") {
    return "";
  }

  const candidates = [];
  const addCandidate = (value) => {
    if (typeof value !== "string") {
      return;
    }

    const trimmed = value.trim();
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  addCandidate(groupData.integrationName);
  addCandidate(groupData.integrationDisplayName);
  addCandidate(groupData.assignedIntegrationName);
  addCandidate(groupData.assignedIntegrationDisplayName);

  const integration =
    groupData.integration && typeof groupData.integration === "object"
      ? groupData.integration
      : null;
  if (integration) {
    addCandidate(integration.name);
    addCandidate(integration.displayName);
    addCandidate(integration.label);
    addCandidate(integration.title);
  }

  const assignedIntegration =
    groupData.assignedIntegration &&
    typeof groupData.assignedIntegration === "object"
      ? groupData.assignedIntegration
      : null;
  if (assignedIntegration) {
    addCandidate(assignedIntegration.name);
    addCandidate(assignedIntegration.displayName);
    addCandidate(assignedIntegration.label);
    addCandidate(assignedIntegration.title);
  }

  const assignedIntegrationId = getFirstNonEmptyString(
    groupData.assignedIntegrationId,
    integration ? integration.id : "",
  );

  if (assignedIntegrationId) {
    const statusMaps = [];
    if (
      groupData.integrationStatuses &&
      typeof groupData.integrationStatuses === "object"
    ) {
      statusMaps.push(groupData.integrationStatuses);
    }
    if (
      groupData.integrationStatus &&
      typeof groupData.integrationStatus === "object"
    ) {
      statusMaps.push(groupData.integrationStatus);
    }

    for (const statusMap of statusMaps) {
      if (!statusMap || typeof statusMap !== "object") {
        continue;
      }

      const entry = statusMap[assignedIntegrationId];
      if (entry && typeof entry === "object") {
        addCandidate(entry.integrationName);
        addCandidate(entry.name);
        addCandidate(entry.displayName);
      }
    }
  }

  return candidates.length ? candidates[0] : "";
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

function replaceMentionTokensInString(input, mentionText, singleMention) {
  if (typeof input !== "string") {
    return input;
  }

  let output = input;

  if (output.includes(MULTI_MENTION_SENTINEL)) {
    output = output.split(MULTI_MENTION_SENTINEL).join(mentionText);
  }

  if (output.includes(SINGLE_MENTION_SENTINEL)) {
    output = output.split(SINGLE_MENTION_SENTINEL).join(singleMention);
  }

  return output;
}

function cleanupSlackText(value) {
  if (typeof value !== "string") {
    return value;
  }

  const collapsed = value.replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

function payloadContainsMentionPlaceholder(payload) {
  if (!payload) {
    return false;
  }

  const containsToken = (value) =>
    typeof value === "string" &&
    (value.includes(SINGLE_MENTION_SENTINEL) ||
      value.includes(MULTI_MENTION_SENTINEL));

  if (containsToken(payload)) {
    return true;
  }

  if (typeof payload !== "object") {
    return false;
  }

  if (containsToken(payload.text)) {
    return true;
  }

  if (Array.isArray(payload.blocks)) {
    return payload.blocks.some((block) => {
      if (
        !block ||
        block.type !== "section" ||
        !block.text ||
        typeof block.text.text !== "string"
      ) {
        return false;
      }

      return containsToken(block.text.text);
    });
  }

  return false;
}

function replaceMentionSentinels(payload, mentions = []) {
  const mentionText = mentions.join(" ");
  const singleMention = mentions.length ? mentions[0] : "";

  if (typeof payload === "string") {
    const replaced = replaceMentionTokensInString(
      payload,
      mentionText,
      singleMention,
    );

    if (replaced === payload) {
      return payload;
    }

    return cleanupSlackText(replaced);
  }

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  let textChanged = false;
  let blocksChanged = false;

  let updatedText = payload.text;
  if (typeof payload.text === "string") {
    const replacedText = replaceMentionTokensInString(
      payload.text,
      mentionText,
      singleMention,
    );

    if (replacedText !== payload.text) {
      textChanged = true;
      updatedText = cleanupSlackText(replacedText);
    }
  }

  let updatedBlocks = payload.blocks;
  if (Array.isArray(payload.blocks)) {
    const newBlocks = [];

    payload.blocks.forEach((block) => {
      if (
        block &&
        block.type === "section" &&
        block.text &&
        typeof block.text.text === "string"
      ) {
        const replacedBlockText = replaceMentionTokensInString(
          block.text.text,
          mentionText,
          singleMention,
        ).trim();

        if (!replacedBlockText) {
          blocksChanged = true;
          return;
        }

        if (replacedBlockText !== block.text.text) {
          blocksChanged = true;
          newBlocks.push({
            ...block,
            text: { ...block.text, text: replacedBlockText },
          });
          return;
        }
      }

      newBlocks.push(block);
    });

    if (blocksChanged) {
      updatedBlocks = newBlocks;
    }
  }

  if (!textChanged && !blocksChanged) {
    return payload;
  }

  const updated = { ...payload };
  if (textChanged) {
    updated.text = updatedText;
  }

  if (blocksChanged) {
    updated.blocks = updatedBlocks;
  }

  return updated;
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
    integration: formatInlineCode(
      context.integrationName,
      context.integrationName || "Unassigned",
    ),
    integrationName: context.integrationName || "Unassigned",
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
    mention: SINGLE_MENTION_SENTINEL,
    mentions: MULTI_MENTION_SENTINEL,
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

async function getSiteSlackTemplates() {
  const now = Date.now();
  if (siteTemplateCache.templates && siteTemplateCache.expiresAt > now) {
    return siteTemplateCache.templates;
  }

  try {
    const snap = await db.collection("settings").doc("site").get();
    if (!snap.exists) {
      siteTemplateCache.templates = null;
      siteTemplateCache.expiresAt = now + 30000;
      return null;
    }

    const data = snap.data() || {};
    const templates = data.slackMessageTemplates || null;
    siteTemplateCache.templates = templates;
    siteTemplateCache.expiresAt = now + 60000;
    return templates;
  } catch (error) {
    console.error("Failed to load Slack message templates", error);
    siteTemplateCache.templates = null;
    siteTemplateCache.expiresAt = now + 15000;
    return null;
  }
}

const EMAIL_REGEX = /.+@.+\..+/i;
const SLACK_MENTION_PATTERN = /^<[@!][^>]+>$/;
const SLACK_MAILTO_PATTERN = /^<mailto:([^>|]+)(?:\|[^>]+)?>$/i;

function hasEmailMentionEntries(map) {
  if (!map) {
    return false;
  }

  if (map instanceof Map) {
    return map.size > 0;
  }

  if (typeof map === "object") {
    return Object.keys(map).length > 0;
  }

  return false;
}

function getMentionUserIdForEmail(map, email) {
  if (!map || !email) {
    return null;
  }

  const normalized = email.toLowerCase();

  if (map instanceof Map) {
    return map.get(normalized) || map.get(email) || null;
  }

  if (typeof map === "object") {
    return map[normalized] || map[email] || null;
  }

  return null;
}

function sanitizeEmailValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  let trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const mailtoMatch = trimmed.match(SLACK_MAILTO_PATTERN);
  if (mailtoMatch) {
    return mailtoMatch[1].trim().toLowerCase();
  }

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (/^mailto:/i.test(trimmed)) {
    trimmed = trimmed.replace(/^mailto:/i, "").trim();
  }

  trimmed = trimmed.replace(/^[<\s]+/, "").replace(/[>\s]+$/, "");
  trimmed = trimmed.replace(/[;,]+$/, "");

  if (EMAIL_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

function formatMentionString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (SLACK_MENTION_PATTERN.test(trimmed)) {
    if (trimmed.startsWith('<@')) {
      const separatorIndex = trimmed.indexOf('|');
      if (separatorIndex !== -1) {
        return `${trimmed.slice(0, separatorIndex)}>`;
      }
    }
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "@channel" || lower === "@here" || lower === "@everyone") {
    return `<!${lower.slice(1)}>`;
  }

  const memberIdMatch = trimmed.match(/^@?([UW][A-Z0-9]{8,})$/);
  if (memberIdMatch) {
    return `<@${memberIdMatch[1]}>`;
  }

  if (/^<!subteam\^[A-Z0-9]+(\|[^>]+)?>$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function normalizeMentionEntries(entry) {
  const emails = new Set();
  const mentions = new Set();

  const addEmail = (value) => {
    const sanitized = sanitizeEmailValue(value);
    if (!sanitized) {
      return false;
    }
    emails.add(sanitized);
    return true;
  };

  const addMention = (value) => {
    const formatted = formatMentionString(value);
    if (!formatted) {
      return false;
    }
    mentions.add(formatted);
    return true;
  };

  const processString = (raw) => {
    if (typeof raw !== "string") {
      return;
    }
    raw
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (!addEmail(part)) {
          addMention(part);
        }
      });
  };

  if (Array.isArray(entry)) {
    entry.forEach((value) => {
      if (!addEmail(value)) {
        addMention(value);
      }
    });
  } else if (typeof entry === "string") {
    processString(entry);
  } else if (entry && typeof entry === "object") {
    if (Array.isArray(entry.emails)) {
      entry.emails.forEach(addEmail);
    }
    if (Array.isArray(entry.mentions)) {
      entry.mentions.forEach(addMention);
    }
    if (typeof entry.email === "string") {
      addEmail(entry.email);
    }
    if (typeof entry.mention === "string") {
      addMention(entry.mention);
    }
  }

  return {
    emails: Array.from(emails),
    mentions: Array.from(mentions),
  };
}

function getMentionsForStatus(config, status) {
  const empty = { emails: [], mentions: [] };
  if (!config || typeof config !== "object") {
    return empty;
  }

  const direct = normalizeMentionEntries(config[status]);
  if (direct.emails.length || direct.mentions.length) {
    return direct;
  }

  const normalizedKey = status.replace(/[-\s]+/g, "");
  if (normalizedKey && normalizedKey !== status) {
    const alternate = normalizeMentionEntries(config[normalizedKey]);
    if (alternate.emails.length || alternate.mentions.length) {
      return alternate;
    }
  }

  const fallbackKeys = ["default", "all", "any"];
  for (const key of fallbackKeys) {
    const fallback = normalizeMentionEntries(config[key]);
    if (fallback.emails.length || fallback.mentions.length) {
      return fallback;
    }
  }

  return empty;
}

function replaceMailtoMentionsInString(input, emailMentionsMap) {
  if (typeof input !== "string" || !hasEmailMentionEntries(emailMentionsMap)) {
    return input;
  }

  let changed = false;

  const replaceMatch = (match) => {
    const normalizedEmail = sanitizeEmailValue(match);
    if (!normalizedEmail) {
      return match;
    }

    const userId = getMentionUserIdForEmail(emailMentionsMap, normalizedEmail);
    if (!userId) {
      return match;
    }

    changed = true;
    return `<@${userId}>`;
  };

  let output = input.replace(/<mailto:[^>]+>/gi, replaceMatch);
  output = output.replace(/mailto:[^\s>]+/gi, replaceMatch);

  return changed ? output : input;
}

function replaceMailtoMentionsInPayload(payload, emailMentionsMap) {
  if (!hasEmailMentionEntries(emailMentionsMap)) {
    return payload;
  }

  if (typeof payload === "string") {
    return replaceMailtoMentionsInString(payload, emailMentionsMap);
  }

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  let textChanged = false;
  let updatedText = payload.text;
  if (typeof payload.text === "string") {
    const replacedText = replaceMailtoMentionsInString(payload.text, emailMentionsMap);
    if (replacedText !== payload.text) {
      textChanged = true;
      updatedText = replacedText;
    }
  }

  let blocksChanged = false;
  let updatedBlocks = payload.blocks;
  if (Array.isArray(payload.blocks)) {
    const newBlocks = [];

    payload.blocks.forEach((block) => {
      if (
        block &&
        block.type === "section" &&
        block.text &&
        typeof block.text.text === "string"
      ) {
        const replacedBlockText = replaceMailtoMentionsInString(
          block.text.text,
          emailMentionsMap,
        );

        if (replacedBlockText !== block.text.text) {
          blocksChanged = true;
          newBlocks.push({
            ...block,
            text: { ...block.text, text: replacedBlockText },
          });
          return;
        }
      }

      newBlocks.push(block);
    });

    if (blocksChanged) {
      updatedBlocks = newBlocks;
    }
  }

  if (!textChanged && !blocksChanged) {
    return payload;
  }

  const updated = { ...payload };
  if (textChanged) {
    updated.text = updatedText;
  }

  if (blocksChanged) {
    updated.blocks = updatedBlocks;
  }

  return updated;
}

function getCachedMentionLookup(cacheKey) {
  if (!mentionLookupCache.has(cacheKey)) {
    return undefined;
  }

  const cached = mentionLookupCache.get(cacheKey);
  if (!cached || typeof cached !== "object") {
    mentionLookupCache.delete(cacheKey);
    return undefined;
  }

  const expiresAt = typeof cached.expiresAt === "number" ? cached.expiresAt : 0;
  if (expiresAt && expiresAt <= Date.now()) {
    mentionLookupCache.delete(cacheKey);
    return undefined;
  }

  return cached.value;
}

function setCachedMentionLookup(cacheKey, value, ttlMs) {
  const ttl = Number(ttlMs) || 0;
  mentionLookupCache.set(cacheKey, {
    value,
    expiresAt: ttl > 0 ? Date.now() + ttl : 0,
  });
}

async function lookupSlackUserIdByEmail(email, token) {
  if (!email || !token) {
    return null;
  }

  const cacheKey = `${token}:${email}`;
  const cachedResult = getCachedMentionLookup(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
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
      setCachedMentionLookup(cacheKey, null, MENTION_LOOKUP_FAILURE_TTL_MS);
      return null;
    }

    const body = await response.json();
    if (body.ok && body.user && body.user.id) {
      const profile = body.user.profile || {};
      const displayName =
        (typeof profile.display_name === "string" && profile.display_name.trim()) ||
        (typeof profile.display_name_normalized === "string" &&
          profile.display_name_normalized.trim()) ||
        (typeof profile.real_name === "string" && profile.real_name.trim()) ||
        null;
      const result = {
        id: body.user.id,
        displayName,
      };
      setCachedMentionLookup(cacheKey, result, MENTION_LOOKUP_SUCCESS_TTL_MS);
      return result;
    }

    console.warn("Slack lookup returned no user", email, body.error);
    setCachedMentionLookup(cacheKey, null, MENTION_LOOKUP_FAILURE_TTL_MS);
    return null;
  } catch (error) {
    console.error("Slack lookup error", email, error);
    setCachedMentionLookup(cacheKey, null, MENTION_LOOKUP_FAILURE_TTL_MS);
    return null;
  }
}

function appendMentionsToPayload(payload, mentionText) {
  if (!mentionText) {
    return payload;
  }

  const appendToText = (existingText = "") => {
    const combined = existingText
      ? `${mentionText}\n${existingText}`
      : mentionText;
    return cleanupSlackText(combined);
  };

  if (!payload) {
    return { text: appendToText() };
  }

  if (typeof payload === "string") {
    return { text: appendToText(payload) };
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

  if (typeof payload.text === "string") {
    const existingText = payload.text.trim();
    updated.text = appendToText(existingText);
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

  const dedupeKey = buildStatusNotificationCacheKey({
    brandCode: normalizedBrandCode || rawBrandCode,
    adGroupId,
    status,
    reviewUrl: reviewUrlRaw,
    adGroupUrl: adGroupUrlRaw,
    note,
  });

  const now = Date.now();
  pruneRecentStatusNotifications(now);

  const existingEntry = recentStatusNotificationCache.get(dedupeKey);
  if (existingEntry && now - existingEntry.timestamp < RECENT_STATUS_NOTIFICATION_TTL_MS) {
    res.status(200).json({
      ok: true,
      deduplicated: true,
      message: "Duplicate Slack status notification suppressed.",
    });
    return;
  }

  const { allowed: lockAllowed, docRef: dedupeLockRef } =
    await acquireStatusNotificationLock(dedupeKey, now);

  if (!lockAllowed) {
    markStatusNotificationProcessed(dedupeKey);
    res.status(200).json({
      ok: true,
      deduplicated: true,
      message: "Duplicate Slack status notification suppressed.",
    });
    return;
  }

  let lockRefForCleanup = dedupeLockRef || null;

  recentStatusNotificationCache.set(dedupeKey, {
    timestamp: now,
    inFlight: true,
  });

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
      await releaseStatusNotificationLock(lockRefForCleanup, {
        success: true,
        now: Date.now(),
      });
      markStatusNotificationProcessed(dedupeKey);
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

    let integrationName = resolveIntegrationNameFromGroup(adGroupData);

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

    const brandSlackMentions =
      brandDocData && typeof brandDocData.slackMentions === "object"
        ? brandDocData.slackMentions
        : null;

    if (!integrationName && brandDocData && typeof brandDocData === "object") {
      integrationName = getFirstNonEmptyString(
        brandDocData.defaultIntegrationName,
        brandDocData.defaultIntegrationDisplayName,
        brandDocData.integrationName,
        brandDocData.integrationDisplayName,
      );

      if (
        !integrationName &&
        brandDocData.defaultIntegration &&
        typeof brandDocData.defaultIntegration === "object"
      ) {
        integrationName = getFirstNonEmptyString(
          brandDocData.defaultIntegration.name,
          brandDocData.defaultIntegration.displayName,
          brandDocData.defaultIntegration.integrationName,
          brandDocData.defaultIntegration.label,
        );
      }
    }

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
      integrationName,
    }, siteTemplates);

    const externalText = buildExternalMessage(status, {
      adGroupName: displayName,
      approvedCount,
      editRequestedCount,
      rejectedCount,
      reviewUrl,
      productNames,
      integrationName,
    }, siteTemplates);

    const externalPayload = externalText ? { text: externalText } : null;
    const mentionConfig = getMentionsForStatus(brandSlackMentions, status);
    const mentionInfoCache = new Map();

    const results = [];
    for (const doc of docsById.values()) {
      try {
        const docData = doc.data() || {};
        const audience = normalizeAudience(docData.audience) || "external";
        const basePayload =
          audience === "internal" ? internalMessage : externalPayload;
        const mentionPlaceholderUsed = payloadContainsMentionPlaceholder(
          basePayload,
        );

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
        let mentionInfo = null;
        if (mentionConfig.emails.length || mentionConfig.mentions.length) {
          const cacheKey = `${token}:${mentionConfig.emails.join(",")}:${mentionConfig.mentions.join(",")}`;
          mentionInfo = mentionInfoCache.get(cacheKey);

          if (!mentionInfo) {
            const mentionSet = new Set();
            const mentionOrder = [];
            const emailMentionMap = new Map();
            const addMention = (value) => {
              if (!value || mentionSet.has(value)) {
                return;
              }
              mentionSet.add(value);
              mentionOrder.push(value);
            };

            mentionConfig.mentions.forEach(addMention);

            for (const email of mentionConfig.emails) {
              const userInfo = await lookupSlackUserIdByEmail(email, token);
              if (userInfo && userInfo.id) {
                emailMentionMap.set(email, userInfo.id);
                addMention(`<@${userInfo.id}>`);
              } else {
                const label =
                  (userInfo && userInfo.displayName) ||
                  (typeof email === "string" && email.includes("@")
                    ? `@${email.split("@")[0]}`
                    : email);
                addMention(`<mailto:${email}|${label || email}>`);
              }
            }

            mentionInfo = {
              mentions: mentionOrder,
              text: mentionOrder.join(" "),
              emailMentions: emailMentionMap,
            };
            mentionInfoCache.set(cacheKey, mentionInfo);
          }
        }

        const replacedPayload = replaceMentionSentinels(
          payloadToSend,
          (mentionInfo && mentionInfo.mentions) || [],
        );
        if (replacedPayload !== payloadToSend) {
          payloadToSend = replacedPayload;
        }

        if (!mentionPlaceholderUsed) {
          const mentionText = mentionInfo ? mentionInfo.text : "";
          if (mentionText) {
            payloadToSend = appendMentionsToPayload(payloadToSend, mentionText);
          }
        }

        if (mentionInfo && hasEmailMentionEntries(mentionInfo.emailMentions)) {
          payloadToSend = replaceMailtoMentionsInPayload(
            payloadToSend,
            mentionInfo.emailMentions,
          );
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
      await releaseStatusNotificationLock(lockRefForCleanup, {
        success: false,
        now: Date.now(),
      });
      clearStatusNotificationEntry(dedupeKey);
      res.status(502).json({ error: "Failed to post Slack message", results });
      return;
    }

    await releaseStatusNotificationLock(lockRefForCleanup, {
      success: true,
      now: Date.now(),
    });
    markStatusNotificationProcessed(dedupeKey);
    res.status(200).json({ ok: true, results });
  } catch (error) {
    console.error("Slack status update error", error);
    await releaseStatusNotificationLock(lockRefForCleanup, {
      success: false,
      now: Date.now(),
    });
    clearStatusNotificationEntry(dedupeKey);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};
