import type { TransformInput } from "./engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asRecord).filter((record): record is Record<string, unknown> => Boolean(record));
}

function extractRecipesFromValue(
  value: unknown,
): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .map(asRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
  }
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items
      .map(asRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
  }
  return [];
}

function pickObject(
  sources: Array<Record<string, unknown>>,
  keys: string[],
): Record<string, unknown> | null {
  for (const source of sources) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        continue;
      }
      const candidate = source[key];
      if (isRecord(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export interface TransformContextPayload {
  review?: unknown;
  ads?: unknown;
  brand?: unknown;
  adGroup?: unknown;
  recipes?: unknown;
}

export function buildTransformInput(
  context: TransformContextPayload,
): TransformInput {
  const review = asRecord(context.review);
  const sources: Array<Record<string, unknown>> = [];

  const pushSource = (value: unknown) => {
    const record = asRecord(value);
    if (record) {
      sources.push(record);
    }
  };

  pushSource(review);

  const reviewSnapshot = isRecord(review?.snapshot) ? review?.snapshot : null;
  if (reviewSnapshot) {
    pushSource(reviewSnapshot);
    pushSource(asRecord(reviewSnapshot.review));
    pushSource(asRecord(reviewSnapshot.data));
  }

  const legacySnapshot = isRecord(review?.reviewSnapshot) ? review?.reviewSnapshot : null;
  if (legacySnapshot) {
    pushSource(legacySnapshot);
    pushSource(asRecord(legacySnapshot.review));
    pushSource(asRecord(legacySnapshot.data));
  }

  if (isRecord(context.brand)) {
    pushSource(context.brand);
  }
  if (isRecord(context.adGroup)) {
    pushSource(context.adGroup);
  }

  let recipes: Array<Record<string, unknown>> = [];
  if (Array.isArray(context.recipes)) {
    recipes = extractRecipesFromValue(context.recipes);
  }

  if (!recipes.length) {
    const recipeKeys = ["recipes", "recipeList", "recipeSnapshots", "items", "values"];
    for (const source of sources) {
      for (const key of recipeKeys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
          continue;
        }
        const extracted = extractRecipesFromValue(source[key]);
        if (extracted.length) {
          recipes = extracted;
          break;
        }
      }
      if (recipes.length) {
        break;
      }
    }
  }

  if (!recipes.length && Array.isArray(review?.recipes)) {
    recipes = review.recipes
      .map(asRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
  }

  const ads = asRecordArray(context.ads);

  const brand = asRecord(context.brand) ?? pickObject(sources, [
    "brand",
    "brandSnapshot",
    "brandData",
    "brandInfo",
  ]);
  const adGroup = asRecord(context.adGroup) ?? pickObject(sources, [
    "adGroup",
    "group",
    "adgroup",
    "adGroupSnapshot",
    "groupSnapshot",
  ]);

  return {
    brand,
    adGroup,
    recipes,
    ads,
  };
}

export function isTransformSpecCandidate(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const fields = isRecord(value.fields) ? value.fields : null;
  const rows = isRecord(value.rows) ? value.rows : null;
  const rowFields = rows && isRecord(rows.fields) ? rows.fields : null;

  return (
    (fields != null && Object.keys(fields).length > 0) ||
    (rowFields != null && Object.keys(rowFields).length > 0)
  );
}
