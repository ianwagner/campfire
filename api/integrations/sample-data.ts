import type { ApiHandler } from "../../lib/api/types";
import { getReviewData, IntegrationError } from "../../lib/integrations";

interface SampleDataRequestBody {
  reviewId: string;
}

function isSampleDataRequestBody(value: unknown): value is SampleDataRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { reviewId } = value as Record<string, unknown>;
  return typeof reviewId === "string" && reviewId.trim().length > 0;
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

  const { reviewId } = req.body;
  try {
    const data = await getReviewData(reviewId);

    return res.status(200).json({
      reviewId,
      review: data.review,
      ads: data.ads,
      client: data.client,
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
