const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
};

const createFieldDefinition = ({ key = '', label = '', required = false } = {}) => {
  const normalizedKey = normalizeString(key);
  if (!normalizedKey) {
    return null;
  }
  const normalizedLabel = normalizeString(label) || normalizedKey;
  return {
    key: normalizedKey,
    label: normalizedLabel,
    required: !!required,
  };
};

const INTEGRATION_FIELD_DEFINITIONS = {};

export const CAMPFIRE_STANDARD_FIELDS = [
  createFieldDefinition({ key: 'brand.id', label: 'Brand ID' }),
  createFieldDefinition({ key: 'brand.code', label: 'Brand code (Campfire)' }),
  createFieldDefinition({ key: 'brandCode', label: 'Brand code (legacy)' }),
  createFieldDefinition({ key: 'brand.name', label: 'Brand name' }),
  createFieldDefinition({ key: 'storeId', label: 'Store ID' }),
  createFieldDefinition({ key: 'store.id', label: 'Store ID (nested)' }),
  createFieldDefinition({ key: 'assetUrl', label: 'Primary asset URL' }),
  createFieldDefinition({ key: 'group.description', label: 'Group description' }),
  createFieldDefinition({ key: 'group.name', label: 'Group name' }),
  createFieldDefinition({ key: 'recipeNumber', label: 'Recipe number' }),
  createFieldDefinition({ key: 'recipe.recipe_no', label: 'Recipe number (Recipe data)' }),
  createFieldDefinition({ key: 'recipe.fields.recipe_no', label: 'Recipe number (Recipe fields)' }),
  createFieldDefinition({ key: 'product_name', label: 'Product name (Recipe data)' }),
  createFieldDefinition({ key: 'productName', label: 'Product name (metadata)' }),
  createFieldDefinition({ key: 'productUrl', label: 'Product URL (metadata)' }),
  createFieldDefinition({ key: 'go_live_date', label: 'Go live date' }),
  createFieldDefinition({ key: 'funnel', label: 'Funnel' }),
  createFieldDefinition({ key: 'angle', label: 'Angle' }),
  createFieldDefinition({ key: 'persona', label: 'Persona' }),
  createFieldDefinition({ key: 'primary_text', label: 'Primary text' }),
  createFieldDefinition({ key: 'headline', label: 'Headline' }),
  createFieldDefinition({ key: 'moment', label: 'Moment' }),
  createFieldDefinition({ key: 'description', label: 'Description' }),
  createFieldDefinition({ key: 'status', label: 'Status' }),
].filter(Boolean);

export const getIntegrationFieldDefinitions = (partnerKey) => {
  if (typeof partnerKey !== 'string') {
    return [];
  }
  const normalized = partnerKey.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return INTEGRATION_FIELD_DEFINITIONS[normalized] ? [...INTEGRATION_FIELD_DEFINITIONS[normalized]] : [];
};

export const listIntegrationsWithFieldDefinitions = () =>
  Object.keys(INTEGRATION_FIELD_DEFINITIONS).map((key) => ({
    key,
    fields: [...INTEGRATION_FIELD_DEFINITIONS[key]],
  }));

export const getCampfireStandardFields = () => [...CAMPFIRE_STANDARD_FIELDS];

export default INTEGRATION_FIELD_DEFINITIONS;
