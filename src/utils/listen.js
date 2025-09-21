import { onSnapshot } from 'firebase/firestore';

const describeTarget = (target) => {
  if (!target) return 'unknown target';
  if (typeof target.path === 'string') return target.path;
  if (target._key?.path?.canonicalString) {
    return target._key.path.canonicalString;
  }
  if (target._query?.path?.canonicalString) {
    return target._query.path.canonicalString;
  }
  if (Array.isArray(target._query?.path?.segments)) {
    return target._query.path.segments.join('/');
  }
  if (typeof target.toString === 'function') {
    return target.toString();
  }
  return 'unidentified Firestore target';
};

const logError = (targetPath, err) => {
  if (!err) return;
  if (err.code === 'permission-denied') {
    console.warn(`Firestore listen denied for ${targetPath}`, err);
  } else {
    console.error(`Firestore listen error for ${targetPath}`, err);
  }
};

const listen = (target, onNext, onError, onCompletion) => {
  const targetPath = describeTarget(target);
  const wrappedError = (err) => {
    logError(targetPath, err);
    if (typeof onError === 'function') {
      onError(err);
    }
  };

  if (typeof onNext === 'object' && onNext !== null) {
    const observer = onNext;
    const wrappedObserver = {
      ...observer,
      error: (err) => {
        logError(targetPath, err);
        if (typeof observer.error === 'function') {
          observer.error(err);
        }
      },
    };
    return onSnapshot(target, wrappedObserver);
  }

  return onSnapshot(target, onNext, wrappedError, onCompletion);
};

export default listen;
