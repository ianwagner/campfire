import {
  buildIntegrationRequest,
  createMappingContext,
  dispatchIntegrationRequest,
  executeMapping,
  IntegrationError,
  type Integration,
} from "../../lib/integrations";
import type { ApiHandler } from "../../lib/api/types";

type TestMode = "dry-run" | "live";

interface IntegrationTestRequestBody {
  integration: Integration;
  reviewId: string;
  payload?: Record<string, unknown>;
  mode?: TestMode;
}

function isIntegrationTestRequestBody(value: unknown): value is IntegrationTestRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { integration, reviewId } = value as Record<string, unknown>;
  return Boolean(integration && typeof reviewId === "string");
}

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<IntegrationTestRequestBody> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!isIntegrationTestRequestBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { integration, reviewId, payload = {}, mode = "dry-run" } = req.body;
  const dryRun = mode === "dry-run";

  try {
    const mappingContext = await createMappingContext(
      integration,
      reviewId,
      payload,
      dryRun
    );
    const mappingResult = await executeMapping(
      integration.mapping,
      mappingContext
    );

    const request = buildIntegrationRequest(
      integration,
      mappingResult.payload,
      dryRun
        ? {
            headers: {
              "X-Test": "true",
            },
          }
        : undefined
    );

    const dispatchResult = await dispatchIntegrationRequest(request, {
      integration,
      dryRun,
    });

    return res.status(200).json({
      mode,
      dryRun,
      reviewId,
      integrationId: integration.id,
      mapping: mappingResult,
      dispatch: dispatchResult,
      request,
      context: {
        review: mappingContext.review,
        ads: mappingContext.ads,
        client: mappingContext.client,
        recipeType: mappingContext.recipeType,
        recipeFieldKeys: mappingContext.recipeFieldKeys,
      },
    });
  } catch (error) {
    if (error instanceof IntegrationError) {
      const status =
        error.code === "mapping/review_not_found"
          ? 404
          : error.code.startsWith("mapping/")
          ? 422
          : 400;
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
          : "Integration test failed.",
    });
  }
};

export default handler;
