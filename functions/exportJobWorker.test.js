/**
 * @jest-environment node
 */

jest.mock('firebase-admin', () => {
  const adAssets = new Map();
  const exportJobs = new Map();
  const FieldValue = { serverTimestamp: jest.fn(() => '__ts__') };

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
      throw new Error(`Unexpected collection ${name}`);
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
    __mockExportJobs: exportJobs,
    __FieldValue: FieldValue,
  };
});

const adminMock = jest.requireMock('firebase-admin');
const adAssetsStore = adminMock.__mockAdAssets;
const exportJobsStore = adminMock.__mockExportJobs;

let processExportJobCallable;

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
  ({ processExportJobCallable } = await import('./exportJobWorker.js'));
});

beforeEach(() => {
  adAssetsStore.clear();
  exportJobsStore.clear();
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
