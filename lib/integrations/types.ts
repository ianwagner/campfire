export type IntegrationId = string;

export type ExportStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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

export type AuthLocation = "header" | "query" | "body";

export interface SecretReference {
  /** Fully-qualified Secret Manager resource name. */
  name: string;
  /** Explicit version to load. Defaults to `latest` when omitted. */
  version?: string;
}

export interface AuthConfig {
  strategy: AuthStrategy;
  /** Location where credentials should be injected when dispatching HTTP requests. */
  location?: AuthLocation;
  /** Key under which credentials should be stored (header, query param, etc.). */
  keyName?: string;
  /** Reference to credentials stored in Secret Manager. */
  secret?: SecretReference;
  /** Optional scopes for OAuth based integrations. */
  scopes?: string[];
  /** Arbitrary metadata passed to strategy-specific handlers. */
  metadata?: Record<string, unknown>;
}

export type MappingEngineType = "jsonata" | "handlebars" | "literal";

interface BaseMappingEngine {
  type: MappingEngineType;
  /** Version of the mapping template or engine to evaluate. */
  version: string;
  /** Location of the mapping template (GCS URI, HTTPS URL, etc.). */
  sourceUri?: string;
}

export interface JsonataMappingEngine extends BaseMappingEngine {
  type: "jsonata";
  /** JSONata expression evaluated against the mapping context. */
  expression: string;
  /** When true, undefined results are allowed without throwing. */
  allowUndefined?: boolean;
}

export interface HandlebarsMappingEngine extends BaseMappingEngine {
  type: "handlebars";
  /** Handlebars template expected to render a valid JSON document. */
  template: string;
  /** Inline partials keyed by name. */
  partials?: Record<string, string>;
  /** Inline helpers implemented as lookup paths within the mapping context. */
  helpers?: Record<string, string>;
}

export interface LiteralMappingEngine extends BaseMappingEngine {
  type: "literal";
  /**
   * Literal JSON-like structure containing token placeholders that will be
   * replaced using the mapping context.
   */
  template: unknown;
  /** Optional custom token delimiters. Defaults to "{{" and "}}". */
  delimiters?: {
    start: string;
    end: string;
  };
}

export type MappingEngine =
  | JsonataMappingEngine
  | HandlebarsMappingEngine
  | LiteralMappingEngine;

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
  /** Base URL for integration HTTP requests. */
  baseUrl: string;
  /** Relative path appended to the base URL when dispatching requests. */
  endpointPath: string;
  /** HTTP method used when dispatching requests. */
  method: HttpMethod;
  /** Maximum time to wait for a response before timing out, in milliseconds. */
  timeoutMs?: number;
  /** Optional idempotency key prefix to reduce duplication. */
  idempotencyKeyPrefix?: string;
  /** Strategy-specific authentication details. */
  auth: AuthConfig;
  /** Export payload mapping metadata. */
  mapping: MappingEngine;
  /** Optional JSON Schema reference used to validate rendered payloads. */
  schemaRef?: string | null;
  /** Recipe type that provides the source fields for this integration. */
  recipeTypeId?: string | null;
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
