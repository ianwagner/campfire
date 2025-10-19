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

export const COMPASS_REQUIRED_FIELDS = [
  'shop',
  'group_desc',
  'recipe_no',
  'product',
  'product_url',
  'go_live_date',
  'funnel',
  'angle',
  'persona',
  'primary_text',
  'headline',
  'image_1x1',
  'image_9x16',
];

export const COMPASS_OPTIONAL_FIELDS = ['moment', 'description', 'status'];

export const COMPASS_FIELD_LABELS = {
  shop: 'Shop',
  group_desc: 'Group description',
  recipe_no: 'Recipe number',
  product: 'Product',
  product_url: 'Product URL',
  go_live_date: 'Go live date',
  funnel: 'Funnel',
  angle: 'Angle',
  persona: 'Persona',
  primary_text: 'Primary text',
  headline: 'Headline',
  image_1x1: '1×1 creative',
  image_9x16: '9×16 creative',
  moment: 'Moment',
  description: 'Description',
  status: 'Status',
};

const buildCompassFieldDefinitions = () => {
  const requiredDefinitions = COMPASS_REQUIRED_FIELDS.map((key) =>
    createFieldDefinition({ key, label: COMPASS_FIELD_LABELS[key] || key, required: true }),
  ).filter(Boolean);

  const optionalDefinitions = COMPASS_OPTIONAL_FIELDS.map((key) =>
    createFieldDefinition({ key, label: COMPASS_FIELD_LABELS[key] || key, required: false }),
  ).filter(Boolean);

  return [...requiredDefinitions, ...optionalDefinitions];
};

const INTEGRATION_FIELD_DEFINITIONS = {
  compass: buildCompassFieldDefinitions(),
};

export const CAMPFIRE_STANDARD_FIELDS = [
  createFieldDefinition({ key: 'brand.id', label: 'Brand ID' }),
  createFieldDefinition({ key: 'brand.code', label: 'Brand code (Campfire)' }),
  createFieldDefinition({ key: 'brandCode', label: 'Brand code (legacy)' }),
  createFieldDefinition({ key: 'brand.name', label: 'Brand name' }),
  createFieldDefinition({ key: 'storeId', label: 'Store ID' }),
  createFieldDefinition({ key: 'store.id', label: 'Store ID (nested)' }),
  createFieldDefinition({ key: 'assetUrl', label: 'Primary asset URL' }),
  createFieldDefinition({ key: 'group_desc', label: 'Group description (Compass)' }),
  createFieldDefinition({ key: 'group.description', label: 'Group description' }),
  createFieldDefinition({ key: 'group.name', label: 'Group name' }),
  createFieldDefinition({ key: 'recipeNumber', label: 'Recipe number' }),
  createFieldDefinition({ key: 'recipe_no', label: 'Recipe number (Compass)' }),
  createFieldDefinition({ key: 'recipe.recipe_no', label: 'Recipe number (Recipe data)' }),
  createFieldDefinition({ key: 'recipe.fields.recipe_no', label: 'Recipe number (Recipe fields)' }),
  createFieldDefinition({ key: 'product', label: 'Product (Compass)' }),
  createFieldDefinition({ key: 'product_name', label: 'Product name (Recipe data)' }),
  createFieldDefinition({ key: 'productName', label: 'Product name (metadata)' }),
  createFieldDefinition({ key: 'product_url', label: 'Product URL (Compass)' }),
  createFieldDefinition({ key: 'productUrl', label: 'Product URL (metadata)' }),
  createFieldDefinition({ key: 'go_live_date', label: 'Go live date (Compass)' }),
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
