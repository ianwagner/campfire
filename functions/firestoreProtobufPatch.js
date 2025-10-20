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

    const firestoreCommon = require(firestoreCommonPath);

    if (!firestoreCommon) {
      patched = true;
      return;
    }

    if (firestoreCommon.__campfirePatched) {
      patched = true;
      return;
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
        return originalCreateSnapshot.call(this, data, path, databaseId);
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
          return originalCreateBeforeSnapshot.call(this, data, path, databaseId);
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
