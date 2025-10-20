import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

let patched = false;

function shouldIgnoreError(error) {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : String(error);
  if (!message) return false;
  if (message.includes("Cannot read properties of undefined (reading 'cloud')")) {
    return true;
  }
  if (message.includes('DocumentEventData') && message.includes('undefined')) {
    return true;
  }
  return false;
}

function suppressDecodeErrorLogs(logger, callback) {
  if (!logger || typeof logger.error !== 'function') {
    return callback();
  }

  const targetedMessages = new Set([
    'Failed to decode protobuf and create a snapshot.',
    'Failed to decode protobuf and create a before snapshot.',
  ]);

  const originalLoggerError = logger.error;

  logger.error = function patchedLoggerError(...args) {
    const [message] = args;
    if (typeof message === 'string' && targetedMessages.has(message)) {
      return;
    }
    return originalLoggerError.apply(this, args);
  };

  try {
    return callback();
  } finally {
    logger.error = originalLoggerError;
  }
}

export function patchFirestoreProtobufDecoding() {
  if (patched) {
    return;
  }

  try {
    const firebaseFunctionsEntryPath = require.resolve('firebase-functions');
    const firebaseFunctionsDir = path.dirname(firebaseFunctionsEntryPath);
    const firestoreCommonPath = path.join(
      firebaseFunctionsDir,
      '..',
      'common',
      'providers',
      'firestore.js',
    );
    const loggerPath = path.join(firebaseFunctionsDir, 'logger', 'index.js');

    const firestoreCommon = require(firestoreCommonPath);

    if (!firestoreCommon) {
      patched = true;
      return;
    }

    if (firestoreCommon.__campfirePatched) {
      patched = true;
      return;
    }

    let firebaseLogger = null;
    try {
      firebaseLogger = require(loggerPath);
    } catch (loggerErr) {
      console.warn('Unable to load Firebase logger for decode suppression', {
        error: loggerErr?.message || String(loggerErr),
      });
    }

    const originalCreateSnapshot = firestoreCommon.createSnapshotFromProtobuf;
    const originalCreateBeforeSnapshot = firestoreCommon.createBeforeSnapshotFromProtobuf;

    if (typeof originalCreateSnapshot !== 'function') {
      firestoreCommon.__campfirePatched = true;
      patched = true;
      return;
    }

    const decodeFailures = new Set();

    firestoreCommon.createSnapshotFromProtobuf = function patchedCreateSnapshotFromProtobuf(
      data,
      path,
      databaseId,
    ) {
      try {
        return suppressDecodeErrorLogs(firebaseLogger, () =>
          originalCreateSnapshot.call(this, data, path, databaseId),
        );
      } catch (err) {
        if (shouldIgnoreError(err)) {
          const key = `create:${path}`;
          if (!decodeFailures.has(key)) {
            decodeFailures.add(key);
            console.warn('Ignoring invalid Firestore protobuf payload for create event', {
              path,
              databaseId,
              error: err?.message || String(err),
            });
          }
          return null;
        }
        throw err;
      }
    };

    if (typeof originalCreateBeforeSnapshot === 'function') {
      firestoreCommon.createBeforeSnapshotFromProtobuf = function patchedCreateBeforeSnapshotFromProtobuf(
        data,
        path,
        databaseId,
      ) {
        try {
          return suppressDecodeErrorLogs(firebaseLogger, () =>
            originalCreateBeforeSnapshot.call(this, data, path, databaseId),
          );
        } catch (err) {
          if (shouldIgnoreError(err)) {
            const key = `before:${path}`;
            if (!decodeFailures.has(key)) {
              decodeFailures.add(key);
              console.warn('Ignoring invalid Firestore protobuf payload for before snapshot', {
                path,
                databaseId,
                error: err?.message || String(err),
              });
            }
            return null;
          }
          throw err;
        }
      };
    }

    firestoreCommon.__campfirePatched = true;
    patched = true;
  } catch (err) {
    console.error('Failed to patch Firestore protobuf decoding', err);
    patched = true;
  }
}

patchFirestoreProtobufDecoding();
