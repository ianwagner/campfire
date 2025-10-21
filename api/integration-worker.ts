import type { ApiHandler } from "../lib/api/types";
import {
  buildIntegrationRequest,
  createMappingContext,
  dispatchIntegrationRequest,
  executeMapping,
  type ExportAttempt,
  type Integration,
} from "../lib/integrations";

interface IntegrationWorkerRequestBody {
  integration: Integration;
  reviewId: string;
  payload: Record<string, unknown>;
  attempt: number;
  dryRun?: boolean;
  history?: ExportAttempt[];
}

function isIntegrationWorkerRequestBody(value: unknown): value is IntegrationWorkerRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { integration, reviewId, payload, attempt } = value as Record<string, unknown>;
  return (
    Boolean(integration) &&
    typeof reviewId === "string" &&
    typeof attempt === "number" &&
    typeof payload === "object"
  );
}

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<IntegrationWorkerRequestBody> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!isIntegrationWorkerRequestBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { integration, reviewId, payload, attempt, dryRun = false, history = [] } = req.body;
  const mappingContext = await createMappingContext(
    integration,
    reviewId,
    payload,
    dryRun
  );
  const mappingResult = await executeMapping(integration.mapping, mappingContext);

  const request = buildIntegrationRequest(integration, mappingResult.payload);

  const dispatchResult = await dispatchIntegrationRequest(request, {
    integration,
    dryRun,
  });

  return res.status(200).json({
    reviewId,
    integrationId: integration.id,
    attempt,
    dryRun,
    history,
    mapping: mappingResult,
    dispatch: dispatchResult,
    request,
  });
};

export default handler;
