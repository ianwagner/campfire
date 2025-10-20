import type { AuthConfig, SecretReference } from "./types";

export const SECRET_MANAGER_PROJECT_ID =
  process.env.GCP_SECRET_MANAGER_PROJECT || "projects/your-gcp-project";

export const SECRET_NAMES = {
  oauthClient: "integrations-oauth-client",
  webhookSigningSecret: "integrations-webhook-signing-key",
  apiKey: "integrations-shared-api-key",
} as const;

export function toSecretManagerName(secretId: string, version = "latest"): string {
  if (secretId.startsWith("projects/")) {
    return secretId.includes("/versions/") ? secretId : `${secretId}/versions/${version}`;
  }

  return `${SECRET_MANAGER_PROJECT_ID}/secrets/${secretId}/versions/${version}`;
}

export function resolveSecretReference(
  config: Pick<AuthConfig, "secret">
): SecretReference | undefined {
  if (!config.secret) {
    return undefined;
  }

  const version = config.secret.version ?? "latest";
  return {
    name: toSecretManagerName(config.secret.name, version),
    version,
  };
}

export async function fetchSecretPayload(
  secret: SecretReference
): Promise<string | undefined> {
  if (!secret.name) {
    return undefined;
  }

  // Placeholder fetch so the integration worker can be wired later.
  return `secret://${secret.name}`;
}
