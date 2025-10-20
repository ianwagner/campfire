import http from 'http';
import { URL } from 'url';
import { verifyDriveAccess } from './verifyDriveAccess.js';

const PORT = Number.parseInt(process.env.PORT, 10) || 8080;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;
    req.on('data', (chunk) => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const buffer = Buffer.concat(chunks);
      try {
        const parsed = JSON.parse(buffer.toString('utf8'));
        resolve(parsed);
      } catch (err) {
        const error = new Error('Invalid JSON payload');
        error.code = 'invalid-argument';
        reject(error);
      }
    });
    req.on('error', (err) => reject(err));
  });
}

const errorStatusMap = {
  'ok': 200,
  'cancelled': 499,
  'unknown': 500,
  'invalid-argument': 400,
  'deadline-exceeded': 504,
  'not-found': 404,
  'already-exists': 409,
  'permission-denied': 403,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  'aborted': 409,
  'out-of-range': 400,
  'unimplemented': 501,
  'internal': 500,
  'unavailable': 503,
  'data-loss': 500,
  'unauthenticated': 401,
};

function getStatusFromError(err) {
  if (typeof err?.httpStatusCode === 'number') {
    return err.httpStatusCode;
  }
  const code = typeof err?.code === 'string' ? err.code : 'internal';
  return errorStatusMap[code] || 500;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (method !== 'POST' || (url.pathname !== '/' && url.pathname !== '/verify')) {
    sendJson(res, 404, { error: { message: 'Not Found' } });
    return;
  }

  let payload;
  try {
    payload = await parseBody(req);
  } catch (err) {
    const status = getStatusFromError(err);
    sendJson(res, status, {
      error: {
        message: err.message || 'Invalid request payload',
        code: err.code || 'invalid-argument',
      },
    });
    return;
  }

  try {
    const result = await verifyDriveAccess.run({ data: payload });
    sendJson(res, 200, result || {});
  } catch (err) {
    console.error('verifyDriveAccess invocation failed', err);
    const status = getStatusFromError(err);
    sendJson(res, status, {
      error: {
        message: err.message || 'Internal server error',
        code: err.code || 'internal',
      },
    });
  }
});

server.listen(PORT, () => {
  console.log(`verifyDriveAccess server listening on port ${PORT}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { server };
export default server;
