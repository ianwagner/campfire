import type { ApiHandler } from "../../../lib/api/types";
import { integrationDocPath } from "../../../lib/integrations";

type WebhookPayload = Record<string, unknown>;

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<WebhookPayload> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  const integrationIdRaw = req.query?.id;
  const integrationId = Array.isArray(integrationIdRaw)
    ? integrationIdRaw[0]
    : integrationIdRaw;

  if (!integrationId || typeof integrationId !== "string") {
    return res.status(400).json({ error: "Integration id is required." });
  }

  return res.status(200).json({
    message: "Webhook received.",
    integrationId,
    integrationPath: integrationDocPath(integrationId),
    receivedAt: new Date().toISOString(),
    payload: req.body ?? {},
  });
};

export default handler;
