import type { Integration } from "./types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
}

export interface DispatchOptions {
  integration: Integration;
  dryRun: boolean;
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
  };
}
