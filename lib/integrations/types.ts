export type IntegrationId = string;

export type ExportStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed";

export interface RetryPolicy {
  /** Maximum number of delivery attempts before the export is marked as failed. */
  maxAttempts: number;
  /** Delay applied before the first retry attempt, in milliseconds. */
  initialIntervalMs: number;
  /** Maximum allowable backoff between retry attempts, in milliseconds. */
  maxIntervalMs: number;
  /** Multiplier applied to the previous interval to determine the next delay. */
  backoffMultiplier: number;
  /** Whether to randomise retry delays to avoid thundering herds. */
  jitter?: boolean;
}

export type AuthStrategy =
  | "none"
  | "api_key"
  | "basic"
  | "oauth2"
  | "signed_payload";

export interface SecretReference {
  /** Fully-qualified Secret Manager resource name. */
  name: string;
  /** Explicit version to load. Defaults to `latest` when omitted. */
  version?: string;
}

export interface AuthConfig {
  strategy: AuthStrategy;
  /** Reference to credentials stored in Secret Manager. */
  secret?: SecretReference;
  /** Optional scopes for OAuth based integrations. */
  scopes?: string[];
  /** Arbitrary metadata passed to strategy-specific handlers. */
  metadata?: Record<string, unknown>;
}

export type MappingEngineType = "liquid" | "handlebars" | "jmespath" | "javascript";

export interface MappingEngine {
  type: MappingEngineType;
  /** Version of the mapping template or engine to evaluate. */
  version: string;
  /** Location of the mapping template (GCS URI, HTTPS URL, etc.). */
  sourceUri?: string;
  /** Additional options made available to the mapping executor. */
  options?: Record<string, unknown>;
}

export interface ExportAttempt {
  attempt: number;
  status: ExportStatus;
  startedAt: string;
  completedAt?: string;
  /** Optional error description when the attempt failed. */
  errorMessage?: string;
  /** Raw payload that was attempted during export. */
  payloadSnapshot?: Record<string, unknown>;
}

export interface Integration {
  id: IntegrationId;
  version: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  /** Endpoint that receives the exported payload. */
  endpoint: string;
  /** Optional idempotency key prefix to reduce duplication. */
  idempotencyKeyPrefix?: string;
  /** Strategy-specific authentication details. */
  auth: AuthConfig;
  /** Export payload mapping metadata. */
  mapping: MappingEngine;
  /** Delivery retry configuration for transient failures. */
  retryPolicy: RetryPolicy;
  /** Additional headers appended to outbound HTTP requests. */
  headers?: Record<string, string>;
  /** Path within Firestore to track the latest export attempt. */
  latestExportAttempt?: ExportAttempt;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationVersion extends Integration {
  publishedAt: string;
  publishedBy: string;
}
