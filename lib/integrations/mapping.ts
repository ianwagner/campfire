import { performance } from "node:perf_hooks";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import Handlebars from "handlebars";
import jsonata from "jsonata";

import type {
  DocumentSnapshot,
  Firestore as AdminFirestore,
} from "firebase-admin/firestore";

import {
  CLIENTS_COLLECTION,
  REVIEW_ADS_SUBCOLLECTION,
  loadIntegrationSchema,
  reviewDocPath,
} from "./schema";
import type {
  HandlebarsMappingEngine,
  Integration,
  JsonataMappingEngine,
  LiteralMappingEngine,
  MappingEngine,
} from "./types";
import { getFirestore } from "../firebase/admin";

export interface FirestoreRecord extends Record<string, unknown> {
  id: string;
}

export interface ReviewData {
  review: FirestoreRecord;
  ads: FirestoreRecord[];
  client: FirestoreRecord | null;
}

export interface MappingContext {
  integration: Integration;
  reviewId: string;
  payload: Record<string, unknown>;
  dryRun: boolean;
  review: FirestoreRecord;
  ads: FirestoreRecord[];
  client: FirestoreRecord | null;
  generatedAt: string;
  data: Record<string, unknown>;
}

export interface MappingResult {
  payload: Record<string, unknown>;
  warnings: string[];
  preview: string;
  snapshot: unknown;
  durationMs: number;
  schema?: {
    ref: string;
  };
}

export interface MappingErrorPosition {
  line?: number;
  column?: number;
}

export class IntegrationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "IntegrationError";
    this.code = code;
    this.details = details;
  }
}

export class IntegrationDataError extends IntegrationError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = "IntegrationDataError";
  }
}

export class IntegrationMappingError extends IntegrationError {
  readonly position?: MappingErrorPosition;

  constructor(
    message: string,
    code: string,
    options?: { details?: Record<string, unknown>; position?: MappingErrorPosition }
  ) {
    super(message, code, options?.details);
    this.name = "IntegrationMappingError";
    this.position = options?.position;
  }
}

export class IntegrationSchemaError extends IntegrationError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = "IntegrationSchemaError";
  }
}

export class IntegrationSchemaValidationError extends IntegrationMappingError {
  constructor(
    message: string,
    code: string,
    options?: { details?: Record<string, unknown>; position?: MappingErrorPosition }
  ) {
    super(message, code, options);
    this.name = "IntegrationSchemaValidationError";
  }
}

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});

const schemaCache = new Map<string, Record<string, unknown>>();
const validatorCache = new Map<string, ValidateFunction>();
const DEFAULT_PREVIEW_LIMIT_BYTES = 4096;

function computeLineAndColumn(
  source: string,
  position?: number | MappingErrorPosition
): MappingErrorPosition | undefined {
  if (position == null) {
    return undefined;
  }

  if (typeof position === "object") {
    const line = typeof position.line === "number" ? position.line : undefined;
    const column =
      typeof position.column === "number" ? position.column : undefined;
    if (line != null || column != null) {
      return { line: line ?? undefined, column: column ?? undefined };
    }
  }

  if (typeof position === "number" && Number.isFinite(position)) {
    const snippet = source.slice(0, position);
    const lines = snippet.split(/\r?\n/);
    const line = lines.length;
    const column = lines[lines.length - 1]?.length ?? 0;
    return {
      line,
      column: column + 1,
    };
  }

  return undefined;
}

function resolvePath(root: unknown, path: string): unknown {
  if (!path) {
    return undefined;
  }

  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  const segments = normalized
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor == null) {
      return undefined;
    }

    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    if (typeof cursor !== "object") {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyLiteralTemplate(
  value: unknown,
  data: Record<string, unknown>,
  delimiters: { start: string; end: string },
  path = ""
): unknown {
  if (typeof value === "string") {
    const pattern = new RegExp(
      `${escapeForRegex(delimiters.start)}\\s*([^${escapeForRegex(
        delimiters.end
      )}]+?)\\s*${escapeForRegex(delimiters.end)}`,
      "g"
    );

    const matches = [...value.matchAll(pattern)];
    if (!matches.length) {
      return value;
    }

    if (
      matches.length === 1 &&
      value.trim() === `${delimiters.start}${matches[0][1].trim()}${delimiters.end}`
    ) {
      const token = matches[0][1].trim();
      const resolved = resolvePath(data, token);
      if (resolved === undefined) {
        throw new IntegrationMappingError(
          `Missing value for token "${token}"`,
          "mapping/literal_missing_token",
          { details: { path, token } }
        );
      }
      return resolved;
    }

    let output = value;
    for (const match of matches) {
      const token = match[1].trim();
      const resolved = resolvePath(data, token);
      if (resolved === undefined) {
        throw new IntegrationMappingError(
          `Missing value for token "${token}"`,
          "mapping/literal_missing_token",
          { details: { path, token } }
        );
      }
      output = output.replace(match[0], String(resolved));
    }

    return output;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      applyLiteralTemplate(item, data, delimiters, `${path}[${index}]`)
    );
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = applyLiteralTemplate(
        child,
        data,
        delimiters,
        path ? `${path}.${key}` : key
      );
    }
    return result;
  }

  return value;
}

function sanitizeFirestoreRecord(snapshot: DocumentSnapshot): FirestoreRecord {
  const data = snapshot.data() ?? {};
  return { id: snapshot.id, ...(data as Record<string, unknown>) };
}

function dedupe<T>(values: Iterable<T>): T[] {
  const result: T[] = [];
  const seen = new Set<T>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

async function resolveClientRecord(
  db: AdminFirestore,
  review: FirestoreRecord
): Promise<FirestoreRecord | null> {
  const candidatePaths: string[] = [];

  if (typeof review.clientRef === "string") {
    candidatePaths.push(review.clientRef);
  }
  if (typeof review.clientPath === "string") {
    candidatePaths.push(review.clientPath);
  }
  if (typeof review.clientDocument === "string") {
    candidatePaths.push(review.clientDocument);
  }
  if (typeof review.clientId === "string" && review.clientId) {
    candidatePaths.push(`${CLIENTS_COLLECTION}/${review.clientId}`);
  }

  const deduped = dedupe(candidatePaths);
  for (const candidate of deduped) {
    const normalized = candidate.startsWith("firestore://")
      ? candidate.replace(/^firestore:\/\//, "")
      : candidate;
    try {
      const snapshot = await db.doc(normalized).get();
      if (snapshot.exists) {
        return sanitizeFirestoreRecord(snapshot);
      }
    } catch (error) {
      // Skip invalid references and keep searching.
      continue;
    }
  }

  if (review.client && typeof review.client === "object") {
    const candidate = review.client as Record<string, unknown>;
    const identifier =
      typeof candidate.id === "string"
        ? candidate.id
        : typeof review.clientId === "string"
        ? review.clientId
        : "";
    return { id: identifier, ...candidate };
  }

  return null;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (key, raw) => {
      if (typeof raw === "bigint") {
        return raw.toString();
      }
      if (typeof raw === "object" && raw !== null) {
        if (seen.has(raw)) {
          return "[Circular]";
        }
        seen.add(raw);
      }
      return raw;
    },
    2
  ) ?? "";
}

export function truncate(value: unknown, maxBytes: number): unknown {
  if (maxBytes <= 0) {
    return { __truncated__: true, bytes: 0, preview: "" };
  }

  let serialized: string;
  try {
    serialized = safeStringify(value);
  } catch (error) {
    const fallback = `"[Unserializable: ${error instanceof Error ? error.message : String(
      error
    )}]"`;
    serialized = fallback;
  }

  if (!serialized) {
    return value;
  }

  const totalBytes = Buffer.byteLength(serialized, "utf8");
  if (totalBytes <= maxBytes) {
    try {
      return JSON.parse(serialized) as unknown;
    } catch (error) {
      return {
        __truncated__: true,
        bytes: totalBytes,
        preview: serialized.slice(0, Math.min(serialized.length, maxBytes)),
        error: `Failed to parse serialized snapshot: ${error instanceof Error ? error.message : String(
          error
        )}`,
      };
    }
  }

  const ellipsis = "…";
  const ellipsisBytes = Buffer.byteLength(ellipsis, "utf8");
  let available = Math.max(maxBytes - ellipsisBytes - 32, 0);
  let preview = "";

  for (const char of serialized) {
    const bytes = Buffer.byteLength(char, "utf8");
    if (bytes > available) {
      break;
    }
    preview += char;
    available -= bytes;
  }

  const snapshot = {
    __truncated__: true,
    bytes: totalBytes,
    preview: preview + ellipsis,
  };

  let snapshotJson = JSON.stringify(snapshot);
  while (
    Buffer.byteLength(snapshotJson, "utf8") > maxBytes &&
    snapshot.preview.length
  ) {
    snapshot.preview = snapshot.preview.slice(0, -1);
    snapshotJson = JSON.stringify(snapshot);
  }

  return snapshot;
}

export async function getReviewData(reviewId: string): Promise<ReviewData> {
  const db = getFirestore();
  const reviewRef = db.doc(reviewDocPath(reviewId));
  const reviewSnap = await reviewRef.get();

  if (!reviewSnap.exists) {
    throw new IntegrationDataError("Review not found.", "mapping/review_not_found", {
      reviewId,
    });
  }

  const review = sanitizeFirestoreRecord(reviewSnap);

  let ads: FirestoreRecord[] = [];
  try {
    const adsSnap = await reviewRef.collection(REVIEW_ADS_SUBCOLLECTION).get();
    ads = adsSnap.docs.map(sanitizeFirestoreRecord);
  } catch (error) {
    throw new IntegrationDataError(
      "Failed to load ads for review.",
      "mapping/review_ads_unavailable",
      {
        reviewId,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }

  const client = await resolveClientRecord(db, review);

  return { review, ads, client };
}

export async function createMappingContext(
  integration: Integration,
  reviewId: string,
  payload: Record<string, unknown>,
  dryRun: boolean
): Promise<MappingContext> {
  const reviewData = await getReviewData(reviewId);
  const generatedAt = new Date().toISOString();

  const data = {
    integration,
    review: reviewData.review,
    ads: reviewData.ads,
    client: reviewData.client,
    payload,
    reviewId,
    dryRun,
    generatedAt,
  } satisfies Record<string, unknown>;

  return {
    integration,
    reviewId,
    payload,
    dryRun,
    review: reviewData.review,
    ads: reviewData.ads,
    client: reviewData.client,
    generatedAt,
    data,
  };
}

async function renderJsonata(
  engine: JsonataMappingEngine,
  context: MappingContext
): Promise<Record<string, unknown>> {
  const expression = engine.expression.trim();
  if (!expression) {
    throw new IntegrationMappingError(
      "JSONata expression is empty.",
      "mapping/jsonata_empty_expression"
    );
  }

  try {
    const compiled = jsonata(expression);
    const result = await compiled.evaluate(context.data);

    if (result === undefined && !engine.allowUndefined) {
      throw new IntegrationMappingError(
        "JSONata expression resolved to undefined.",
        "mapping/jsonata_undefined"
      );
    }

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new IntegrationMappingError(
        "JSONata expression must return an object.",
        "mapping/jsonata_invalid_result",
        { details: { result } }
      );
    }

    return result as Record<string, unknown>;
  } catch (error) {
    const err = error as {
      message?: string;
      code?: string;
      position?: number | MappingErrorPosition;
    };

    const position = computeLineAndColumn(expression, err.position);
    throw new IntegrationMappingError(
      err.message ?? "JSONata evaluation failed.",
      "mapping/jsonata_error",
      {
        position,
        details: {
          code: err.code,
        },
      }
    );
  }
}

function registerHandlebarsArtifacts(
  engine: HandlebarsMappingEngine,
  context: MappingContext,
  runtime: typeof Handlebars
): void {
  runtime.registerHelper("json", (value) => JSON.stringify(value));

  if (engine.partials) {
    for (const [name, template] of Object.entries(engine.partials)) {
      runtime.registerPartial(name, template);
    }
  }

  if (engine.helpers) {
    for (const [name, lookup] of Object.entries(engine.helpers)) {
      runtime.registerHelper(name, (..._args) => {
        return resolvePath(context.data, lookup);
      });
    }
  }
}

function renderHandlebars(
  engine: HandlebarsMappingEngine,
  context: MappingContext
): Record<string, unknown> {
  const runtime = Handlebars.create();
  registerHandlebarsArtifacts(engine, context, runtime);

  let template: Handlebars.TemplateDelegate;
  try {
    template = runtime.compile(engine.template, { noEscape: true });
  } catch (error) {
    const err = error as { message?: string; lineNumber?: number; column?: number };
    throw new IntegrationMappingError(
      err.message ?? "Failed to compile Handlebars template.",
      "mapping/handlebars_compile_error",
      {
        position: computeLineAndColumn(engine.template, {
          line: err.lineNumber,
          column: err.column,
        }),
      }
    );
  }

  let output: string;
  try {
    output = template(context.data);
  } catch (error) {
    const err = error as { message?: string; lineNumber?: number; column?: number };
    throw new IntegrationMappingError(
      err.message ?? "Handlebars evaluation failed.",
      "mapping/handlebars_execution_error",
      {
        position: computeLineAndColumn(engine.template, {
          line: err.lineNumber,
          column: err.column,
        }),
      }
    );
  }

  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Template did not produce a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new IntegrationMappingError(
      "Handlebars template did not produce valid JSON.",
      "mapping/handlebars_invalid_json",
      {
        details: {
          output,
          cause: error instanceof Error ? error.message : String(error),
        },
      }
    );
  }
}

function renderLiteral(
  engine: LiteralMappingEngine,
  context: MappingContext
): Record<string, unknown> {
  const template = engine.template ?? {};
  const delimiters = {
    start: engine.delimiters?.start ?? "{{",
    end: engine.delimiters?.end ?? "}}",
  };

  const rendered = applyLiteralTemplate(
    template,
    context.data,
    delimiters
  );

  if (!rendered || typeof rendered !== "object" || Array.isArray(rendered)) {
    throw new IntegrationMappingError(
      "Literal template must resolve to an object.",
      "mapping/literal_invalid_result",
      {
        details: { rendered },
      }
    );
  }

  return rendered as Record<string, unknown>;
}

export async function renderPayload(
  integration: Integration,
  context: MappingContext
): Promise<Record<string, unknown>> {
  const engine = integration.mapping;

  switch (engine.type) {
    case "jsonata":
      return renderJsonata(engine, context);
    case "handlebars":
      return renderHandlebars(engine, context);
    case "literal":
      return renderLiteral(engine, context);
    default:
      const exhaustiveCheck: never = engine;
      throw new IntegrationMappingError(
        "Unsupported mapping engine.",
        "mapping/unsupported_engine",
        { details: { engine: exhaustiveCheck } }
      );
  }
}

async function validatePayloadAgainstSchema(
  integration: Integration,
  payload: Record<string, unknown>
): Promise<void> {
  const schemaRef = integration.schemaRef?.trim();
  if (!schemaRef) {
    return;
  }

  let schema = schemaCache.get(schemaRef);
  if (!schema) {
    try {
      const resolved = await loadIntegrationSchema(schemaRef);
      if (!resolved) {
        throw new IntegrationSchemaError(
          "Schema reference resolved to null.",
          "mapping/schema_not_found",
          { schemaRef }
        );
      }
      schema = resolved;
      schemaCache.set(schemaRef, schema);
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      throw new IntegrationSchemaError(
        error instanceof Error
          ? error.message
          : "Failed to load integration schema.",
        "mapping/schema_resolution_error",
        { schemaRef }
      );
    }
  }

  let validator = validatorCache.get(schemaRef);
  if (!validator) {
    try {
      validator = ajv.compile(schema);
      validatorCache.set(schemaRef, validator);
    } catch (error) {
      throw new IntegrationSchemaError(
        error instanceof Error
          ? error.message
          : "Failed to compile integration schema.",
        "mapping/schema_compile_error",
        { schemaRef }
      );
    }
  }

  const valid = validator(payload);
  if (!valid) {
    const errors = (validator.errors ?? []) as ErrorObject[];
    throw new IntegrationSchemaValidationError(
      "Payload failed schema validation.",
      "mapping/schema_validation_error",
      {
        details: {
          schemaRef,
          errors: errors.map((error) => ({
            instancePath: error.instancePath,
            message: error.message,
            keyword: error.keyword,
            params: error.params,
          })),
        },
      }
    );
  }
}

export async function executeMapping(
  engine: MappingEngine,
  context: MappingContext
): Promise<MappingResult> {
  const started = performance.now();
  const payload = await renderPayload(context.integration, context);
  await validatePayloadAgainstSchema(context.integration, payload);
  const durationMs = performance.now() - started;

  const snapshot = truncate(payload, DEFAULT_PREVIEW_LIMIT_BYTES);
  const preview =
    typeof snapshot === "string"
      ? snapshot
      : JSON.stringify(snapshot, null, 2);

  const warnings: string[] = [];

  return {
    payload,
    warnings,
    preview,
    snapshot,
    durationMs,
    schema: context.integration.schemaRef
      ? { ref: context.integration.schemaRef }
      : undefined,
  };
}
