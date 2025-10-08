const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
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
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI_VALUES = (process.env.SLACK_REDIRECT_URI || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const SLACK_REDIRECT_URI = SLACK_REDIRECT_URI_VALUES[0];

function isAllowedRedirectUri(uri) {
  if (!uri) {
    return false;
  }

  return SLACK_REDIRECT_URI_VALUES.includes(uri);
}

function selectRedirectUriForExchange(stateData) {
  if (stateData && typeof stateData.redirectUri === "string") {
    const candidate = stateData.redirectUri.trim();
    if (candidate && isAllowedRedirectUri(candidate)) {
      return candidate;
    }

    if (candidate && !isAllowedRedirectUri(candidate)) {
      console.error("Slack OAuth state contained unapproved redirect URI", {
        redirectUri: candidate,
      });
    }
  }

  return SLACK_REDIRECT_URI;
}

function buildErrorRedirectLocation(reason, stateData) {
  const fallback = `/slack/install-error?reason=${encodeURIComponent(reason)}`;
  const target = stateData?.errorRedirect;

  if (!target) {
    return fallback;
  }

  try {
    const url = new URL(target);
    if (reason && !url.searchParams.has("reason")) {
      url.searchParams.set("reason", reason);
    }
    return url.toString();
  } catch (error) {
    console.error("Invalid error redirect in Slack OAuth state", {
      errorRedirect: target,
      error: error?.message,
    });
    return fallback;
  }
}

function buildSuccessRedirectLocation(teamId, teamName, stateData) {
  const fallback = `/slack/installed?team=${encodeURIComponent(teamId)}`;
  const target = stateData?.successRedirect;

  if (!target) {
    return fallback;
  }

  try {
    const url = new URL(target);

    if (teamId && !url.searchParams.has("team")) {
      url.searchParams.set("team", teamId);
    }

    if (teamName && !url.searchParams.has("team_name")) {
      url.searchParams.set("team_name", teamName);
    }

    return url.toString();
  } catch (error) {
    console.error("Invalid success redirect in Slack OAuth state", {
      successRedirect: target,
      error: error?.message,
    });
    return fallback;
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

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const searchParams = getRequestSearchParams(req);
  const code = resolveQueryParam(req, searchParams, "code");
  const state = resolveQueryParam(req, searchParams, "state");
  const error = resolveQueryParam(req, searchParams, "error");
  const errorDescription = resolveQueryParam(
    req,
    searchParams,
    "error_description"
  );

  if (error) {
    console.error("Slack OAuth callback error", {
      error,
      error_description: errorDescription,
      state,
    });
    if (state && db) {
      try {
        const stateRef = db.collection("slackOauthStates").doc(state);
        const stateSnap = await stateRef.get();

        if (stateSnap.exists) {
          const stateData = stateSnap.data() || {};
          await stateRef.delete().catch((deleteError) => {
            console.error("Failed to delete Slack OAuth state after error", deleteError);
          });

          const location = buildErrorRedirectLocation(error, stateData);
          redirect(res, location);
          return;
        }
      } catch (stateError) {
        console.error("Unable to resolve Slack OAuth error redirect", stateError);
      }
    }

    const fallbackLocation = `/slack/install-error?reason=${encodeURIComponent(
      error
    )}`;
    redirect(res, fallbackLocation);
    return;
  }

  if (!db) {
    const firebaseErrorText = missingFirebaseEnvVars.length
      ? `Missing Firebase configuration. Please set ${missingFirebaseEnvVars.join(", ")} in the environment.`
      : firebaseInitError?.message || "Firebase configuration error. See server logs for details.";
    console.error("Firebase Admin SDK is not initialized", firebaseInitError);
    redirect(
      res,
      `/slack/install-error?reason=${encodeURIComponent("server_error")}`
    );
    return;
  }

  let stateData = null;

  if (!state) {
    console.warn(
      "Slack OAuth callback missing state parameter; proceeding with fallback handling"
    );
    stateData = {};
  } else {
    try {
      const stateRef = db.collection("slackOauthStates").doc(state);
      const stateSnap = await stateRef.get();

      if (!stateSnap.exists) {
        console.error("Slack OAuth callback received invalid state", { state });
        redirect(res, "/slack/install-error?reason=invalid_state");
        return;
      }

      stateData = stateSnap.data() || {};

      await stateRef.delete().catch((deleteError) => {
        console.error("Failed to delete Slack OAuth state", deleteError);
      });
    } catch (stateError) {
      console.error("Error validating Slack OAuth state", stateError);
      redirect(res, "/slack/install-error?reason=state_validation_failed");
      return;
    }
  }

  if (!code) {
    console.error("Slack OAuth callback missing authorization code", { state });
    const location = buildErrorRedirectLocation("missing_code", stateData);
    redirect(res, location);
    return;
  }

  const missingSlackEnv = [];
  if (!SLACK_CLIENT_ID) missingSlackEnv.push("SLACK_CLIENT_ID");
  if (!SLACK_CLIENT_SECRET) missingSlackEnv.push("SLACK_CLIENT_SECRET");
  if (!SLACK_REDIRECT_URI) missingSlackEnv.push("SLACK_REDIRECT_URI");

  if (missingSlackEnv.length) {
    console.error("Missing Slack OAuth environment variables", missingSlackEnv);
    const location = buildErrorRedirectLocation(
      "configuration_error",
      stateData
    );
    redirect(res, location);
    return;
  }

  let oauthResponse;
  const redirectUriForExchange = selectRedirectUriForExchange(stateData);

  try {
    const response = await fetchWithFallback("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: redirectUriForExchange,
        code,
      }).toString(),
    });

    oauthResponse = await response.json();

    if (!response.ok || !oauthResponse.ok) {
      console.error("Slack OAuth exchange failed", {
        status: response.status,
        statusText: response.statusText,
        body: oauthResponse,
      });
      const location = buildErrorRedirectLocation("oauth_failed", stateData);
      redirect(res, location);
      return;
    }
  } catch (exchangeError) {
    console.error("Slack OAuth exchange error", exchangeError);
    const location = buildErrorRedirectLocation(
      "oauth_request_failed",
      stateData
    );
    redirect(res, location);
    return;
  }

  const teamId = oauthResponse?.team?.id;
  const teamName = oauthResponse?.team?.name;
  const authedUserId = oauthResponse?.authed_user?.id || null;
  const installerUserId =
    oauthResponse?.installer_user_id || oauthResponse?.authed_user?.id || null;
  const accessToken = oauthResponse?.access_token;
  const scope = oauthResponse?.scope;
  const appId = oauthResponse?.app_id;

  if (!teamId || !accessToken) {
    console.error("Slack OAuth response missing required fields", oauthResponse);
    const location = buildErrorRedirectLocation("invalid_response", stateData);
    redirect(res, location);
    return;
  }

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection("slackWorkspaces").doc(teamId).set(
      {
        teamId,
        teamName: teamName || null,
        authedUserId,
        installerUserId,
        accessToken,
        scope: scope || null,
        appId: appId || null,
        updatedAt: now,
        installedAt: now,
      },
      { merge: true }
    );
  } catch (persistError) {
    console.error("Failed to persist Slack workspace installation", persistError);
    const location = buildErrorRedirectLocation("persistence_failed", stateData);
    redirect(res, location);
    return;
  }

  const successLocation = buildSuccessRedirectLocation(
    teamId,
    teamName,
    stateData
  );
  redirect(res, successLocation);
};
