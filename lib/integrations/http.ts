import { createHash, createHmac, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";

import type { BinaryToTextEncoding } from "crypto";

import { fetchSecretPayload } from "./secrets";
import type { AuthConfig, HttpMethod, Integration, RetryPolicy } from "./types";

export interface IntegrationHttpRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface IntegrationHttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body?: unknown;
  durationMs: number;
}

export interface DispatchOptions {
  integration: Integration;
  dryRun: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = "Campfire-Integration-Client/1.0";
const DEFAULT_ACCEPT_HEADER = "application/json, */*;q=0.8";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);
const METHODS_WITHOUT_BODY = new Set<HttpMethod>(["GET"]);

interface NormalizedRetryPolicy {
  maxAttempts: number;
  initialIntervalMs: number;
  maxIntervalMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

interface SignedPayloadConfig {
  secret: string;
  algorithm: string;
  encoding: BinaryToTextEncoding;
  headerName: string;
  prefix?: string;
  timestampHeaderName?: string;
  timestampFormat: "iso" | "unix";
  additionalHeaders?: Record<string, string>;
}

interface PreparedRequest {
  url: string;
  headers: Headers;
  init: RequestInit;
  signature?: SignedPayloadConfig;
  bodyText?: string;
}

interface OAuthTokenCacheEntry {
  token: string;
  expiresAt: number;
}

const oauthTokenCache = new Map<string, OAuthTokenCacheEntry>();

export function buildIntegrationUrl(integration: Integration): string {
  const base = integration.baseUrl?.trim() ?? "";
  const path = integration.endpointPath?.trim() ?? "";

  if (!base) {
    return path || "";
  }

  const normalizedBase = base.replace(/\/$/, "");
  if (!path) {
    return normalizedBase;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function buildIntegrationRequest(
  integration: Integration,
  body: unknown,
  options: { headers?: Record<string, string> } = {}
): IntegrationHttpRequest {
  const headers = {
    ...(integration.headers ?? {}),
    ...(options.headers ?? {}),
  } as Record<string, string>;

  return {
    url: buildIntegrationUrl(integration),
    method: integration.method,
    headers,
    body,
    timeoutMs: integration.timeoutMs,
  };
}

export async function dispatchIntegrationRequest(
  request: IntegrationHttpRequest,
  { integration, dryRun }: DispatchOptions
): Promise<IntegrationHttpResponse> {
  const started = Date.now();

  if (dryRun) {
    return {
      status: 202,
      headers: {
        "x-integration-id": integration.id,
        "x-dispatch-mode": "dry-run",
      },
      body: {
        message: "Integration dispatch executed in dry-run mode.",
        request,
      },
      durationMs: Math.max(Date.now() - started, 1),
    };
  }

  const retryPolicy = normalizeRetryPolicy(integration.retryPolicy);
  const idempotencyKey = buildIdempotencyKey(integration);
  const timeoutMs = normalizeTimeout(request.timeoutMs ?? integration.timeoutMs);

  let secretValue: string | undefined;
  try {
    secretValue = integration.auth?.secret
      ? await fetchSecretPayload(integration.auth.secret)
      : undefined;
  } catch (error) {
    const resolvedError = error instanceof Error ? error : new Error(String(error));
    const wrapped = new Error(
      `Failed to resolve integration credentials for ${integration.id}: ${resolvedError.message}`
    );
    (wrapped as { cause?: unknown }).cause = resolvedError;
    throw wrapped;
  }

  let attempt = 0;
  let waitInterval = retryPolicy.initialIntervalMs;
  let lastError: unknown;
  let lastResponse: IntegrationHttpResponse | undefined;

  while (attempt < retryPolicy.maxAttempts) {
    attempt += 1;

    try {
      const prepared = await prepareHttpRequest(request, integration, {
        attempt,
        idempotencyKey,
        secret: secretValue,
      });

      if (prepared.signature) {
        applySignedPayloadSignature(
          prepared.headers,
          prepared.signature,
          prepared.bodyText ?? ""
        );
      }

      const attemptResponse = await performHttpRequest(
        prepared.url,
        prepared.init,
        timeoutMs
      );

      const responseWithMetadata = attachMetadataHeaders(
        attemptResponse,
        integration,
        attempt,
        dryRun
      );

      if (!shouldRetryStatus(responseWithMetadata.status) || attempt >= retryPolicy.maxAttempts) {
        return {
          ...responseWithMetadata,
          durationMs: Math.max(Date.now() - started, 1),
        };
      }

      lastResponse = responseWithMetadata;

      await sleepWithJitter(waitInterval, retryPolicy.jitter);
      waitInterval = computeNextDelay(waitInterval, retryPolicy);
    } catch (error) {
      lastError = error;

      if (attempt >= retryPolicy.maxAttempts) {
        throw createDispatchError(integration, attempt, error);
      }

      await sleepWithJitter(waitInterval, retryPolicy.jitter);
      waitInterval = computeNextDelay(waitInterval, retryPolicy);
    }
  }

  if (lastResponse) {
    return {
      ...lastResponse,
      durationMs: Math.max(Date.now() - started, 1),
    };
  }

  throw createDispatchError(
    integration,
    attempt,
    lastError ?? new Error("Unknown error while dispatching integration request.")
  );
}

function normalizeTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }

  return DEFAULT_TIMEOUT_MS;
}

function normalizeRetryPolicy(policy?: RetryPolicy): NormalizedRetryPolicy {
  const defaults: NormalizedRetryPolicy = {
    maxAttempts: 3,
    initialIntervalMs: 1000,
    maxIntervalMs: 30_000,
    backoffMultiplier: 2,
    jitter: true,
  };

  if (!policy) {
    return defaults;
  }

  const maxAttempts = Math.max(1, Math.floor(policy.maxAttempts ?? defaults.maxAttempts));
  const initialIntervalMs = Math.max(0, Math.floor(policy.initialIntervalMs ?? defaults.initialIntervalMs));
  const maxIntervalMs = Math.max(
    initialIntervalMs,
    Math.floor(policy.maxIntervalMs ?? defaults.maxIntervalMs)
  );
  const backoffMultiplier =
    typeof policy.backoffMultiplier === "number" && policy.backoffMultiplier > 0
      ? policy.backoffMultiplier
      : defaults.backoffMultiplier;
  const jitter = Boolean(policy.jitter ?? defaults.jitter);

  return {
    maxAttempts,
    initialIntervalMs,
    maxIntervalMs,
    backoffMultiplier,
    jitter,
  };
}

function computeNextDelay(currentDelay: number, policy: NormalizedRetryPolicy): number {
  if (currentDelay <= 0) {
    return policy.initialIntervalMs;
  }

  const next = currentDelay * policy.backoffMultiplier;
  if (!Number.isFinite(next) || next <= 0) {
    return policy.maxIntervalMs;
  }

  return Math.min(policy.maxIntervalMs, Math.max(next, policy.initialIntervalMs));
}

async function sleepWithJitter(delayMs: number, jitter: boolean): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  const actualDelay = jitter ? Math.round(Math.random() * delayMs) : Math.round(delayMs);
  if (actualDelay <= 0) {
    return;
  }

  await sleep(actualDelay);
}

function shouldRetryStatus(status: number): boolean {
  if (RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  return status >= 500 && status < 600;
}

function attachMetadataHeaders(
  response: IntegrationHttpResponse,
  integration: Integration,
  attempt: number,
  dryRun: boolean
): IntegrationHttpResponse {
  return {
    ...response,
    headers: {
      ...response.headers,
      "x-integration-id": integration.id,
      "x-integration-version": integration.version,
      "x-dispatch-mode": dryRun ? "dry-run" : "live",
      "x-dispatch-attempt": String(attempt),
    },
  };
}

async function prepareHttpRequest(
  baseRequest: IntegrationHttpRequest,
  integration: Integration,
  options: { attempt: number; idempotencyKey?: string; secret?: string | undefined }
): Promise<PreparedRequest> {
  let url = baseRequest.url;
  const headers = headersFromRecord(baseRequest.headers);

  if (!headers.has("user-agent")) {
    headers.set("User-Agent", DEFAULT_USER_AGENT);
  }

  if (!headers.has("accept")) {
    headers.set("Accept", DEFAULT_ACCEPT_HEADER);
  }

  headers.set("X-Integration-Id", integration.id);
  headers.set("X-Integration-Version", integration.version);
  headers.set("X-Integration-Attempt", String(options.attempt));
  headers.set("X-Dispatch-Mode", "live");

  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  let bodyPayload: unknown = baseRequest.body;
  let bodyCloned = false;

  const ensureBodyObject = (): Record<string, unknown> => {
    if (!isRecord(bodyPayload)) {
      if (bodyPayload == null) {
        bodyPayload = {};
      } else {
        throw new Error(
          `Integration ${integration.id} requires a JSON object payload to inject credentials but received ${typeof bodyPayload}.`
        );
      }
    }

    if (!bodyCloned) {
      bodyPayload = { ...(bodyPayload as Record<string, unknown>) };
      bodyCloned = true;
    }

    return bodyPayload as Record<string, unknown>;
  };

  const authConfig = integration.auth ?? ({ strategy: "none" } as AuthConfig);
  let signatureConfig: SignedPayloadConfig | undefined;

  switch (authConfig.strategy) {
    case "api_key": {
      const keyName = getString(authConfig.keyName);
      if (!keyName) {
        throw new Error(
          `Integration ${integration.id} is missing auth.keyName for API key authentication.`
        );
      }

      const credential = options.secret;
      if (!credential) {
        throw new Error(`Integration ${integration.id} is missing API key secret credentials.`);
      }

      const prefix = getString(authConfig.metadata?.prefix) ?? "";
      const value = `${prefix}${credential}`;
      const location = authConfig.location ?? "header";

      if (location === "header") {
        headers.set(keyName, value);
      } else if (location === "query") {
        url = appendQueryParam(url, keyName, value);
      } else if (location === "body") {
        const bodyObject = ensureBodyObject();
        bodyObject[keyName] = value;
      }
      break;
    }

    case "basic": {
      const encodedCredentials = resolveBasicCredentials(authConfig, options.secret, integration);
      const headerName = getString(authConfig.keyName) ?? "Authorization";
      const prefix = getString(authConfig.metadata?.prefix) ?? "Basic ";
      headers.set(headerName, `${prefix}${encodedCredentials}`);
      break;
    }

    case "oauth2": {
      const token = await resolveOAuthToken(authConfig, options.secret, integration);
      const keyName = getString(authConfig.keyName) ?? "Authorization";
      const prefix = getString(authConfig.metadata?.prefix) ?? "Bearer ";
      const value = `${prefix}${token}`;
      const location = authConfig.location ?? "header";

      if (location === "header") {
        headers.set(keyName, value);
      } else if (location === "query") {
        url = appendQueryParam(url, keyName, value);
      } else if (location === "body") {
        const bodyObject = ensureBodyObject();
        bodyObject[keyName] = value;
      }
      break;
    }

    case "signed_payload": {
      if (!options.secret) {
        throw new Error(`Integration ${integration.id} is missing signing credentials.`);
      }

      signatureConfig = resolveSignedPayloadConfig(authConfig, options.secret);
      break;
    }

    case "none":
    default:
      break;
  }

  const { bodyInit, bodyText } = encodeRequestBody(bodyPayload, headers, baseRequest.method);

  return {
    url,
    headers,
    init: {
      method: baseRequest.method,
      headers,
      body: bodyInit ?? undefined,
    },
    signature: signatureConfig,
    bodyText,
  };
}

async function performHttpRequest(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<IntegrationHttpResponse> {
  const attemptStarted = Date.now();
  const controller = new AbortController();
  const finalInit: RequestInit = { ...init, signal: controller.signal };

  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timeoutHandle: NodeJS.Timeout | undefined =
    timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const response = await fetch(url, finalInit);
    const headers = headersToRecord(response.headers);
    const body = await parseResponseBody(response);

    return {
      status: response.status,
      headers,
      body,
      durationMs: Math.max(Date.now() - attemptStarted, 1),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Integration request to ${url} timed out after ${timeout}ms.`);
    }

    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function headersFromRecord(headers?: Record<string, string>): Headers {
  const result = new Headers();

  if (!headers) {
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result.set(key, value);
    }
  }

  return result;
}

function headersToRecord(headers: Headers): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};

  for (const [key, value] of headers.entries()) {
    if (record[key]) {
      const existing = record[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        record[key] = [existing, value];
      }
    } else {
      record[key] = value;
    }
  }

  return record;
}

function encodeRequestBody(
  body: unknown,
  headers: Headers,
  method: HttpMethod
): { bodyInit?: BodyInit | null; bodyText?: string } {
  if (METHODS_WITHOUT_BODY.has(method)) {
    return { bodyInit: undefined, bodyText: "" };
  }

  if (body == null) {
    return { bodyInit: undefined, bodyText: "" };
  }

  if (typeof body === "string") {
    if (!headers.has("content-type")) {
      headers.set("Content-Type", "text/plain; charset=utf-8");
    }
    return { bodyInit: body, bodyText: body };
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    const array = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return { bodyInit: array as unknown as BodyInit, bodyText: body.toString("utf8") };
  }

  if (body instanceof ArrayBuffer) {
    const text = Buffer.from(body).toString("utf8");
    return { bodyInit: body, bodyText: text };
  }

  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    const array = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const text = Buffer.from(array).toString("utf8");
    return { bodyInit: array as unknown as BodyInit, bodyText: text };
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    if (!headers.has("content-type")) {
      headers.set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    return { bodyInit: body, bodyText: body.toString() };
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    // Fetch will manage the multipart boundary header automatically.
    return { bodyInit: body, bodyText: undefined };
  }

  if (isRecord(body) || Array.isArray(body)) {
    const serialized = JSON.stringify(body);
    if (!headers.has("content-type")) {
      headers.set("Content-Type", "application/json");
    }
    return { bodyInit: serialized, bodyText: serialized };
  }

  const fallback = String(body);
  if (!headers.has("content-type")) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  }

  return { bodyInit: fallback, bodyText: fallback };
}

function appendQueryParam(url: string, key: string, value: string): string {
  const parsed = toUrl(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function toUrl(value: string): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`Invalid integration URL: ${value}`);
  }
}

function parseResponseBody(response: Response): Promise<unknown> {
  const status = response.status;
  if (status === 204 || status === 205) {
    return Promise.resolve(undefined);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return Promise.resolve(undefined);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return response.text().then((text) => {
      if (!text) {
        return undefined;
      }
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    });
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("application/xml") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    return response.text();
  }

  return response.arrayBuffer().then((buffer) => {
    if (!buffer.byteLength) {
      return undefined;
    }
    return Buffer.from(buffer).toString("base64");
  });
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildIdempotencyKey(integration: Integration): string | undefined {
  const prefix = getString(integration.idempotencyKeyPrefix);
  if (!prefix) {
    return undefined;
  }

  return `${prefix}-${randomUUID()}`;
}

function resolveBasicCredentials(
  authConfig: AuthConfig,
  secret: string | undefined,
  integration: Integration
): string {
  const metadata = isRecord(authConfig.metadata) ? authConfig.metadata : {};
  let username = getString(metadata.username);
  let password = getString(metadata.password);

  if (secret) {
    const parsed = tryParseJson<Record<string, unknown>>(secret);
    if (isRecord(parsed)) {
      username = username ?? getString(parsed.username) ?? getString(parsed.user);
      username = username ?? getString(parsed.clientId) ?? getString(parsed.client_id);
      password = password ?? getString(parsed.password) ?? getString(parsed.pass);
      password = password ?? getString(parsed.clientSecret) ?? getString(parsed.client_secret);
    }

    if ((!username || !password) && secret.includes(":")) {
      const [user, ...rest] = secret.split(":");
      username = username ?? user;
      password = password ?? rest.join(":");
    }
  }

  if (!username || !password) {
    throw new Error(
      `Integration ${integration.id} is missing basic authentication credentials.`
    );
  }

  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function resolveOAuthToken(
  authConfig: AuthConfig,
  secret: string | undefined,
  integration: Integration
): Promise<string> {
  const metadata = isRecord(authConfig.metadata) ? authConfig.metadata : {};
  const tokenUrl = getString(metadata.tokenUrl);

  if (!tokenUrl) {
    throw new Error(`Integration ${integration.id} is missing OAuth tokenUrl metadata.`);
  }

  const grantType = getString(metadata.grantType) ?? "client_credentials";
  const audience = getString(metadata.audience);
  const scopeFromMetadata = getString(metadata.scope);
  const scopeFromConfig = Array.isArray(authConfig.scopes)
    ? authConfig.scopes.filter((scope) => typeof scope === "string" && scope.trim()).join(" ")
    : undefined;
  const scope = scopeFromMetadata ?? scopeFromConfig;

  let clientId = getString(metadata.clientId);
  let clientSecret = getString(metadata.clientSecret);

  if (secret) {
    const parsedSecret = tryParseJson<Record<string, unknown>>(secret);
    if (isRecord(parsedSecret)) {
      clientId = clientId ?? getString(parsedSecret.clientId) ?? getString(parsedSecret.client_id);
      clientSecret =
        clientSecret ??
        getString(parsedSecret.clientSecret) ??
        getString(parsedSecret.client_secret) ??
        getString(parsedSecret.secret);
    }

    if ((!clientId || !clientSecret) && secret.includes(":")) {
      const [id, ...rest] = secret.split(":");
      clientId = clientId ?? id;
      clientSecret = clientSecret ?? rest.join(":");
    }

    clientSecret = clientSecret ?? secret;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      `Integration ${integration.id} is missing OAuth client credentials.`
    );
  }

  const cacheKey = buildOAuthCacheKey(tokenUrl, clientId, clientSecret, scope, audience);
  const now = Date.now();
  const cached = oauthTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  const params = new URLSearchParams();
  params.set("grant_type", grantType);
  if (scope) {
    params.set("scope", scope);
  }
  if (audience) {
    params.set("audience", audience);
  }

  const additionalParams = isRecord(metadata.additionalParams)
    ? metadata.additionalParams
    : undefined;
  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      const paramValue = getString(value);
      if (paramValue) {
        params.set(key, paramValue);
      }
    }
  }

  const clientAuthMethod = getString(metadata.clientAuth)?.toLowerCase() === "body"
    ? "body"
    : "basic";

  const tokenHeaders: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (clientAuthMethod === "basic") {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }

  const tokenTimeoutMs = getNumber(metadata.tokenTimeoutMs) ?? 15_000;
  const controller = new AbortController();
  const timeoutHandle: NodeJS.Timeout | undefined =
    tokenTimeoutMs > 0 ? setTimeout(() => controller.abort(), tokenTimeoutMs) : undefined;

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: tokenHeaders,
      body: params,
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: Record<string, unknown> | undefined;

    if (raw) {
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      const errorMessage =
        (payload &&
          (getString(payload.error_description) ??
            getString(payload.error) ??
            getString(payload.message))) ||
        raw ||
        `${response.status} ${response.statusText}`;
      throw new Error(`OAuth token request failed: ${errorMessage}`);
    }

    if (!payload) {
      throw new Error("OAuth token response was empty or not JSON.");
    }

    const accessToken =
      getString(payload.access_token) ??
      getString(payload.token) ??
      getString(payload.id_token);
    if (!accessToken) {
      throw new Error("OAuth token response did not include an access_token.");
    }

    const expiresInSeconds =
      getNumber(payload.expires_in) ?? getNumber(payload.expiresIn) ?? 3600;
    const ttl = Math.max(0, expiresInSeconds * 1000);
    const expiresAt = now + ttl;
    const refreshAt = Math.max(now, expiresAt - 5000);

    oauthTokenCache.set(cacheKey, {
      token: accessToken,
      expiresAt: refreshAt,
    });

    return accessToken;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OAuth token request to ${tokenUrl} timed out.`);
    }

    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function buildOAuthCacheKey(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  scope?: string,
  audience?: string
): string {
  const hash = createHash("sha256");
  hash.update(tokenUrl);
  hash.update("\0");
  hash.update(clientId);
  hash.update("\0");
  hash.update(clientSecret);
  hash.update("\0");
  hash.update(scope ?? "");
  hash.update("\0");
  hash.update(audience ?? "");
  return hash.digest("hex");
}

function resolveSignedPayloadConfig(authConfig: AuthConfig, secret: string): SignedPayloadConfig {
  const metadata = isRecord(authConfig.metadata) ? authConfig.metadata : {};
  const algorithm = getString(metadata.algorithm)?.toLowerCase() ?? "sha256";
  const encodingRaw = getString(metadata.encoding)?.toLowerCase();
  const encoding: BinaryToTextEncoding = encodingRaw === "base64" ? "base64" : "hex";
  const headerName = getString(authConfig.keyName) ?? getString(metadata.headerName) ?? "X-Signature";
  const prefix = getString(metadata.prefix) ?? "";
  const timestampHeaderName = getString(metadata.timestampHeaderName);
  const timestampFormat = getString(metadata.timestampFormat)?.toLowerCase() === "unix" ? "unix" : "iso";
  const additionalHeaders = isRecord(metadata.additionalHeaders)
    ? Object.entries(metadata.additionalHeaders).reduce<Record<string, string>>((acc, [key, value]) => {
        const normalizedKey = getString(key) ?? key;
        const normalizedValue = getString(value) ?? String(value);
        if (normalizedKey && normalizedValue) {
          acc[normalizedKey] = normalizedValue;
        }
        return acc;
      }, {})
    : undefined;

  return {
    secret,
    algorithm,
    encoding,
    headerName,
    prefix,
    timestampHeaderName,
    timestampFormat,
    additionalHeaders,
  };
}

function applySignedPayloadSignature(
  headers: Headers,
  config: SignedPayloadConfig,
  bodyText: string
): void {
  const signer = createHmac(config.algorithm, config.secret);
  signer.update(bodyText ?? "");
  const signature = signer.digest(config.encoding);
  const value = `${config.prefix ?? ""}${signature}`;
  headers.set(config.headerName, value);

  if (config.timestampHeaderName) {
    const timestamp =
      config.timestampFormat === "unix"
        ? Math.floor(Date.now() / 1000).toString()
        : new Date().toISOString();
    headers.set(config.timestampHeaderName, timestamp);
  }

  if (config.additionalHeaders) {
    for (const [key, headerValue] of Object.entries(config.additionalHeaders)) {
      headers.set(key, headerValue);
    }
  }
}

function tryParseJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function createDispatchError(
  integration: Integration,
  attempt: number,
  error: unknown
): Error {
  const resolvedError = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  const wrapped = new Error(
    `Integration ${integration.id} dispatch attempt ${attempt} failed: ${resolvedError.message}`
  );
  (wrapped as { cause?: unknown }).cause = resolvedError;
  return wrapped;
}
