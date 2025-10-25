import { performance } from "node:perf_hooks";
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import Handlebars from "handlebars";
import jsonata from "jsonata";

import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore as AdminFirestore,
} from "firebase-admin/firestore";

import {
  CLIENTS_COLLECTION,
  RECIPE_TYPES_COLLECTION,
  REVIEW_ADS_SUBCOLLECTION,
  REVIEWS_COLLECTION,
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

const AD_GROUPS_COLLECTION = "adGroups";
const AD_GROUP_ASSETS_SUBCOLLECTION = "assets";

export interface ReviewData {
  review: FirestoreRecord;
  ads: FirestoreRecord[];
  client: FirestoreRecord | null;
}

export interface IntegrationAdExport extends Record<string, unknown> {
  reviewId: string;
  reviewName?: string;
  reviewUrl?: string;
  generatedAt: string;
  integrationId?: string;
  integrationName?: string;
  integrationSlug?: string;
  dryRun?: boolean;
  adGroupId?: string;
  adGroupName?: string;
  adId: string;
  adName?: string;
  adExternalId?: string;
  adVersion?: string;
  brandId?: string;
  brandName?: string;
  brandCode?: string;
  brandStoreId?: string;
  storeId?: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  requestId?: string;
  requestName?: string;
  campaignId?: string;
  campaignName?: string;
  recipeTypeId?: string;
  recipeTypeName?: string;
  recipeNumber?: string;
  productName?: string;
  moment?: string;
  funnel?: string;
  persona?: string;
  audience?: string;
  angle?: string;
  primaryCopy?: string;
  headline?: string;
  description?: string;
  destinationUrl?: string;
  goLiveDate?: string;
  status?: string;
  asset1x1Url?: string | null;
  asset9x16Url?: string | null;
  assets: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  recipeFields?: Record<string, unknown>;
}

export interface IntegrationExportSummary extends Record<string, unknown> {
  reviewId: string;
  reviewName?: string;
  reviewUrl?: string;
  brandId?: string;
  brandName?: string;
  brandCode?: string;
  brandStoreId?: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  requestId?: string;
  requestName?: string;
  campaignId?: string;
  campaignName?: string;
  recipeTypeId?: string;
  recipeTypeName?: string;
}

export interface IntegrationDefaultExport extends IntegrationExportSummary {
  integrationId: string;
  integrationName?: string;
  integrationSlug?: string;
  generatedAt: string;
  dryRun?: boolean;
  ads: IntegrationAdExport[];
}

export interface MappingContext {
  integration: Integration;
  reviewId: string;
  payload: Record<string, unknown>;
  dryRun: boolean;
  review: FirestoreRecord;
  ads: FirestoreRecord[];
  client: FirestoreRecord | null;
  recipeType: FirestoreRecord | null;
  recipeFieldKeys: string[];
  standardAds: IntegrationAdExport[];
  summary: IntegrationExportSummary;
  defaultExport: IntegrationDefaultExport;
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
      return resolved === undefined ? value : resolved;
    }

    let output = value;
    let replaced = false;
    for (const match of matches) {
      const token = match[1].trim();
      const resolved = resolvePath(data, token);
      if (resolved === undefined) {
        continue;
      }
      output = output.replace(match[0], String(resolved));
      replaced = true;
    }

    return replaced ? output : value;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateKeyCandidates(key: string): string[] {
  const trimmed = key.trim();
  if (!trimmed) {
    return [];
  }

  const normalizedWhitespace = trimmed.replace(/\s+/g, " ");
  const tokenSource = normalizedWhitespace
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const lowerTokens = tokenSource.map((token) => token.toLowerCase());
  const snake = lowerTokens.join("_");
  const dashed = lowerTokens.join("-");
  const combined = lowerTokens.join("");
  const camel = lowerTokens
    .map((token, index) =>
      index === 0 ? token : token.charAt(0).toUpperCase() + token.slice(1)
    )
    .join("");
  const pascal = camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;

  const candidates = new Set<string>([
    trimmed,
    normalizedWhitespace,
    normalizedWhitespace.toLowerCase(),
    snake,
    dashed,
    combined,
    camel,
    pascal,
  ]);

  return Array.from(candidates).filter(Boolean);
}

function collectCandidateContainers(ad: FirestoreRecord): Record<string, unknown>[] {
  const candidates = [
    ad,
    ad.fields,
    ad.metadata,
    ad.components,
    ad.data,
    ad.details,
    ad.payload,
    ad.recipe,
    isRecord(ad.recipe) ? ad.recipe.fields : undefined,
    isRecord(ad.recipe) ? ad.recipe.metadata : undefined,
    ad.writeInValues,
    ad.values,
  ];

  const seen = new Set<Record<string, unknown>>();
  const containers: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    if (isRecord(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      containers.push(candidate);
    }
  }
  return containers;
}

function findRecipeFieldValue(ad: FirestoreRecord, key: string): unknown {
  const candidates = generateKeyCandidates(key);
  if (!candidates.length) {
    return undefined;
  }

  const containers = collectCandidateContainers(ad);
  for (const candidate of candidates) {
    for (const container of containers) {
      const resolved = resolvePath(container, candidate);
      if (resolved !== undefined) {
        return resolved;
      }

      if (!candidate.includes(".")) {
        const loweredCandidate = candidate.toLowerCase();
        for (const [rawKey, value] of Object.entries(container)) {
          if (typeof rawKey !== "string") continue;
          const normalizedKeys = generateKeyCandidates(rawKey).map((entry) =>
            entry.toLowerCase()
          );
          if (normalizedKeys.includes(loweredCandidate)) {
            return value;
          }
        }
      }
    }
  }

  return undefined;
}

function normalizeStandardFieldKey(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const aspectCandidate = trimmed
    .replace(/[×:]/gi, "x")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (/^\d+x\d+$/.test(aspectCandidate)) {
    return aspectCandidate;
  }

  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type StandardFieldContext = {
  ad: FirestoreRecord;
  review: FirestoreRecord;
  client: FirestoreRecord | null;
  recipeType: FirestoreRecord | null;
};

const STANDARD_FIELD_ALIASES = {
  storeId: [
    "Store ID",
    "storeId",
    "StoreID",
    "store.id",
    "store",
    "store_id",
    "brandStoreId",
    "brand.storeId",
    "brand.store.id",
    "brand.store",
    "brand_store_id",
    "client.storeId",
    "client.store.id",
    "client.store",
  ],
  recipeNumber: [
    "Recipe Number",
    "Recipe No",
    "Recipe #",
    "recipeNumber",
    "recipeNo",
    "recipe.id",
    "recipe.number",
    "recipe.code",
  ],
  adGroup: ["Ad Group", "groupName", "Group Name", "adGroup"],
  product: [
    "Product",
    "product",
    "product.name",
    "productName",
    "product_title",
  ],
  moment: ["Moment", "moment"],
  funnel: ["Funnel", "funnel", "funnelStage", "funnel.stage"],
  goLive: [
    "Go Live",
    "goLive",
    "Launch Date",
    "launchDate",
    "goLiveDate",
    "liveDate",
    "launch_date",
  ],
  url: [
    "URL",
    "Url",
    "url",
    "product.url",
    "destinationUrl",
    "link",
    "href",
  ],
  angle: ["Angle", "angle", "hook"],
  audience: [
    "Audience",
    "audience",
    "audienceName",
    "targetAudience",
    "audiences",
    "targetAudienceName",
  ],
  status: ["Status", "status", "state"],
  primary: [
    "Primary",
    "primary",
    "primaryText",
    "Primary Copy",
    "primaryCopy",
    "copy.primary",
    "copy.primaryText",
  ],
  headline: ["Headline", "headline", "copy.headline"],
  description: [
    "Description",
    "description",
    "body",
    "bodyCopy",
    "copy.description",
  ],
  persona: [
    "Persona",
    "persona",
    "Personas",
    "personas",
    "buyerPersona",
    "buyer.persona",
    "targetPersona",
    "audiencePersona",
    "customerPersona",
  ],
  assetSquare: ["1x1", "Square", "1:1", "squareAsset"],
  assetVertical: ["9x16", "Vertical", "Story", "9:16", "verticalAsset"],
} as const;

type StandardFieldKey = keyof typeof STANDARD_FIELD_ALIASES;

function extractFromSources(
  keys: readonly string[],
  sources: ReadonlyArray<unknown>
): unknown {
  for (const key of keys) {
    for (const source of sources) {
      if (!isRecord(source)) continue;
      const value = findRecipeFieldValue(source as FirestoreRecord, key);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

function normalizeAssetLabel(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "square") {
    return "1x1";
  }
  if (["vertical", "portrait", "story", "stories", "reel", "reels"].includes(lowered)) {
    return "9x16";
  }

  const normalized = lowered.replace(/[×:]/g, "x").replace(/\s+/g, "");
  if (/^\d+x\d+$/.test(normalized)) {
    return normalized;
  }

  return lowered.replace(/[^a-z0-9]+/g, "");
}

function extractUrlFromAssetRecord(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.url,
    record.href,
    record.link,
    record.downloadUrl,
    record.assetUrl,
    record.path,
    record.source,
    record.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
    if (isRecord(candidate)) {
      const nested = extractUrlFromAssetRecord(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function resolveAssetUrl(
  context: StandardFieldContext,
  labels: readonly string[]
): unknown {
  const targets = labels
    .map((label) => normalizeAssetLabel(label))
    .filter(Boolean);

  if (!targets.length) {
    return undefined;
  }

  const inspect = (source: unknown): string | undefined => {
    if (!source) {
      return undefined;
    }

    if (typeof source === "string") {
      const normalized = normalizeAssetLabel(source);
      return targets.includes(normalized) ? source : undefined;
    }

    if (Array.isArray(source)) {
      for (const entry of source) {
        if (!isRecord(entry)) continue;
        const labelCandidates = [
          entry.label,
          entry.name,
          entry.key,
          entry.type,
          entry.aspect,
          entry.aspectRatio,
        ];
        for (const candidate of labelCandidates) {
          const normalized = normalizeAssetLabel(candidate);
          if (normalized && targets.includes(normalized)) {
            const resolved = extractUrlFromAssetRecord(entry);
            if (resolved) {
              return resolved;
            }
          }
        }
      }
      return undefined;
    }

    if (isRecord(source)) {
      for (const [key, value] of Object.entries(source)) {
        const normalizedKey = normalizeAssetLabel(key);
        if (normalizedKey && targets.includes(normalizedKey)) {
          if (typeof value === "string" && value.trim()) {
            return value;
          }
          if (isRecord(value)) {
            const resolved = extractUrlFromAssetRecord(value);
            if (resolved) {
              return resolved;
            }
          }
        }
      }
    }

    return undefined;
  };

  const adRecord = context.ad as Record<string, unknown>;
  const adFields = isRecord(adRecord.fields)
    ? (adRecord.fields as Record<string, unknown>)
    : undefined;
  const adMetadata = isRecord(adRecord.metadata)
    ? (adRecord.metadata as Record<string, unknown>)
    : undefined;
  const adComponents = isRecord(adRecord.components)
    ? (adRecord.components as Record<string, unknown>)
    : undefined;
  const adRecipe = isRecord(adRecord.recipe)
    ? (adRecord.recipe as Record<string, unknown>)
    : undefined;
  const reviewRecord = context.review as Record<string, unknown>;
  const recipeTypeRecord = context.recipeType
    ? (context.recipeType as Record<string, unknown>)
    : undefined;
  const clientRecord = context.client
    ? (context.client as Record<string, unknown>)
    : undefined;

  const sources: unknown[] = [
    adRecord.assets,
    adRecord.media,
    adFields?.assets,
    adMetadata?.assets,
    adComponents?.assets,
    adRecipe?.assets,
    reviewRecord.assets,
    reviewRecord.media,
    recipeTypeRecord?.assets,
    clientRecord?.assets,
    clientRecord?.media,
  ];

  for (const source of sources) {
    const resolved = inspect(source);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}

type StandardFieldExtractor = (context: StandardFieldContext) => unknown;

const STANDARD_FIELD_EXTRACTORS: Record<StandardFieldKey, StandardFieldExtractor> = {
  storeId: (context) =>
    extractFromSources(
      [
        "storeId",
        "store.id",
        "store.code",
        "store",
        "store_id",
        "brandStoreId",
        "brand.storeId",
        "brand.store.id",
        "brand.store",
        "brand_store_id",
        "client.storeId",
        "client.store.id",
        "client.store",
      ],
      [context.ad, context.ad.recipe, context.review, context.client]
    ),
  recipeNumber: (context) =>
    extractFromSources(
      [
        "recipeNo",
        "recipeNumber",
        "recipeId",
        "recipeCode",
        "recipe.id",
        "recipe.number",
        "recipe.code",
      ],
      [context.ad, context.ad.recipe, context.review]
    ),
  adGroup: (context) =>
    extractFromSources(
      ["groupName", "adGroup", "adGroupName", "group.name", "group"],
      [context.ad, context.review]
    ),
  product: (context) =>
    extractFromSources(
      ["product", "product.name", "productName", "product_title"],
      [context.ad, context.ad.recipe, context.review]
    ),
  moment: (context) =>
    extractFromSources(["moment"], [context.ad, context.ad.recipe, context.review]),
  funnel: (context) =>
    extractFromSources(
      ["funnel", "funnelStage", "funnel.stage"],
      [context.ad, context.ad.recipe, context.review]
    ),
  goLive: (context) =>
    extractFromSources(
      [
        "goLive",
        "launchDate",
        "launch_date",
        "goLiveDate",
        "liveDate",
        "goLiveAt",
      ],
      [context.ad, context.ad.recipe, context.review]
    ),
  url: (context) =>
    extractFromSources(
      ["url", "destinationUrl", "product.url", "link", "href"],
      [context.ad, context.ad.recipe, context.review]
    ),
  angle: (context) =>
    extractFromSources(["angle", "hook"], [context.ad, context.ad.recipe, context.review]),
  audience: (context) =>
    extractFromSources(
      [
        "audience",
        "audienceName",
        "targetAudience",
        "audiences",
        "targetAudienceName",
        "audience.name",
      ],
      [context.ad, context.ad.recipe, context.review]
    ),
  status: (context) =>
    extractFromSources(["status", "state"], [context.ad, context.review]),
  primary: (context) =>
    extractFromSources(
      ["primary", "primaryText", "primaryCopy", "copy.primary", "copy.primaryText"],
      [context.ad, context.review]
    ),
  headline: (context) =>
    extractFromSources(["headline", "copy.headline"], [context.ad, context.review]),
  description: (context) =>
    extractFromSources(
      ["description", "body", "bodyCopy", "copy.description"],
      [context.ad, context.review]
    ),
  persona: (context) =>
    extractFromSources(
      [
        "persona",
        "personas",
        "buyerPersona",
        "targetPersona",
        "audiencePersona",
        "customerPersona",
      ],
      [context.ad, context.ad.recipe, context.review]
    ),
  assetSquare: (context) => resolveAssetUrl(context, ["1x1", "1:1", "square"]),
  assetVertical: (context) => resolveAssetUrl(context, ["9x16", "9:16", "vertical", "story"]),
};

const STANDARD_FIELD_LOOKUP: Map<string, StandardFieldExtractor> = (() => {
  const lookup = new Map<string, StandardFieldExtractor>();
  for (const [canonical, aliases] of Object.entries(STANDARD_FIELD_ALIASES)) {
    const extractor = STANDARD_FIELD_EXTRACTORS[canonical as StandardFieldKey];
    if (!extractor) {
      continue;
    }
    for (const alias of aliases) {
      const normalized = normalizeStandardFieldKey(alias);
      if (normalized) {
        lookup.set(normalized, extractor);
      }
    }
  }
  return lookup;
})();

function extractStandardFieldValue(
  key: StandardFieldKey,
  context: StandardFieldContext
): unknown {
  const extractor = STANDARD_FIELD_EXTRACTORS[key];
  return extractor ? extractor(context) : undefined;
}

function tryParseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.toDate === "function") {
      const parsed = record.toDate();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (
      typeof record.seconds === "number" &&
      typeof record.nanoseconds === "number"
    ) {
      const millis = record.seconds * 1000 + Math.floor(record.nanoseconds / 1_000_000);
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return undefined;
}

function formatRowValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatRowValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length ? parts.join(", ") : undefined;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["value", "text", "name", "label", "title"] as const;
    for (const key of preferredKeys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    const parsedDate = tryParseDate(record);
    if (parsedDate) {
      return parsedDate.toISOString();
    }

    if (typeof record.id === "string" && record.id.trim()) {
      return record.id.trim();
    }

    try {
      return JSON.stringify(record);
    } catch (error) {
      return undefined;
    }
  }

  return String(value);
}

function formatDateField(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = tryParseDate(value);
    if (parsed) {
      return parsed.toISOString();
    }
    const formatted = formatRowValue(value);
    if (formatted) {
      return formatted;
    }
  }
  return undefined;
}

function formatUrl(value: unknown): string | undefined {
  const formatted = formatRowValue(value);
  return formatted ? formatted.trim() : undefined;
}

function getFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const formatted = formatRowValue(value);
    if (formatted) {
      return formatted;
    }
  }
  return undefined;
}

function collectAssetMap(
  ad: FirestoreRecord,
  context: StandardFieldContext
): Record<string, string> {
  const result: Record<string, string> = {};

  const assign = (label: unknown, value: unknown) => {
    if (typeof label !== "string") {
      return;
    }
    const normalized = normalizeAssetLabel(label);
    if (!normalized || result[normalized]) {
      return;
    }
    const formatted = formatUrl(value);
    if (formatted) {
      result[normalized] = formatted;
    }
  };

  const inspect = (source: unknown) => {
    if (!source) {
      return;
    }

    if (Array.isArray(source)) {
      for (const entry of source) {
        if (typeof entry === "string") {
          if (!result.default) {
            const formatted = formatUrl(entry);
            if (formatted) {
              result.default = formatted;
            }
          }
          continue;
        }

        if (!isRecord(entry)) {
          continue;
        }

        const url = extractUrlFromAssetRecord(entry);
        const formatted = formatUrl(url);
        if (!formatted) {
          continue;
        }

        const labelCandidates = [
          entry.aspectRatio,
          entry.ratio,
          entry.aspect,
          entry.size,
          entry.dimension,
          entry.label,
          entry.name,
          entry.key,
          entry.type,
          entry.kind,
        ];
        let assigned = false;
        for (const candidate of labelCandidates) {
          if (typeof candidate !== "string") {
            continue;
          }
          const normalized = normalizeAssetLabel(candidate);
          if (normalized) {
            if (!result[normalized]) {
              result[normalized] = formatted;
            }
            assigned = true;
            break;
          }
        }

        if (!assigned) {
          const width = Number((entry as Record<string, unknown>).width);
          const height = Number((entry as Record<string, unknown>).height);
          if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
            const normalized = normalizeAssetLabel(
              `${Math.round(width)}x${Math.round(height)}`
            );
            if (normalized && !result[normalized]) {
              result[normalized] = formatted;
              assigned = true;
            }
          }
        }

        if (!assigned) {
          const fallback = normalizeAssetLabel(
            typeof entry.id === "string"
              ? entry.id
              : typeof entry.key === "string"
              ? entry.key
              : typeof entry.type === "string"
              ? entry.type
              : ""
          );
          if (fallback && !result[fallback]) {
            result[fallback] = formatted;
            assigned = true;
          }
        }

        if (!assigned && !result.default) {
          result.default = formatted;
        }
      }
      return;
    }

    if (isRecord(source)) {
      for (const [key, value] of Object.entries(source)) {
        assign(key, value);
      }
      return;
    }

    if (typeof source === "string" && !result.default) {
      const formatted = formatUrl(source);
      if (formatted) {
        result.default = formatted;
      }
    }
  };

  const recipeRecord = isRecord(ad.recipe)
    ? (ad.recipe as Record<string, unknown>)
    : undefined;
  const reviewRecord = context.review as Record<string, unknown>;
  const clientRecord = context.client
    ? (context.client as Record<string, unknown>)
    : undefined;

  const sources: unknown[] = [
    ad.assets,
    ad.media,
    ad.files,
    ad.images,
    recipeRecord?.assets,
    recipeRecord?.media,
    recipeRecord?.files,
    recipeRecord?.images,
    ad.recipeFields,
    reviewRecord.assets,
    reviewRecord.media,
    reviewRecord.files,
    reviewRecord.recipeFields,
    clientRecord?.assets,
    clientRecord?.media,
  ];

  const componentSources = [ad.components, recipeRecord?.components];
  for (const componentSource of componentSources) {
    if (Array.isArray(componentSource)) {
      for (const component of componentSource) {
        if (!isRecord(component)) continue;
        inspect(component.assets);
        inspect(component.media);
      }
    } else if (isRecord(componentSource)) {
      inspect(componentSource.assets);
      inspect(componentSource.media);
    }
  }

  for (const source of sources) {
    inspect(source);
  }

  return result;
}

interface SummarizeReviewContextInput {
  review: FirestoreRecord;
  client: FirestoreRecord | null;
  recipeType: FirestoreRecord | null;
  recipeTypeId?: string;
}

function summarizeReviewContext({
  review,
  client,
  recipeType,
  recipeTypeId,
}: SummarizeReviewContextInput): IntegrationExportSummary {
  const brandRecord = isRecord(review.brand)
    ? (review.brand as Record<string, unknown>)
    : undefined;
  const storeRecord = isRecord(review.store)
    ? (review.store as Record<string, unknown>)
    : undefined;
  const storeNested = storeRecord && isRecord(storeRecord.store)
    ? (storeRecord.store as Record<string, unknown>)
    : undefined;
  const projectRecord = isRecord(review.project)
    ? (review.project as Record<string, unknown>)
    : undefined;
  const requestRecord = isRecord(review.request)
    ? (review.request as Record<string, unknown>)
    : undefined;
  const campaignRecord = isRecord(review.campaign)
    ? (review.campaign as Record<string, unknown>)
    : undefined;
  const reviewLinks = isRecord(review.links)
    ? (review.links as Record<string, unknown>)
    : undefined;
  const clientRecord = client
    ? (client as Record<string, unknown>)
    : isRecord(review.client)
    ? (review.client as Record<string, unknown>)
    : undefined;
  const clientStoreRecord = clientRecord && isRecord(clientRecord.store)
    ? (clientRecord.store as Record<string, unknown>)
    : undefined;
  const brandStoreRecord = brandRecord && isRecord(brandRecord.store)
    ? (brandRecord.store as Record<string, unknown>)
    : undefined;
  const recipeTypeRecord = recipeType
    ? (recipeType as Record<string, unknown>)
    : undefined;

  const brandStoreId = getFirstString(
    review.storeId,
    review.store_id,
    storeRecord?.id,
    storeRecord?.code,
    storeRecord?.storeId,
    storeRecord?.store_id,
    storeNested?.id,
    storeNested?.code,
    review.brandStoreId,
    review.brand_store_id,
    brandRecord?.storeId,
    brandRecord?.store_id,
    brandStoreRecord?.id,
    brandStoreRecord?.code,
    clientRecord?.storeId,
    clientRecord?.store_id,
    clientStoreRecord?.id,
    clientStoreRecord?.code,
  );

  return {
    reviewId: review.id,
    reviewName: getFirstString(
      review.name,
      review.title,
      review.groupName,
      review.adGroupName,
      review.displayName,
      review.reviewName,
      review.ad_group_name,
    ),
    reviewUrl: getFirstString(
      review.shareUrl,
      review.previewUrl,
      review.reviewUrl,
      review.url,
      reviewLinks?.public,
      reviewLinks?.share,
      reviewLinks?.preview,
    ),
    brandId: getFirstString(
      brandRecord?.id,
      brandRecord?.uid,
      review.brandId,
      review.brand_id,
    ),
    brandName: getFirstString(
      brandRecord?.name,
      brandRecord?.displayName,
      brandRecord?.label,
      review.brandName,
      review.brand_display_name,
    ),
    brandCode: getFirstString(
      brandRecord?.code,
      brandRecord?.codeId,
      brandRecord?.slug,
      review.brandCode,
      review.brand_code,
      review.brand_code_id,
    ),
    brandStoreId,
    clientId: getFirstString(
      clientRecord?.id,
      clientRecord?.uid,
      clientRecord?.clientId,
      clientRecord?.client_id,
    ),
    clientName: getFirstString(
      clientRecord?.name,
      clientRecord?.displayName,
      clientRecord?.label,
    ),
    projectId: getFirstString(projectRecord?.id, review.projectId),
    projectName: getFirstString(projectRecord?.name, review.projectName),
    requestId: getFirstString(requestRecord?.id, review.requestId),
    requestName: getFirstString(requestRecord?.name, review.requestName),
    campaignId: getFirstString(campaignRecord?.id, review.campaignId),
    campaignName: getFirstString(campaignRecord?.name, review.campaignName),
    recipeTypeId:
      getFirstString(recipeTypeRecord?.id, recipeTypeRecord?.uid, recipeTypeId) ??
      recipeTypeId,
    recipeTypeName: getFirstString(
      recipeTypeRecord?.name,
      recipeTypeRecord?.displayName,
      recipeTypeRecord?.label,
    ),
  };
}

interface StandardExportBuildContext {
  review: FirestoreRecord;
  client: FirestoreRecord | null;
  recipeType: FirestoreRecord | null;
  summary: IntegrationExportSummary;
  generatedAt: string;
  integration: Integration;
  dryRun: boolean;
}

function buildStandardAdExports(
  ads: FirestoreRecord[],
  context: StandardExportBuildContext
): IntegrationAdExport[] {
  return ads.map((ad) => {
    const fieldContext: StandardFieldContext = {
      ad,
      review: context.review,
      client: context.client,
      recipeType: context.recipeType,
    };

    const storeId = formatRowValue(extractStandardFieldValue("storeId", fieldContext));
    const recipeNumber = formatRowValue(
      extractStandardFieldValue("recipeNumber", fieldContext)
    );
    const adGroupName = getFirstString(
      extractStandardFieldValue("adGroup", fieldContext),
      context.summary.reviewName,
    );
    const productName = formatRowValue(
      extractStandardFieldValue("product", fieldContext)
    );
    const moment = formatRowValue(extractStandardFieldValue("moment", fieldContext));
    const funnel = formatRowValue(extractStandardFieldValue("funnel", fieldContext));
    const persona = formatRowValue(extractStandardFieldValue("persona", fieldContext));
    const audience = formatRowValue(extractStandardFieldValue("audience", fieldContext));
    const angle = formatRowValue(extractStandardFieldValue("angle", fieldContext));
    const primaryCopy = formatRowValue(
      extractStandardFieldValue("primary", fieldContext)
    );
    const headline = formatRowValue(
      extractStandardFieldValue("headline", fieldContext)
    );
    const description = formatRowValue(
      extractStandardFieldValue("description", fieldContext)
    );
    const destinationUrl = formatUrl(extractStandardFieldValue("url", fieldContext));
    const goLiveDate = formatDateField(
      extractStandardFieldValue("goLive", fieldContext)
    );
    const status = formatRowValue(extractStandardFieldValue("status", fieldContext));

    const assetCandidates = collectAssetMap(ad, fieldContext);
    const assetMap: Record<string, string | null> = { "1x1": null, "9x16": null };
    for (const [label, url] of Object.entries(assetCandidates)) {
      if (!(label in assetMap)) {
        assetMap[label] = url;
      } else if (!assetMap[label]) {
        assetMap[label] = url;
      }
    }

    const squareCandidate = formatUrl(
      extractStandardFieldValue("assetSquare", fieldContext)
    );
    if (squareCandidate) {
      assetMap["1x1"] = squareCandidate;
    }

    const verticalCandidate = formatUrl(
      extractStandardFieldValue("assetVertical", fieldContext)
    );
    if (verticalCandidate) {
      assetMap["9x16"] = verticalCandidate;
    }

    const asset1x1Url = assetMap["1x1"] ?? null;
    const asset9x16Url = assetMap["9x16"] ?? null;

    const recipeFields = isRecord(ad.recipeFields)
      ? (ad.recipeFields as Record<string, unknown>)
      : undefined;

    const adName = getFirstString(ad.name, ad.title, ad.label);
    const adExternalId = getFirstString(
      ad.externalId,
      ad.external_id,
      ad.platformAdId,
      ad.platform_ad_id,
      ad.facebookAdId,
      ad.facebook_ad_id,
      ad.googleAdId,
      ad.google_ad_id,
      ad.tiktokAdId,
      ad.tiktok_ad_id,
    );
    const adMetadata = isRecord(ad.metadata)
      ? (ad.metadata as Record<string, unknown>)
      : undefined;
    const adVersion = getFirstString(
      ad.version,
      ad.revision,
      ad.iteration,
      ad.variant,
      adMetadata?.version,
    );

    const adTimestamps = isRecord(ad.timestamps)
      ? (ad.timestamps as Record<string, unknown>)
      : undefined;
    const adAudit = isRecord(ad.audit)
      ? (ad.audit as Record<string, unknown>)
      : undefined;
    const createdAt = formatDateField(
      ad.createdAt,
      ad.created_at,
      adTimestamps?.createdAt,
      adTimestamps?.created,
      adAudit?.createdAt,
      adAudit?.created_at,
    );
    const updatedAt = formatDateField(
      ad.updatedAt,
      ad.updated_at,
      adTimestamps?.updatedAt,
      adTimestamps?.updated,
      adAudit?.updatedAt,
      adAudit?.updated_at,
    );

    const storeValue = getFirstString(storeId, context.summary.brandStoreId);
    const brandStoreId = getFirstString(context.summary.brandStoreId, storeId);

    const assets = Object.entries(assetMap).reduce(
      (acc, [label, value]) => {
        acc[label] = value ?? null;
        return acc;
      },
      {} as Record<string, string | null>
    );

    return {
      reviewId: context.summary.reviewId,
      reviewName: context.summary.reviewName,
      reviewUrl: context.summary.reviewUrl,
      generatedAt: context.generatedAt,
      integrationId: context.integration.id,
      integrationName: context.integration.name,
      integrationSlug: context.integration.slug,
      dryRun: context.dryRun,
      adGroupId: context.summary.reviewId,
      adGroupName,
      adId: ad.id,
      adName,
      adExternalId,
      adVersion,
      brandId: context.summary.brandId,
      brandName: context.summary.brandName,
      brandCode: context.summary.brandCode,
      brandStoreId,
      storeId: storeValue,
      clientId: context.summary.clientId,
      clientName: context.summary.clientName,
      projectId: context.summary.projectId,
      projectName: context.summary.projectName,
      requestId: context.summary.requestId,
      requestName: context.summary.requestName,
      campaignId: context.summary.campaignId,
      campaignName: context.summary.campaignName,
      recipeTypeId: context.summary.recipeTypeId,
      recipeTypeName: context.summary.recipeTypeName,
      recipeNumber,
      productName,
      moment,
      funnel,
      persona,
      audience,
      angle,
      primaryCopy,
      headline,
      description,
      destinationUrl,
      goLiveDate,
      status,
      asset1x1Url,
      asset9x16Url,
      assets,
      createdAt,
      updatedAt,
      recipeFields,
    } satisfies IntegrationAdExport;
  });
}

function collectRecipeFieldValues(
  ad: FirestoreRecord,
  fieldKeys: string[],
  context: Omit<StandardFieldContext, "ad">
): Record<string, unknown> | null {
  if (!fieldKeys.length) {
    return null;
  }

  const values: Record<string, unknown> = {};
  for (const key of fieldKeys) {
    const normalized = normalizeStandardFieldKey(key);
    const extractor = normalized ? STANDARD_FIELD_LOOKUP.get(normalized) : undefined;
    if (extractor) {
      const extracted = extractor({ ad, ...context });
      if (extracted !== undefined) {
        values[key] = extracted;
        continue;
      }
    }

    let value = findRecipeFieldValue(ad, key);
    if (value === undefined) {
      value = findRecipeFieldValue(context.review, key);
    }
    if (value === undefined && context.client) {
      value = findRecipeFieldValue(context.client, key);
    }

    if (value !== undefined) {
      values[key] = value;
    }
  }

  return Object.keys(values).length ? values : null;
}

function extractRecipeFieldKeys(recipeType: FirestoreRecord | null): string[] {
  const result = new Set<string>();
  const addKey = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        result.add(trimmed);
      }
    }
  };

  for (const aliases of Object.values(STANDARD_FIELD_ALIASES)) {
    if (Array.isArray(aliases) && aliases.length) {
      addKey(aliases[0]);
    }
  }

  if (!recipeType) {
    return Array.from(result);
  }

  const writeInSources = [
    recipeType.writeInFields,
    (recipeType as Record<string, unknown>).write_in_fields,
    recipeType.fields,
  ];
  for (const source of writeInSources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      if (isRecord(entry)) {
        addKey(entry.key);
        addKey(entry.name);
      }
    }
  }

  const clientSources = [
    recipeType.clientFormComponents,
    (recipeType as Record<string, unknown>).client_form_components,
  ];
  for (const source of clientSources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      if (typeof entry === "string") {
        addKey(entry);
        continue;
      }
      if (!isRecord(entry)) continue;
      addKey(entry.key);
      addKey(entry.name);
      if (Array.isArray(entry.fields)) {
        for (const field of entry.fields) {
          if (typeof field === "string") {
            addKey(field);
          } else if (isRecord(field)) {
            addKey(field.key);
            addKey(field.name);
          }
        }
      }
    }
  }

  return Array.from(result);
}

function enrichAdsWithRecipeFields(
  ads: FirestoreRecord[],
  fieldKeys: string[],
  context: Omit<StandardFieldContext, "ad">
): FirestoreRecord[] {
  return ads.map((ad) => {
    const existing = isRecord(ad.recipeFields)
      ? { ...(ad.recipeFields as Record<string, unknown>) }
      : {};

    let mutated = false;

    if (fieldKeys.length) {
      const collected = collectRecipeFieldValues(ad, fieldKeys, context);
      if (collected) {
        for (const [key, value] of Object.entries(collected)) {
          if (!Object.is(existing[key], value)) {
            existing[key] = value;
            mutated = true;
          }
        }
      }
    }

    const assetContext: StandardFieldContext = {
      ad,
      review: context.review,
      client: context.client,
      recipeType: context.recipeType,
    };

    const isMissingValue = (value: unknown) => {
      if (value === undefined || value === null) {
        return true;
      }
      return typeof value === "string" && !value.trim();
    };

    const squareUrl = resolveAssetUrl(assetContext, ["1x1", "1:1", "square"]);
    if (squareUrl !== undefined && squareUrl !== null && isMissingValue(existing["1x1"])) {
      existing["1x1"] = squareUrl;
      mutated = true;
    }

    const verticalUrl = resolveAssetUrl(assetContext, [
      "9x16",
      "9:16",
      "vertical",
      "story",
    ]);
    if (
      verticalUrl !== undefined &&
      verticalUrl !== null &&
      isMissingValue(existing["9x16"])
    ) {
      existing["9x16"] = verticalUrl;
      mutated = true;
    }

    if (!mutated) {
      return ad;
    }

    return {
      ...ad,
      recipeFields: existing,
    };
  });
}

function normalizeRecipeTypeCandidate(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  if (trimmed.includes("/")) {
    const segments = trimmed.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : trimmed;
  }
  return trimmed;
}

function matchesRecipeType(
  ad: FirestoreRecord,
  recipeTypeId: string,
  recipeType: FirestoreRecord | null
): boolean {
  const target = normalizeRecipeTypeCandidate(recipeTypeId);
  if (!target) {
    return false;
  }

  const candidates = new Set<string>();
  const register = (value: unknown) => {
    if (typeof value === "string") {
      const normalized = normalizeRecipeTypeCandidate(value);
      if (normalized) {
        candidates.add(normalized);
      }
    }
  };

  register(ad.recipeTypeId);
  register((ad as Record<string, unknown>).recipeType);
  register((ad as Record<string, unknown>).recipe_type);
  register((ad as Record<string, unknown>).recipeTypeSlug);
  register((ad as Record<string, unknown>).recipeTypeKey);
  register((ad as Record<string, unknown>).recipeTypeName);
  register((ad as Record<string, unknown>).recipeTypeCode);
  register((ad as Record<string, unknown>).recipeTypeRef);
  register((ad as Record<string, unknown>).recipe_type_ref);
  register((ad as Record<string, unknown>).recipe_type_id);
  register((ad as Record<string, unknown>).recipe_type_slug);
  register((ad as Record<string, unknown>).recipe_type_key);
  register((ad as Record<string, unknown>).recipe_type_name);
  register((ad as Record<string, unknown>).recipe_type_code);

  if (isRecord(ad.recipeType)) {
    Object.values(ad.recipeType).forEach(register);
  }

  if (isRecord(recipeType)) {
    register(recipeType.id);
    register((recipeType as Record<string, unknown>).slug);
    register((recipeType as Record<string, unknown>).key);
    register((recipeType as Record<string, unknown>).code);
    register((recipeType as Record<string, unknown>).name);
    register((recipeType as Record<string, unknown>).shortName);
  }

  return candidates.has(target);
}

function filterAdsByRecipeType(
  ads: FirestoreRecord[],
  recipeTypeId: string,
  recipeType: FirestoreRecord | null
): FirestoreRecord[] {
  const filtered = ads.filter((ad) => matchesRecipeType(ad, recipeTypeId, recipeType));
  return filtered.length ? filtered : ads;
}

async function loadRecipeType(recipeTypeId: string): Promise<FirestoreRecord> {
  const db = getFirestore();
  try {
    const snapshot = await db
      .collection(RECIPE_TYPES_COLLECTION)
      .doc(recipeTypeId)
      .get();

    if (!snapshot.exists) {
      throw new IntegrationDataError(
        "Recipe type not found.",
        "mapping/recipe_type_not_found",
        { recipeTypeId }
      );
    }

    return sanitizeFirestoreRecord(snapshot);
  } catch (error) {
    if (error instanceof IntegrationError) {
      throw error;
    }
    throw new IntegrationDataError(
      error instanceof Error ? error.message : "Failed to load recipe type.",
      "mapping/recipe_type_load_failed",
      { recipeTypeId }
    );
  }
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

  const addCandidatePath = (candidate: unknown) => {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        candidatePaths.push(trimmed);
      }
      return;
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      typeof (candidate as Partial<DocumentReference>).path === "string"
    ) {
      const path = (candidate as DocumentReference).path.trim();
      if (path) {
        candidatePaths.push(path);
      }
    }
  };

  addCandidatePath(review.clientRef);
  addCandidatePath(review.clientPath);
  addCandidatePath(review.clientDocument);
  addCandidatePath(review.client);
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

  if (reviewSnap.exists) {
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
          source: REVIEWS_COLLECTION,
          cause: error instanceof Error ? error.message : String(error),
        }
      );
    }

    const client = await resolveClientRecord(db, review);
    return { review, ads, client };
  }

  const fallback = await loadReviewDataFromAdGroup(db, reviewId);
  if (fallback) {
    return fallback;
  }

  throw new IntegrationDataError("Review not found.", "mapping/review_not_found", {
    reviewId,
  });
}

async function loadReviewDataFromAdGroup(
  db: AdminFirestore,
  reviewId: string
): Promise<ReviewData | null> {
  const adGroupRef = db.collection(AD_GROUPS_COLLECTION).doc(reviewId);

  let adGroupSnap: DocumentSnapshot;
  try {
    adGroupSnap = await adGroupRef.get();
  } catch (error) {
    throw new IntegrationDataError(
      error instanceof Error ? error.message : "Failed to load review.",
      "mapping/review_load_failed",
      {
        reviewId,
        source: AD_GROUPS_COLLECTION,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }

  if (!adGroupSnap.exists) {
    return null;
  }

  const review = sanitizeFirestoreRecord(adGroupSnap);

  let ads: FirestoreRecord[] = [];
  try {
    const adsSnap = await adGroupRef
      .collection(AD_GROUP_ASSETS_SUBCOLLECTION)
      .get();
    ads = adsSnap.docs.map(sanitizeFirestoreRecord);
  } catch (error) {
    throw new IntegrationDataError(
      "Failed to load ads for review.",
      "mapping/review_ads_unavailable",
      {
        reviewId,
        source: AD_GROUPS_COLLECTION,
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

  const recipeTypeId =
    typeof integration.recipeTypeId === "string"
      ? integration.recipeTypeId.trim()
      : "";

  let recipeType: FirestoreRecord | null = null;
  let recipeFieldKeys: string[] = [];
  let ads = reviewData.ads;

  if (recipeTypeId) {
    recipeType = await loadRecipeType(recipeTypeId);
    ads = filterAdsByRecipeType(reviewData.ads, recipeTypeId, recipeType);
  }

  recipeFieldKeys = extractRecipeFieldKeys(recipeType);

  const enrichedAds = recipeFieldKeys.length
    ? enrichAdsWithRecipeFields(ads, recipeFieldKeys, {
        review: reviewData.review,
        client: reviewData.client,
        recipeType,
      })
    : ads;

  const summary = summarizeReviewContext({
    review: reviewData.review,
    client: reviewData.client,
    recipeType,
    recipeTypeId,
  });

  const standardAds = buildStandardAdExports(enrichedAds, {
    review: reviewData.review,
    client: reviewData.client,
    recipeType,
    summary,
    generatedAt,
    integration,
    dryRun,
  });

  const defaultExport: IntegrationDefaultExport = {
    ...summary,
    integrationId: integration.id,
    integrationName: integration.name,
    integrationSlug: integration.slug,
    generatedAt,
    dryRun,
    ads: standardAds,
  };

  const normalizedRecipeTypeId =
    summary.recipeTypeId ?? recipeType?.id ?? (recipeTypeId || undefined);

  const data = {
    integration,
    review: reviewData.review,
    ads: enrichedAds,
    client: reviewData.client,
    recipeType,
    recipeTypeId: normalizedRecipeTypeId,
    recipeFieldKeys,
    payload,
    reviewId,
    dryRun,
    generatedAt,
    summary,
    standardAds,
    exportRows: standardAds,
    rows: standardAds,
    defaultExport,
    standardExport: defaultExport,
  } satisfies Record<string, unknown>;

  return {
    integration,
    reviewId,
    payload,
    dryRun,
    review: reviewData.review,
    ads: enrichedAds,
    client: reviewData.client,
    recipeType,
    recipeFieldKeys,
    standardAds,
    summary,
    defaultExport,
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
