import type { ApiHandler } from "../../lib/api/types";
import {
  getIntegrationSampleData,
  IntegrationError,
} from "../../lib/integrations";

interface SampleDataRequestBody {
  reviewId: string;
  recipeTypeId?: string | null;
  integrationId?: string | null;
  integrationName?: string | null;
  integrationSlug?: string | null;
}

function isSampleDataRequestBody(value: unknown): value is SampleDataRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const {
    reviewId,
    recipeTypeId,
    integrationId,
    integrationName,
    integrationSlug,
  } = value as Record<string, unknown>;

  if (typeof reviewId !== "string" || !reviewId.trim()) {
    return false;
  }

  const optionalStrings = [recipeTypeId, integrationId, integrationName, integrationSlug];
  return optionalStrings.every(
    (entry) => entry === undefined || entry === null || typeof entry === "string"
  );
}

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<SampleDataRequestBody> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!isSampleDataRequestBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { reviewId, recipeTypeId, integrationId, integrationName, integrationSlug } =
    req.body;
  try {
    const data = await getIntegrationSampleData(reviewId, {
      recipeTypeId: recipeTypeId ?? undefined,
      integrationId: integrationId ?? undefined,
      integrationName: integrationName ?? undefined,
      integrationSlug: integrationSlug ?? undefined,
    });

    return res.status(200).json({
      reviewId,
      review: data.review,
      ads: data.ads,
      rawAds: data.rawAds,
      client: data.client,
      recipeType: data.recipeType,
      recipeFieldKeys: data.recipeFieldKeys,
      summary: data.summary,
      standardAds: data.standardAds,
      defaultExport: data.defaultExport,
      generatedAt: data.generatedAt,
    });
  } catch (error) {
    if (error instanceof IntegrationError) {
      const status = error.code === "mapping/review_not_found" ? 404 : 422;
      return res.status(status).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to load review sample data.",
    });
  }
};

export default handler;
