const { randomBytes } = require("crypto");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("../firebase");
const {
  getRequestSearchParams,
  resolveQueryParam,
} = require("./request-utils");

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_REDIRECT_URI_VALUES = (process.env.SLACK_REDIRECT_URI || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const SLACK_REDIRECT_URI = SLACK_REDIRECT_URI_VALUES[0];
const SLACK_DEFAULT_SCOPES = process.env.SLACK_INSTALL_SCOPES || "commands,chat:write";

function isAllowedRedirectUri(uri) {
  if (!uri) {
    return false;
  }

  return SLACK_REDIRECT_URI_VALUES.includes(uri);
}

function normalizeScopes(scopes) {
  if (!scopes) {
    return SLACK_DEFAULT_SCOPES;
  }

  if (typeof scopes !== "string") {
    return SLACK_DEFAULT_SCOPES;
  }

  const parts = scopes
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!parts.length) {
    return SLACK_DEFAULT_SCOPES;
  }

  return Array.from(new Set(parts)).join(",");
}

function normalizeUserScopes(userScope) {
  if (!userScope || typeof userScope !== "string") {
    return undefined;
  }

  const parts = userScope
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!parts.length) {
    return undefined;
  }

  return Array.from(new Set(parts)).join(",");
}

const ALLOWED_REDIRECT_PROTOCOLS = new Set(["https:", "http:"]);

function normalizeExternalRedirect(value) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (!ALLOWED_REDIRECT_PROTOCOLS.has(url.protocol)) {
      console.error("Rejected Slack install redirect with unsupported protocol", {
        value,
      });
      return undefined;
    }

    return url.toString();
  } catch (error) {
    console.error("Failed to parse Slack install redirect", {
      value,
      error: error?.message,
    });
    return undefined;
  }
}

function resolveRedirectUri(req, searchParams) {
  const redirectCandidates = [
    "redirect_uri",
    "redirectUri",
  ];

  for (const key of redirectCandidates) {
    const value = resolveQueryParam(req, searchParams, key);
    if (value && isAllowedRedirectUri(value)) {
      return value;
    }

    if (value && !isAllowedRedirectUri(value)) {
      console.error("Received disallowed Slack redirect URI request", {
        redirectUri: value,
      });
    }
  }

  return SLACK_REDIRECT_URI;
}

function buildAuthorizeUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  userScope,
}) {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  if (userScope) {
    url.searchParams.set("user_scope", userScope);
  }

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

  const searchParams = getRequestSearchParams(req);
  const requestedScope = resolveQueryParam(req, searchParams, "scope");
  const scopes = normalizeScopes(requestedScope);
  const userScope = normalizeUserScopes(
    resolveQueryParam(req, searchParams, "user_scope") ||
      resolveQueryParam(req, searchParams, "userScope")
  );
  const successRedirect = normalizeExternalRedirect(
    resolveQueryParam(req, searchParams, "success_redirect") ||
      resolveQueryParam(req, searchParams, "successRedirect") ||
      resolveQueryParam(req, searchParams, "redirect") ||
      resolveQueryParam(req, searchParams, "continue") ||
      resolveQueryParam(req, searchParams, "return_to") ||
      resolveQueryParam(req, searchParams, "returnTo")
  );
  const errorRedirect = normalizeExternalRedirect(
    resolveQueryParam(req, searchParams, "error_redirect") ||
      resolveQueryParam(req, searchParams, "errorRedirect")
  );
  const redirectUri = resolveRedirectUri(req, searchParams);
  const state = randomBytes(16).toString("hex");

  try {
    const payload = {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      redirectUri,
      used: false,
    };

    if (scopes && scopes !== SLACK_DEFAULT_SCOPES) {
      payload.scopes = scopes;
    }

    if (userScope) {
      payload.userScope = userScope;
    }

    if (successRedirect) {
      payload.successRedirect = successRedirect;
    }

    if (errorRedirect) {
      payload.errorRedirect = errorRedirect;
    }

    await db.collection("slackOauthStates").doc(state).set(payload);
  } catch (error) {
    console.error("Failed to store Slack OAuth state", error);
    res.status(500).json({ error: "Failed to prepare OAuth state" });
    return;
  }

  const authorizeUrl = buildAuthorizeUrl({
    clientId: SLACK_CLIENT_ID,
    redirectUri,
    scopes,
    state,
    userScope,
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ url: authorizeUrl });
};
