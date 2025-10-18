/**
 * @jest-environment node
 */

jest.mock('firebase-admin', () => {
  const adAssets = new Map();
  const FieldValue = { serverTimestamp: jest.fn(() => '__ts__') };
  const firestoreInstance = {
    collection: jest.fn((name) => {
      if (name !== 'adAssets') {
        throw new Error(`Unexpected collection ${name}`);
      }
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
    }),
  };
  const firestore = jest.fn(() => firestoreInstance);
  firestore.FieldValue = FieldValue;

  return {
    __esModule: true,
    default: {
      apps: [],
      initializeApp: jest.fn(),
      firestore,
    },
    __mockAdAssets: adAssets,
    __FieldValue: FieldValue,
  };
});

const adminMock = jest.requireMock('firebase-admin');
const adAssetsStore = adminMock.__mockAdAssets;

let processExportJob;

function createEvent(jobData, { jobId = 'job-1' } = {}) {
  const writes = [];
  const jobRef = {
    set: jest.fn((payload, options) => {
      writes.push({ payload, options });
      return Promise.resolve();
    }),
  };
  const snapshot = {
    data: () => jobData,
    ref: jobRef,
  };
  return {
    event: {
      data: snapshot,
      params: { jobId },
    },
    jobRef,
    writes,
  };
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
  ({ processExportJob } = await import('./exportJobWorker.js'));
});

beforeEach(() => {
  adAssetsStore.clear();
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

  const { event, writes } = createEvent(jobData, { jobId: 'job-success' });

  await processExportJob.run(event);

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(writes);
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

test('marks duplicates as success with duplicate state', async () => {
  adAssetsStore.set('ad-dup', {
    id: 'ad-dup',
    brandCode: 'BRAND2',
    assetUrl: 'https://cdn.example.com/ad-dup.png',
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

  const { event, writes } = createEvent(jobData, { jobId: 'job-duplicate' });

  await processExportJob.run(event);

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(writes);
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
  });

  const jobData = {
    approvedAdIds: ['ad-bad'],
    brandCode: 'BRAND3',
    targetIntegration: 'compass',
  };

  const { event, writes } = createEvent(jobData, { jobId: 'job-invalid-url' });

  await processExportJob.run(event);

  expect(global.fetch).not.toHaveBeenCalled();
  const finalWrite = getFinalWrite(writes);
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

  const { event, writes } = createEvent(jobData, { jobId: 'job-invalid-brand' });

  await processExportJob.run(event);

  expect(global.fetch).toHaveBeenCalledTimes(1);
  const finalWrite = getFinalWrite(writes);
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
