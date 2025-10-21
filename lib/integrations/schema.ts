import type { ExportAttempt, ExportStatus, IntegrationId } from "./types";
import { getFirestore } from "../firebase/admin";

export const REVIEW_ADS_SUBCOLLECTION = "ads";
export const CLIENTS_COLLECTION = "clients";

export const INTEGRATIONS_COLLECTION = "integrations";
export const INTEGRATION_VERSIONS_SUBCOLLECTION = "versions";
export const REVIEWS_COLLECTION = "reviews";
export const INTEGRATION_FAILURES_COLLECTION = "integration_failures";

export interface ReviewIntegrationState {
  assignedIntegrationId?: IntegrationId | null;
  exportStatus?: ExportStatus;
  lastExport?: ExportAttempt | null;
}

export function integrationDocPath(id: IntegrationId): string {
  return `${INTEGRATIONS_COLLECTION}/${id}`;
}

export function integrationVersionDocPath(
  integrationId: IntegrationId,
  versionId: string
): string {
  return `${integrationDocPath(integrationId)}/${INTEGRATION_VERSIONS_SUBCOLLECTION}/${versionId}`;
}

export function reviewDocPath(reviewId: string): string {
  return `${REVIEWS_COLLECTION}/${reviewId}`;
}

export function integrationFailureDocPath(failureId: string): string {
  return `${INTEGRATION_FAILURES_COLLECTION}/${failureId}`;
}

function normalizeSchemaRef(schemaRef: string): string {
  if (schemaRef.startsWith("firestore://")) {
    return schemaRef.replace(/^firestore:\/\//, "");
  }

  return schemaRef;
}

export async function loadIntegrationSchema(
  schemaRef: string
): Promise<Record<string, unknown> | null> {
  const trimmed = schemaRef.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    throw new Error("Inline schema references must resolve to a JSON object.");
  }

  if (trimmed.startsWith("data:application/json")) {
    const payload = trimmed.replace(/^data:application\/json(?:;charset=[^,]+)?,/i, "");
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Encoded schema did not decode to a JSON object.");
  }

  const db = getFirestore();
  const docPath = normalizeSchemaRef(trimmed);
  const snapshot = await db.doc(docPath).get();

  if (!snapshot.exists) {
    throw new Error(`Schema reference not found at ${docPath}`);
  }

  const data = snapshot.data() ?? {};
  const schema = (data as Record<string, unknown>).schema;
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as Record<string, unknown>;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  throw new Error("Schema document must contain a JSON object.");
}
