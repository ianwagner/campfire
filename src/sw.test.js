const events = {};

global.self = {
  addEventListener: (type, cb) => {
    events[type] = cb;
  },
};

const put = jest.fn();

global.caches = {
  open: jest.fn().mockResolvedValue({ put }),
  keys: jest.fn().mockResolvedValue([]),
  match: jest.fn(),
};

global.fetch = jest.fn(() => Promise.reject(new Error('fail')));

// Load service worker after mocks are set
require('../public/sw.js');

afterEach(() => {
  jest.resetModules();
  Object.keys(events).forEach((k) => delete events[k]);
  put.mockClear();
  global.fetch.mockClear();
});

afterAll(() => {
  delete global.self;
  delete global.caches;
  delete global.fetch;
});

test('install resolves even when a resource fails to cache', async () => {
  const waitUntil = jest.fn((p) => p);
  await events.install({ waitUntil });
  await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
});
