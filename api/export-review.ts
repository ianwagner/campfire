import type { ApiHandler } from "../lib/api/types";
import {
  integrationFailureDocPath,
  integrationDocPath,
  reviewDocPath,
  type IntegrationId,
} from "../lib/integrations";

type QueueMode = "default" | "priority";

interface ExportReviewRequestBody {
  reviewId: string;
  integrationId: IntegrationId;
  mode?: QueueMode;
  dryRun?: boolean;
  triggeredBy?: string;
}

function isExportReviewRequestBody(value: unknown): value is ExportReviewRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { reviewId, integrationId } = value as Record<string, unknown>;
  return typeof reviewId === "string" && typeof integrationId === "string";
}

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<ExportReviewRequestBody> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!isExportReviewRequestBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { reviewId, integrationId, mode = "default", dryRun = false, triggeredBy } =
    req.body;

  // Cloud Tasks wiring will be added during implementation milestones. For now we
  // return the document paths used by the worker so the queueing contract is
  // defined.
  const queuePayload = {
    reviewPath: reviewDocPath(reviewId),
    integrationPath: integrationDocPath(integrationId),
    deadLetterPath: integrationFailureDocPath(`${reviewId}-${integrationId}`),
    mode,
    dryRun,
    triggeredBy: triggeredBy ?? "api",
    enqueuedAt: new Date().toISOString(),
  };

  return res.status(202).json({
    message: "Review export enqueued.",
    queuePayload,
  });
};

export default handler;
