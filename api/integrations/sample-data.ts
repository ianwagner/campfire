import type { ApiHandler } from "../../lib/api/types";
import {
  createMappingContext,
  IntegrationError,
  type Integration,
} from "../../lib/integrations";

interface SampleDataRequestBody {
  reviewId: string;
  integration: Integration;
  payload?: Record<string, unknown>;
}

function isSampleDataRequestBody(value: unknown): value is SampleDataRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { reviewId, integration } = value as Record<string, unknown>;
  return (
    typeof reviewId === "string" &&
    reviewId.trim().length > 0 &&
    integration !== null &&
    typeof integration === "object"
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

  const { reviewId, integration, payload = {} } = req.body;
  try {
    const context = await createMappingContext(integration, reviewId, payload, true);

    return res.status(200).json({
      reviewId,
      context: {
        review: context.review,
        ads: context.ads,
        client: context.client,
        recipeType: context.recipeType,
        recipeFieldKeys: context.recipeFieldKeys,
        standardAds: context.standardAds,
        summary: context.summary,
        defaultExport: context.defaultExport,
        generatedAt: context.generatedAt,
        data: context.data,
      },
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
