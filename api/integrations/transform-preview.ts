import type { ApiHandler } from "../../lib/api/types";
import {
  TransformSpecError,
  transformReview,
  type TransformInput,
} from "../../lib/transform/engine";

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
  return value.filter(isRecord);
}

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

interface TransformPreviewContext {
  review?: Record<string, unknown> | null;
  ads?: unknown;
}

function buildTransformInputFromContext(
  context: TransformPreviewContext,
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

  const pickObject = (keys: string[]): Record<string, unknown> | null => {
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
  };

  const extractRecipesFromValue = (
    value: unknown,
  ): Array<Record<string, unknown>> => {
    if (Array.isArray(value)) {
      return value.map(asRecord).filter((record): record is Record<string, unknown> => Boolean(record));
    }
    if (isRecord(value) && Array.isArray(value.items)) {
      return value.items
        .map(asRecord)
        .filter((record): record is Record<string, unknown> => Boolean(record));
    }
    return [];
  };

  const recipeKeys = ["recipes", "recipeList", "recipeSnapshots", "items", "values"];
  let recipes: Array<Record<string, unknown>> = [];
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

  if (!recipes.length && Array.isArray(review?.recipes)) {
    recipes = review.recipes
      .map(asRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
  }

  const ads = asRecordArray(context.ads);

  return {
    brand: pickObject(["brand", "brandSnapshot", "brandData", "brandInfo"]),
    adGroup: pickObject(["adGroup", "group", "adgroup", "adGroupSnapshot", "groupSnapshot"]),
    recipes,
    ads,
  };
}

const handler: ApiHandler<Record<string, unknown>> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { spec, brand, adGroup, recipes, ads, context } =
    req.body as Record<string, unknown>;
  if (spec == null) {
    return res.status(400).json({ error: "Transform spec is required." });
  }

  let payload: TransformInput;
  if (context && typeof context === "object") {
    payload = buildTransformInputFromContext(context as TransformPreviewContext);
  } else {
    payload = {
      brand: asRecord(brand),
      adGroup: asRecord(adGroup),
      recipes: asRecordArray(recipes),
      ads: asRecordArray(ads),
    };
  }

  try {
    const rows = transformReview(spec, payload);
    return res.status(200).json({ rows });
  } catch (error) {
    if (error instanceof TransformSpecError) {
      return res.status(400).json({
        error: error.message,
        code: "transform/invalid_spec",
      });
    }

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate transform preview.",
    });
  }
};

export default handler;
