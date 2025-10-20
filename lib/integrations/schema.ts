import type { ExportAttempt, ExportStatus, IntegrationId } from "./types";

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
