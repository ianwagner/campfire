export class TransformSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransformSpecError";
  }
}

export type TransformRow = Record<string, unknown>;

export interface TransformInput {
  brand?: Record<string, unknown> | null;
  adGroup?: Record<string, unknown> | null;
  recipes?: Array<Record<string, unknown>> | null;
  ads?: Array<Record<string, unknown>> | null;
}

const DEFAULT_ROW_SOURCE = "recipes" as const;
type RowSource = typeof DEFAULT_ROW_SOURCE;

type CanonicalFieldSpec =
  | { kind: "path"; path: string }
  | { kind: "date"; path: string }
  | { kind: "image"; aspectRatio: string };

export interface ParsedTransformSpec {
  rowSource: RowSource;
  fields: Record<string, CanonicalFieldSpec>;
}

export function parseTransformSpec(input: unknown): ParsedTransformSpec {
  const value = typeof input === "string" ? parseJson(input) : input;
  if (!isRecord(value)) {
    throw new TransformSpecError("Transform spec must be an object.");
  }

  const rows = isRecord(value.rows) ? value.rows : null;
  const fieldsSource = rows && isRecord(rows.fields) ? rows.fields : value.fields;
  if (!isRecord(fieldsSource)) {
    throw new TransformSpecError(
      "Transform spec must include a 'fields' object (rows.fields or top-level)."
    );
  }

  const rawSource =
    typeof (rows?.source ?? value.rowSource) === "string"
      ? String(rows?.source ?? value.rowSource).trim()
      : undefined;
  const normalizedSource = rawSource
    ? rawSource.toLowerCase()
    : DEFAULT_ROW_SOURCE;

  if (normalizedSource !== DEFAULT_ROW_SOURCE) {
    throw new TransformSpecError(
      `Unsupported row source '${rawSource ?? normalizedSource}'. Only 'recipes' is supported.`
    );
  }

  const fields: Record<string, CanonicalFieldSpec> = {};
  for (const [key, spec] of Object.entries(fieldsSource)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      throw new TransformSpecError("Transform field keys cannot be empty.");
    }
    fields[trimmedKey] = parseFieldSpec(trimmedKey, spec);
  }

  return { rowSource: DEFAULT_ROW_SOURCE, fields };
}

export function transformReview(
  specInput: unknown,
  input: TransformInput
): TransformRow[] {
  const spec = parseTransformSpec(specInput);
  return buildRows(spec, input);
}

export function buildRows(
  spec: ParsedTransformSpec,
  input: TransformInput
): TransformRow[] {
  const recipes = Array.isArray(input.recipes)
    ? input.recipes.filter(isRecord)
    : [];
  const ads = Array.isArray(input.ads) ? input.ads.filter(isRecord) : [];

  return recipes.map((recipe) => {
    const context = {
      recipe,
      brand: isRecord(input.brand) ? input.brand : null,
      adGroup: isRecord(input.adGroup) ? input.adGroup : null,
    };

    const row: TransformRow = {};
    for (const [field, descriptor] of Object.entries(spec.fields)) {
      row[field] = resolveField(descriptor, context, ads);
    }
    return row;
  });
}

function parseJson(source: string): unknown {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new TransformSpecError("Transform spec cannot be empty.");
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse transform spec JSON.";
    throw new TransformSpecError(message);
  }
}

function parseFieldSpec(name: string, value: unknown): CanonicalFieldSpec {
  if (typeof value === "string") {
    const path = value.trim();
    if (!path) {
      throw new TransformSpecError(`Field '${name}' requires a non-empty path.`);
    }
    return { kind: "path", path };
  }

  if (!isRecord(value)) {
    throw new TransformSpecError(
      `Field '${name}' must be a string path or an object describing the field.`
    );
  }

  if ("image" in value) {
    const aspectSource = value.image;
    let aspectRatio: string | undefined;
    if (typeof aspectSource === "string") {
      aspectRatio = aspectSource;
    } else if (isRecord(aspectSource) && typeof aspectSource.aspectRatio === "string") {
      aspectRatio = aspectSource.aspectRatio;
    }
    if (!aspectRatio || !aspectRatio.trim()) {
      throw new TransformSpecError(
        `Field '${name}' image helper requires an aspectRatio (e.g. '9x16').`
      );
    }
    return { kind: "image", aspectRatio: aspectRatio.trim() };
  }

  let path: string | undefined =
    typeof value.path === "string" ? value.path.trim() : undefined;

  const format =
    typeof value.format === "string" ? value.format.toLowerCase().trim() : undefined;
  const type = typeof value.type === "string" ? value.type.toLowerCase().trim() : undefined;

  if (typeof value.date === "string") {
    path = value.date.trim();
  }

  const wantsDate =
    format === "date" ||
    type === "date" ||
    (typeof value.date === "boolean" && value.date === true);

  if (!path) {
    throw new TransformSpecError(`Field '${name}' requires a path.`);
  }

  if (wantsDate || typeof value.date === "string") {
    return { kind: "date", path };
  }

  return { kind: "path", path };
}

function resolveField(
  spec: CanonicalFieldSpec,
  context: {
    recipe: Record<string, unknown>;
    brand: Record<string, unknown> | null;
    adGroup: Record<string, unknown> | null;
  },
  ads: Array<Record<string, unknown>>
): unknown {
  switch (spec.kind) {
    case "path": {
      const value = resolvePath(context, spec.path);
      return value === undefined ? null : value;
    }
    case "date": {
      const raw = resolvePath(context, spec.path);
      return normalizeDate(raw);
    }
    case "image":
      return selectImageUrl(ads, context.recipe, spec.aspectRatio);
    default:
      return null;
  }
}

function resolvePath(
  context: {
    recipe: Record<string, unknown>;
    brand: Record<string, unknown> | null;
    adGroup: Record<string, unknown> | null;
  },
  path: string
): unknown {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return null;
  }

  const roots: Record<string, Record<string, unknown> | null> = {
    recipe: context.recipe,
    brand: context.brand,
    adGroup: context.adGroup,
  };

  let current: unknown;
  let remaining = segments;

  const [first, ...rest] = segments;
  if (first in roots) {
    current = roots[first];
    remaining = rest;
  } else {
    current = context.recipe;
  }

  if (!remaining.length) {
    return current ?? null;
  }

  for (const segment of remaining) {
    if (current == null) {
      return null;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
      continue;
    }
    if (isRecord(current)) {
      current = current[segment];
      continue;
    }
    return null;
  }

  return current ?? null;
}

function normalizeDate(value: unknown): string | null {
  const date = coerceDate(value);
  if (!date) {
    return null;
  }
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

function coerceDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms);
  }
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (isRecord(value) && typeof value.seconds === "number") {
    const seconds = value.seconds;
    const nanos = typeof value.nanoseconds === "number" ? value.nanoseconds : 0;
    return new Date(seconds * 1000 + nanos / 1e6);
  }
  return null;
}

function selectImageUrl(
  ads: Array<Record<string, unknown>>,
  recipe: Record<string, unknown>,
  aspectRatio: string
): string | null {
  const normalizedAspect = normalizeAspectRatio(aspectRatio);
  if (!normalizedAspect) {
    return null;
  }

  const recipeCodes = collectRecipeCodes(recipe);
  if (!recipeCodes.size) {
    return null;
  }

  const candidates: Array<{ url: string; timestamp: number }> = [];
  for (const ad of ads) {
    if (!isRecord(ad)) continue;
    const status =
      typeof ad.status === "string" ? ad.status.trim().toLowerCase() : undefined;
    if (status !== "approved") {
      continue;
    }

    const adAspect = normalizeAspectRatio(ad.aspectRatio ?? ad.ratio ?? ad.format);
    if (!adAspect || adAspect !== normalizedAspect) {
      continue;
    }

    const adCodes = collectRecipeCodes(ad);
    const hasMatchingRecipe = Array.from(adCodes).some((code) => recipeCodes.has(code));
    if (!hasMatchingRecipe) {
      continue;
    }

    const url = extractAdUrl(ad);
    if (!url) {
      continue;
    }

    const timestamp = parseTimestamp(ad.uploadedAt ?? ad.updatedAt ?? ad.createdAt);
    candidates.push({ url, timestamp: timestamp ?? 0 });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0]?.url ?? null;
}

function collectRecipeCodes(record: Record<string, unknown>): Set<string> {
  const keys = [
    "recipeCode",
    "recipeNo",
    "recipeNumber",
    "recipeId",
    "recipe_id",
    "code",
    "slug",
  ];
  const result = new Set<string>();
  for (const key of keys) {
    const value = record[key];
    const normalized = normalizeCode(value);
    if (normalized) {
      result.add(normalized);
    }
  }
  return result;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeAspectRatio(value: unknown): string {
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
  return lowered.replace(/[×:]/g, "x").replace(/\s+/g, "");
}

function extractAdUrl(record: Record<string, unknown>): string | null {
  const candidates = [
    record.firebaseUrl,
    record.downloadUrl,
    record.url,
    record.href,
    record.assetUrl,
    record.source,
    record.path,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function parseTimestamp(value: unknown): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value > 1e12 ? value : value * 1000;
  }
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  if (isRecord(value) && typeof value.seconds === "number") {
    const seconds = value.seconds;
    const nanos = typeof value.nanoseconds === "number" ? value.nanoseconds : 0;
    return seconds * 1000 + nanos / 1e6;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
