import type { Integration, MappingEngine } from "./types";

export interface MappingContext {
  integration: Integration;
  reviewId: string;
  payload: Record<string, unknown>;
  dryRun: boolean;
}

export interface MappingResult {
  payload: Record<string, unknown>;
  warnings: string[];
}

/**
 * Builds a mapping context used by the integration worker. The implementation
 * will eventually hydrate the context with the necessary review and brand
 * metadata so the mapping engine can render templates.
 */
export function createMappingContext(
  integration: Integration,
  reviewId: string,
  payload: Record<string, unknown>,
  dryRun: boolean
): MappingContext {
  return {
    integration,
    reviewId,
    payload,
    dryRun,
  };
}

/**
 * Stub implementation for running a mapping engine. This keeps the shape of
 * the contract stable while the team iterates on the actual templating engine.
 */
export async function executeMapping(
  engine: MappingEngine,
  context: MappingContext
): Promise<MappingResult> {
  return {
    payload: {
      ...context.payload,
      "integration.id": context.integration.id,
      "integration.version": context.integration.version,
      "integration.mappingEngine": engine.type,
      "dryRun": context.dryRun,
    },
    warnings: [
      "Mapping engine execution is not yet implemented. Returning passthrough payload.",
    ],
  };
}
