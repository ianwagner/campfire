import type { ApiHandler } from "../lib/api/types";
import {
  buildIntegrationRequest,
  createMappingContext,
  dispatchIntegrationRequest,
  executeMapping,
  integrationDocPath,
  type ExportAttempt,
  type Integration,
  type IntegrationId,
} from "../lib/integrations";
import { getFirestore } from "../lib/firebase/admin";

interface IntegrationWorkerRequestBody {
  integration?: Integration;
  integrationId?: IntegrationId;
  reviewId: string;
  payload: Record<string, unknown>;
  attempt: number;
  dryRun?: boolean;
  history?: ExportAttempt[];
}

function isIntegrationWorkerRequestBody(
  value: unknown,
): value is IntegrationWorkerRequestBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { integration, integrationId, reviewId, payload, attempt } =
    value as Record<string, unknown>;

  const hasIntegration = Boolean(integration) || typeof integrationId === "string";
  return (
    hasIntegration &&
    typeof reviewId === "string" &&
    typeof attempt === "number" &&
    typeof payload === "object" &&
    payload !== null
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

  const {
    integration: integrationPayload,
    integrationId: providedIntegrationId,
    reviewId,
    payload,
    attempt,
    dryRun = false,
    history = [],
  } = req.body;

  let integration = integrationPayload ?? null;
  let integrationId =
    typeof providedIntegrationId === "string" && providedIntegrationId.trim()
      ? (providedIntegrationId as IntegrationId)
      : integration?.id ?? null;

  if (!integration) {
    if (!integrationId) {
      return res.status(400).json({ error: "Integration or integrationId is required." });
    }

    try {
      const snapshot = await getFirestore().doc(integrationDocPath(integrationId)).get();
      if (!snapshot.exists) {
        return res.status(404).json({ error: "Integration not found." });
      }
      const data = snapshot.data() ?? {};
      integration = {
        id: snapshot.id,
        ...(data as Record<string, unknown>),
      } as Integration;
    } catch (error) {
      console.error("Failed to load integration", error);
      return res.status(500).json({ error: "Failed to load integration." });
    }
  }

  if (!integrationId) {
    integrationId = integration?.id ?? null;
  }

  if (!integrationId) {
    return res.status(400).json({ error: "Integration id is required." });
  }

  integration = {
    ...integration,
    id: integrationId,
  } as Integration;

  const mappingContext = await createMappingContext(
    integration,
    reviewId,
    payload,
    dryRun,
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
