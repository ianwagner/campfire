/**
 * @jest-environment node
 */

jest.mock('firebase-admin', () => {
  const adAssets = new Map();
  const exportJobs = new Map();
  const FieldValue = { serverTimestamp: jest.fn(() => '__ts__') };
  const collectionGroupAssets = new Map();

  function ensureExportJobEntry(id) {
    if (!exportJobs.has(id)) {
      exportJobs.set(id, { data: undefined, writes: [], ref: null });
    }
    const entry = exportJobs.get(id);
    if (!entry.writes) entry.writes = [];
    if (!entry.ref) {
      const docRef = {
        id,
        set: jest.fn((payload, options) => {
          entry.writes.push({ payload, options });
          if (options && options.merge && entry.data && typeof entry.data === 'object') {
            entry.data = { ...entry.data, ...payload };
          } else {
            entry.data = payload;
          }
          return Promise.resolve();
        }),
      };
      docRef.get = async () => {
        if (entry.data === undefined) {
          return { exists: false, id, ref: docRef };
        }
        return {
          exists: true,
          id,
          data: () => entry.data,
          ref: docRef,
        };
      };
      entry.ref = docRef;
    }
    return entry.ref;
  }

  const settingsStore = new Map();

  const firestoreInstance = {
    collection: jest.fn((name) => {
      if (name === 'adAssets') {
        return {
          doc: (id) => ({
            async get() {
              const data = adAssets.get(id);
              if (!data) {
                return { exists: false };
              }
              return {
                exists: true,
                id,
                data: () => data,
              };
            },
          }),
        };
      }
      if (name === 'exportJobs') {
        return {
          doc: (id) => ensureExportJobEntry(id),
        };
      }
      if (name === 'settings') {
        return {
          doc: (id) => ({
            async get() {
              if (!settingsStore.has(id)) {
                return { exists: false, id };
              }
              const data = settingsStore.get(id);
              return {
                exists: true,
                id,
                data: () => data,
              };
            },
            async set(payload) {
              settingsStore.set(id, payload);
              return Promise.resolve();
            },
          }),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    collectionGroup: jest.fn((name) => {
      if (name !== 'assets') {
        throw new Error(`Unexpected collectionGroup ${name}`);
      }
      return {
        where: (fieldPath, op, value) => {
          if (op !== '==') {
            throw new Error(`Unsupported operator ${op}`);
          }
          return {
            limit: () => ({
              async get() {
                if (!collectionGroupAssets.has(value)) {
                  return { empty: true, size: 0, docs: [] };
                }
                const entry = collectionGroupAssets.get(value);
                return {
                  empty: false,
                  size: 1,
                  docs: [
                    {
                      id: value,
                      data: () => entry.data,
                      ref: {
                        parent: {
                          parent: entry.adGroupId
                            ? { id: entry.adGroupId }
                            : undefined,
                        },
                      },
                    },
                  ],
                };
              },
            }),
          };
        },
      };
    }),
  };
  const firestore = jest.fn(() => firestoreInstance);
  firestore.FieldValue = FieldValue;
  firestore.FieldPath = { documentId: jest.fn(() => '__document_id__') };

  return {
    __esModule: true,
    default: {
      apps: [],
      initializeApp: jest.fn(),
      firestore,
    },
    __mockAdAssets: adAssets,
    __mockExportJobs: exportJobs,
    __mockSettings: settingsStore,
    __FieldValue: FieldValue,
    __mockCollectionGroupAssets: collectionGroupAssets,
  };
});

const adminMock = jest.requireMock('firebase-admin');
const adAssetsStore = adminMock.__mockAdAssets;
const exportJobsStore = adminMock.__mockExportJobs;
const settingsStore = adminMock.__mockSettings;
const groupAssetsStore = adminMock.__mockCollectionGroupAssets;

let processExportJobCallable;
let runExportJobCallable;
let resetIntegrationCache;

const defaultCompassFields = {
  shop: 'TESTSHOP',
  group_desc: 'Group Description',
  recipe_no: 101,
  product: 'Product Name',
  product_url: 'https://example.com/product',
  go_live_date: '2024-01-01',
  funnel: 'Awareness',
  angle: 'Angle 1',
  persona: 'Persona 1',
  primary_text: 'Primary text goes here',
  headline: 'Headline text',
  image_1x1: 'https://cdn.example.com/default-1x1.png',
  image_9x16: 'https://cdn.example.com/default-9x16.png',
};

function buildCompassFields(overrides = {}) {
  return { ...defaultCompassFields, ...overrides };
}

function seedExportJob(jobId, jobData) {
  exportJobsStore.set(jobId, { data: jobData, writes: [], ref: null });
}

function getJobWrites(jobId) {
  const entry = exportJobsStore.get(jobId);
  return entry?.writes || [];
}

function mockFetchResponse({ status = 200, ok = true, statusText = 'OK', body = '' }) {
  return {
    ok,
    status,
    statusText,
    async text() {
      return body;
    },
  };
}

beforeAll(async () => {
  ({ processExportJobCallable, runExportJob: runExportJobCallable } = await import('./exportJobWorker.js'));
  ({ __resetIntegrationCache: resetIntegrationCache } = await import('./exportIntegrations.js'));
});

beforeEach(() => {
  adAssetsStore.clear();
  exportJobsStore.clear();
  settingsStore.clear();
  groupAssetsStore.clear();
  if (typeof resetIntegrationCache === 'function') {
    resetIntegrationCache();
  }
  adminMock.__FieldValue.serverTimestamp.mockClear();
  global.fetch = jest.fn();
  process.env.COMPASS_EXPORT_ENDPOINT = 'https://partner.example.com/export';
  delete process.env.COMPASS_EXPORT_ENDPOINT_STAGING;
  delete process.env.COMPASS_EXPORT_ENDPOINT_PROD;
  delete process.env.ADLOG_EXPORT_ENDPOINT;
  delete process.env.ADLOG_EXPORT_ENDPOINT_PROD;
  delete process.env.ADLOG_EXPORT_ENDPOINT_STAGING;
});

afterEach(() => {
  delete global.fetch;
  delete process.env.COMPASS_EXPORT_ENDPOINT;
});

function getFinalWrite(writes) {
  expect(writes.length).toBeGreaterThan(0);
  return writes[writes.length - 1].payload;
}

function expectSummaryCounts(finalWrite, counts) {
  expect(finalWrite.summary.counts).toEqual(expect.objectContaining(counts));
}

test('processes approved ads and records success summary', async () => {
  adAssetsStore.set('ad-1', {
    id: 'ad-1',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-1.png',
    status: 'approved',
    name: 'Ad 1',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-1-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-1-9x16.png',
    }),
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-1'],
    brandCode: 'BRAND1',
    targetEnv: 'staging',
    targetIntegration: 'compass',
  };

  seedExportJob('job-success', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-success' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(getJobWrites('job-success'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
  expect(finalWrite.syncStatus['ad-1']).toMatchObject({
    state: 'received',
    message: 'Processed successfully',
    assetUrl: 'https://cdn.example.com/ad-1.png',
  });
});

test('falls back to ad group asset when mirror is missing', async () => {
  groupAssetsStore.set('ad-fallback', {
    data: {
      id: 'ad-fallback',
      brandCode: 'BRAND2',
      assetUrl: 'https://cdn.example.com/ad-fallback.png',
      compass: buildCompassFields({
        shop: 'BRAND2',
        image_1x1: 'https://cdn.example.com/ad-fallback-1x1.png',
        image_9x16: 'https://cdn.example.com/ad-fallback-9x16.png',
      }),
    },
    adGroupId: 'group-123',
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-fallback'],
    brandCode: 'BRAND2',
    targetEnv: 'staging',
    targetIntegration: 'compass',
  };

  seedExportJob('job-fallback', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-fallback' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(getJobWrites('job-fallback'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
  expect(finalWrite.syncStatus['ad-fallback']).toMatchObject({
    state: 'received',
    message: 'Processed successfully',
    assetUrl: 'https://cdn.example.com/ad-fallback.png',
  });
});

test('builds payload using Firestore field mapping configuration', async () => {
  settingsStore.set('exporterIntegrations', {
    integrations: [
      {
        id: 'dynamic-1',
        partnerKey: 'test-partner',
        name: 'Test Partner',
        baseUrl: 'https://partner.example.com/export',
        apiKey: 'secret-key',
        enabled: true,
        recipeTypeId: 'recipe-type-1',
        fieldMapping: {
          productName: 'product_name',
          recipeId: 'recipe_no',
          assetUrl: 'assetUrl',
        },
      },
    ],
  });

  adAssetsStore.set('ad-dynamic', {
    id: 'ad-dynamic',
    assetUrl: 'https://cdn.example.com/dynamic.png',
    recipe: {
      product_name: 'Dynamic Product',
      recipe_no: 321,
    },
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-dynamic'],
    adIds: ['ad-dynamic'],
    brandCode: 'BRAND1',
    targetIntegration: 'test-partner',
    integrationKey: 'test-partner',
  };

  seedExportJob('job-dynamic', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-dynamic' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [endpoint, requestInit] = global.fetch.mock.calls[0];
  expect(endpoint).toBe('https://partner.example.com/export');
  expect(requestInit.headers).toMatchObject({
    'Content-Type': 'application/json',
    Authorization: 'Bearer secret-key',
    'x-api-key': 'secret-key',
  });
  const payload = JSON.parse(requestInit.body);
  expect(payload).toEqual({
    productName: 'Dynamic Product',
    recipeId: 321,
    assetUrl: 'https://cdn.example.com/dynamic.png',
  });

  const finalWrite = getFinalWrite(getJobWrites('job-dynamic'));
  expect(finalWrite.status).toBe('success');
  expect(finalWrite.integration).toMatchObject({
    key: 'test-partner',
    label: 'Test Partner',
  });
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
});

test('supports standard compass fields and carousel asset mappings', async () => {
  settingsStore.set('exporterIntegrations', {
    integrations: [
      {
        id: 'carousel-1',
        partnerKey: 'carousel-partner',
        name: 'Carousel Partner',
        baseUrl: 'https://partner.example.com/carousel',
        apiKey: 'carousel-secret',
        enabled: true,
        recipeTypeId: 'recipe-carousel',
        fieldMapping: {
          shopId: 'brandCode',
          groupName: 'group_desc',
          recipeId: 'recipe_no',
          productName: 'product',
          productLink: 'product_url',
          launchDate: 'go_live_date',
          funnelStage: 'funnel',
          angleName: 'angle',
          personaName: 'persona',
          primaryCopy: 'primary_text',
          headlineCopy: 'headline',
          squareOne: 'image_1x1_1',
          squareTwo: 'image_1x1_2',
          storyImage: 'image_9x16',
        },
      },
    ],
  });

  adAssetsStore.set('ad-carousel', {
    id: 'ad-carousel',
    brandCode: 'SHOP123',
    recipe: {
      fields: {
        recipe_no: '200',
        group_desc: 'Spring Launch Group',
        product: 'Carousel Product',
        product_url: 'https://example.com/product',
        go_live_date: '2024-03-05',
        funnel: 'Awareness',
        angle: 'Angle 1',
        persona: 'Persona 1',
        primary_text: 'Primary carousel message',
        headline: 'Carousel headline',
      },
    },
    compass: {
      group_desc: 'Spring Launch Group',
      funnel: 'Awareness',
      angle: 'Angle 1',
      persona: 'Persona 1',
      primary_text: 'Primary carousel message',
      headline: 'Carousel headline',
    },
    assets: [
      {
        url: 'https://cdn.example.com/square-1.png',
        aspectRatio: '1x1',
        order: 0,
      },
      {
        url: 'https://cdn.example.com/square-2.png',
        aspectRatio: '1x1',
        order: 1,
      },
      {
        url: 'https://cdn.example.com/vertical.png',
        aspectRatio: '9x16',
        order: 0,
      },
    ],
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-carousel'],
    adIds: ['ad-carousel'],
    brandCode: 'SHOP123',
    group: { description: 'Spring Launch Group' },
    targetIntegration: 'carousel-partner',
    integrationKey: 'carousel-partner',
  };

  seedExportJob('job-carousel', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-carousel' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [endpoint, requestInit] = global.fetch.mock.calls[0];
  expect(endpoint).toBe('https://partner.example.com/carousel');
  expect(requestInit.headers).toMatchObject({
    Authorization: 'Bearer carousel-secret',
    'x-api-key': 'carousel-secret',
  });
  const payload = JSON.parse(requestInit.body);
  expect(payload).toEqual({
    shopId: 'SHOP123',
    groupName: 'Spring Launch Group',
    recipeId: 200,
    productName: 'Carousel Product',
    productLink: 'https://example.com/product',
    launchDate: '2024-03-05',
    funnelStage: 'Awareness',
    angleName: 'Angle 1',
    personaName: 'Persona 1',
    primaryCopy: 'Primary carousel message',
    headlineCopy: 'Carousel headline',
    squareOne: 'https://cdn.example.com/square-1.png',
    squareTwo: 'https://cdn.example.com/square-2.png',
    storyImage: 'https://cdn.example.com/vertical.png',
  });

  const finalWrite = getFinalWrite(getJobWrites('job-carousel'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
});

test('uses production endpoint environment variable regardless of targetEnv casing', async () => {
  adAssetsStore.set('ad-prod', {
    id: 'ad-prod',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-prod.png',
    status: 'approved',
    name: 'Ad Prod',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-prod-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-prod-9x16.png',
    }),
  });

  process.env.COMPASS_EXPORT_ENDPOINT = 'https://partner.example.com/default';
  process.env.COMPASS_EXPORT_ENDPOINT_PROD = 'https://partner.example.com/prod';

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-prod'],
    brandCode: 'BRAND1',
    targetIntegration: 'compass',
    targetEnv: 'Production',
  };

  seedExportJob('job-prod-env', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-prod-env' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe('https://partner.example.com/prod');
});

test('uses integration endpoint from job data when environment variables are absent', async () => {
  adAssetsStore.set('ad-1', {
    id: 'ad-1',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-1.png',
    status: 'approved',
    name: 'Ad 1',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-1-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-1-9x16.png',
    }),
  });

  const jobDefinedEndpoint = 'https://job-endpoint.example.com/export';

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  delete process.env.COMPASS_EXPORT_ENDPOINT;
  delete process.env.ADLOG_EXPORT_ENDPOINT;
  delete process.env.COMPASS_EXPORT_ENDPOINT_STAGING;
  delete process.env.ADLOG_EXPORT_ENDPOINT_STAGING;
  delete process.env.COMPASS_EXPORT_ENDPOINT_PROD;
  delete process.env.ADLOG_EXPORT_ENDPOINT_PROD;

  const jobData = {
    approvedAdIds: ['ad-1'],
    brandCode: 'BRAND1',
    targetIntegration: 'compass',
    targetEnv: 'staging',
    integration: {
      endpoint: jobDefinedEndpoint,
    },
  };

  seedExportJob('job-job-endpoint', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-job-endpoint' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe(jobDefinedEndpoint);

  const finalWrite = getFinalWrite(getJobWrites('job-job-endpoint'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
});

test('uses compass endpoint defined in destination map structure', async () => {
  adAssetsStore.set('ad-map', {
    id: 'ad-map',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-map.png',
    status: 'approved',
    name: 'Ad Map',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-map-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-map-9x16.png',
    }),
  });

  const destinationEndpoint = 'https://destination-map.example.com/export';

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  delete process.env.COMPASS_EXPORT_ENDPOINT;
  delete process.env.ADLOG_EXPORT_ENDPOINT;
  delete process.env.COMPASS_EXPORT_ENDPOINT_STAGING;
  delete process.env.ADLOG_EXPORT_ENDPOINT_STAGING;
  delete process.env.COMPASS_EXPORT_ENDPOINT_PROD;
  delete process.env.ADLOG_EXPORT_ENDPOINT_PROD;

  const jobData = {
    approvedAdIds: ['ad-map'],
    brandCode: 'BRAND1',
    targetIntegration: 'compass',
    targetEnv: 'staging',
    destinations: {
      compass: {
        endpoint: destinationEndpoint,
      },
    },
  };

  seedExportJob('job-destination-map', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-destination-map' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe(destinationEndpoint);

  const finalWrite = getFinalWrite(getJobWrites('job-destination-map'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
});

test('uses compass partner endpoint defined under partners map', async () => {
  adAssetsStore.set('ad-partner-map', {
    id: 'ad-partner-map',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-partner-map.png',
    status: 'approved',
    name: 'Ad Partner Map',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-partner-map-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-partner-map-9x16.png',
    }),
  });

  const partnerEndpoint = 'https://partners.example.com/compass-export';

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Processed successfully' }),
    }),
  );

  delete process.env.COMPASS_EXPORT_ENDPOINT;
  delete process.env.ADLOG_EXPORT_ENDPOINT;
  delete process.env.COMPASS_EXPORT_ENDPOINT_STAGING;
  delete process.env.ADLOG_EXPORT_ENDPOINT_STAGING;
  delete process.env.COMPASS_EXPORT_ENDPOINT_PROD;
  delete process.env.ADLOG_EXPORT_ENDPOINT_PROD;

  const jobData = {
    approvedAdIds: ['ad-partner-map'],
    brandCode: 'BRAND1',
    targetIntegration: 'compass',
    targetEnv: 'staging',
    destinations: {
      partners: {
        compass: {
          partner: 'Compass',
          partnerEndpoint,
        },
      },
    },
  };

  seedExportJob('job-partner-map', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-partner-map' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe(partnerEndpoint);

  const finalWrite = getFinalWrite(getJobWrites('job-partner-map'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    received: 1,
    duplicate: 0,
    error: 0,
    success: 1,
  });
});

test('runExportJob returns status and counts in response', async () => {
  adAssetsStore.set('ad-http', {
    id: 'ad-http',
    brandCode: 'BRAND1',
    assetUrl: 'https://cdn.example.com/ad-http.png',
    compass: buildCompassFields({
      shop: 'BRAND1',
      image_1x1: 'https://cdn.example.com/ad-http-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-http-9x16.png',
    }),
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 200,
      ok: true,
      statusText: 'OK',
      body: JSON.stringify({ message: 'Delivered' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-http'],
    brandCode: 'BRAND1',
    targetIntegration: 'compass',
  };

  seedExportJob('job-http', jobData);

  const result = await runExportJobCallable.run({ data: { jobId: 'job-http' } });

  expect(result).toMatchObject({
    status: 'success',
    counts: {
      total: 1,
      received: 1,
      duplicate: 0,
      error: 0,
      success: 1,
    },
  });

  const finalWrite = getFinalWrite(getJobWrites('job-http'));
  expect(finalWrite.status).toBe('success');
});

test('marks duplicates as success with duplicate state', async () => {
  adAssetsStore.set('ad-dup', {
    id: 'ad-dup',
    brandCode: 'BRAND2',
    assetUrl: 'https://cdn.example.com/ad-dup.png',
    compass: buildCompassFields({
      shop: 'BRAND2',
      image_1x1: 'https://cdn.example.com/ad-dup-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-dup-9x16.png',
    }),
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 409,
      ok: false,
      statusText: 'Conflict',
      body: JSON.stringify({ message: 'Already exported' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-dup'],
    brandCode: 'BRAND2',
    targetIntegration: 'compass',
  };

  seedExportJob('job-duplicate', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-duplicate' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(getJobWrites('job-duplicate'));
  expect(finalWrite.status).toBe('success');
  expectSummaryCounts(finalWrite, {
    total: 1,
    duplicate: 1,
    error: 0,
    success: 1,
  });
  expect(finalWrite.syncStatus['ad-dup']).toMatchObject({
    state: 'duplicate',
    message: 'Already exported',
  });
});

test('rejects invalid asset urls and surfaces validation error', async () => {
  adAssetsStore.set('ad-bad', {
    id: 'ad-bad',
    brandCode: 'BRAND3',
    assetUrl: 'https://drive.google.com/drive/folders/abc123',
    compass: buildCompassFields({
      shop: 'BRAND3',
      image_1x1: 'https://cdn.example.com/ad-bad-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-bad-9x16.png',
    }),
  });

  const jobData = {
    approvedAdIds: ['ad-bad'],
    brandCode: 'BRAND3',
    targetIntegration: 'compass',
  };

  seedExportJob('job-invalid-url', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-invalid-url' } });

  expect(global.fetch).not.toHaveBeenCalled();
  const finalWrite = getFinalWrite(getJobWrites('job-invalid-url'));
  expect(finalWrite.status).toBe('failed');
  expectSummaryCounts(finalWrite, {
    total: 1,
    error: 1,
    success: 0,
  });
  expect(finalWrite.syncStatus['ad-bad']).toMatchObject({
    state: 'error',
    message: expect.stringContaining('Invalid asset URL'),
  });
});

test('surfaces partner error responses for invalid brands', async () => {
  adAssetsStore.set('ad-brand', {
    id: 'ad-brand',
    brandCode: 'WRONG',
    assetUrl: 'https://cdn.example.com/ad-brand.png',
    compass: buildCompassFields({
      shop: 'WRONG',
      image_1x1: 'https://cdn.example.com/ad-brand-1x1.png',
      image_9x16: 'https://cdn.example.com/ad-brand-9x16.png',
    }),
  });

  global.fetch.mockResolvedValue(
    mockFetchResponse({
      status: 400,
      ok: false,
      statusText: 'Bad Request',
      body: JSON.stringify({ message: 'Unknown brand code' }),
    }),
  );

  const jobData = {
    approvedAdIds: ['ad-brand'],
    brandCode: 'WRONG',
    targetIntegration: 'compass',
  };

  seedExportJob('job-invalid-brand', jobData);

  await processExportJobCallable.run({ data: { jobId: 'job-invalid-brand' } });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(getJobWrites('job-invalid-brand'));
  expect(finalWrite.status).toBe('failed');
  expectSummaryCounts(finalWrite, {
    total: 1,
    error: 1,
    success: 0,
  });
  expect(finalWrite.syncStatus['ad-brand']).toMatchObject({
    state: 'error',
    message: 'Unknown brand code',
  });
});
