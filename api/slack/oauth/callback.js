const { request: httpRequest } = require("http");
const { request: httpsRequest } = require("https");
const {
  admin,
  db,
  firebaseInitError,
  missingFirebaseEnvVars,
} = require("../firebase");

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI;

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

function getRequestSearchParams(req) {
  const combinedSearchParams = new URLSearchParams();

  const appendParams = (params) => {
    if (!params) {
      return;
    }

    for (const [key, value] of params.entries()) {
      if (typeof value === "string" && value.length) {
        if (!combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, value);
        }
      }
    }
  };

  const protoHeader = req.headers?.["x-forwarded-proto"] || "https";
  const protocol = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader.split(",")[0];
  const host =
    req.headers?.host ||
    (Array.isArray(req.headers?.["x-forwarded-host"])
      ? req.headers["x-forwarded-host"][0]
      : req.headers?.["x-forwarded-host"]) ||
    "localhost";
  const baseUrl = `${protocol}://${host}`;

  const candidateUrls = [];

  const pushHeaderValue = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) candidateUrls.push(item);
      });
    } else {
      candidateUrls.push(value);
    }
  };

  if (typeof req.url === "string") {
    candidateUrls.push(req.url);
  }

  if (typeof req.originalUrl === "string") {
    candidateUrls.push(req.originalUrl);
  }

  pushHeaderValue(req.headers?.["x-vercel-forwarded-url"]);
  pushHeaderValue(req.headers?.["x-forwarded-url"]);
  pushHeaderValue(req.headers?.["x-forwarded-uri"]);
  pushHeaderValue(req.headers?.["x-original-url"]);

  for (const candidate of candidateUrls) {
    try {
      const parsedUrl = new URL(candidate, baseUrl);
      appendParams(parsedUrl.searchParams);
    } catch (parseError) {
      console.error("Failed to parse request URL candidate", {
        candidate,
        error: parseError?.message,
      });
    }
  }

  if (req.query && typeof req.query === "object") {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        const firstValid = value.find(
          (item) => typeof item === "string" && item.length
        );
        if (firstValid && !combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, firstValid);
        }
      } else if (typeof value === "string" && value.length) {
        if (!combinedSearchParams.has(key)) {
          combinedSearchParams.append(key, value);
        }
      }
    }
  }

  return combinedSearchParams;
}

function resolveQueryParam(req, searchParams, key) {
  if (searchParams.has(key)) {
    const value = searchParams.get(key);
    if (value && value !== "undefined" && value !== "null") {
      return value;
    }
    return undefined;
  }

  const fallback = req.query?.[key];
  if (Array.isArray(fallback)) {
    return fallback.find((item) => item && item !== "undefined" && item !== "null");
  }

  if (typeof fallback === "string" && fallback && fallback !== "undefined" && fallback !== "null") {
    return fallback;
  }

  return undefined;
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
    redirect(
      res,
      `/slack/install-error?reason=${encodeURIComponent(error)}${
        state ? `&state=${encodeURIComponent(state)}` : ""
      }`
    );
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

  if (!state) {
    console.error("Slack OAuth callback missing state parameter");
    redirect(res, "/slack/install-error?reason=missing_state");
    return;
  }

  try {
    const stateRef = db.collection("slackOauthStates").doc(state);
    const stateSnap = await stateRef.get();

    if (!stateSnap.exists) {
      console.error("Slack OAuth callback received invalid state", { state });
      redirect(res, "/slack/install-error?reason=invalid_state");
      return;
    }

    await stateRef.delete().catch((deleteError) => {
      console.error("Failed to delete Slack OAuth state", deleteError);
    });
  } catch (stateError) {
    console.error("Error validating Slack OAuth state", stateError);
    redirect(res, "/slack/install-error?reason=state_validation_failed");
    return;
  }

  if (!code) {
    console.error("Slack OAuth callback missing authorization code", { state });
    redirect(res, "/slack/install-error?reason=missing_code");
    return;
  }

  const missingSlackEnv = [];
  if (!SLACK_CLIENT_ID) missingSlackEnv.push("SLACK_CLIENT_ID");
  if (!SLACK_CLIENT_SECRET) missingSlackEnv.push("SLACK_CLIENT_SECRET");
  if (!SLACK_REDIRECT_URI) missingSlackEnv.push("SLACK_REDIRECT_URI");

  if (missingSlackEnv.length) {
    console.error("Missing Slack OAuth environment variables", missingSlackEnv);
    redirect(res, "/slack/install-error?reason=configuration_error");
    return;
  }

  let oauthResponse;

  try {
    const response = await fetchWithFallback("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: SLACK_REDIRECT_URI,
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
      redirect(res, "/slack/install-error?reason=oauth_failed");
      return;
    }
  } catch (exchangeError) {
    console.error("Slack OAuth exchange error", exchangeError);
    redirect(res, "/slack/install-error?reason=oauth_request_failed");
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
    redirect(res, "/slack/install-error?reason=invalid_response");
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
    redirect(res, "/slack/install-error?reason=persistence_failed");
    return;
  }

  redirect(
    res,
    `/slack/installed?team=${encodeURIComponent(teamId)}`
  );
};
