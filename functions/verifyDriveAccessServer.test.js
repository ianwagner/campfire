/**
 * @jest-environment node
 */

const http = require('http');

jest.mock('./verifyDriveAccess.js', () => {
  const run = jest.fn();
  return {
    __esModule: true,
    verifyDriveAccess: { run },
    __mockRun: run,
  };
});

async function loadServer() {
  jest.resetModules();
  process.env.PORT = '0';
  const module = await import('./verifyDriveAccessServer.js');
  const { server } = module;
  await new Promise((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', resolve);
    }
  });
  return module;
}

async function closeServer(server) {
  await new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(resolve);
  });
  delete process.env.PORT;
}

function postJson(server, path, payload) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        port,
        host: '127.0.0.1',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const body = buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

describe('verifyDriveAccessServer', () => {
  let serverModule;
  let verifyRun;

  beforeEach(async () => {
    serverModule = await loadServer();
    ({ verifyDriveAccess: { run: verifyRun } } = await import('./verifyDriveAccess.js'));
    verifyRun.mockReset();
  });

  afterEach(async () => {
    await closeServer(serverModule?.server);
  });

  test('returns success payload from verifyDriveAccess', async () => {
    verifyRun.mockResolvedValue({ success: true });
    const response = await postJson(serverModule.server, '/verify', { url: 'https://example.com' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(verifyRun).toHaveBeenCalledWith({ data: { url: 'https://example.com' } });
  });

  test('maps HttpsError codes to HTTP status', async () => {
    const error = new Error('Access denied');
    error.code = 'permission-denied';
    verifyRun.mockRejectedValue(error);
    const response = await postJson(serverModule.server, '/', { url: 'https://example.com/private' });
    expect(response.status).toBe(403);
    expect(response.body.error).toEqual({ code: 'permission-denied', message: 'Access denied' });
  });

  test('returns 400 when payload cannot be parsed', async () => {
    const { port } = serverModule.server.address();
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        { port, host: '127.0.0.1', path: '/', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        }
      );
      req.on('error', reject);
      req.write('not-json');
      req.end();
    });
    expect(status).toBe(400);
    expect(verifyRun).not.toHaveBeenCalled();
  });
});
