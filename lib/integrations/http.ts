import type { HttpMethod, Integration } from "./types";

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

/**
 * Placeholder for the HTTP client responsible for delivering export payloads
 * to partner integrations. The eventual implementation will need to handle
 * authentication, retries, logging, and Cloud Tasks idempotency.
 */
export async function dispatchIntegrationRequest(
  request: IntegrationHttpRequest,
  { integration, dryRun }: DispatchOptions
): Promise<IntegrationHttpResponse> {
  const started = Date.now();
  return {
    status: dryRun ? 202 : 501,
    headers: {
      "x-integration-id": integration.id,
      "x-dispatch-mode": dryRun ? "dry-run" : "live",
    },
    body: {
      message: dryRun
        ? "Integration dispatch executed in dry-run mode."
        : "Integration dispatch stub has not been implemented yet.",
      request,
    },
    durationMs: Math.max(Date.now() - started, 1),
  };
}
