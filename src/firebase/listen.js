import { onSnapshot } from 'firebase/firestore';

const getPathFromTarget = (target) => {
  if (!target) return 'unknown';
  if (typeof target.path === 'string') return target.path;
  const delegate = target._delegate || target;
  const query = delegate._query || delegate._path;
  if (query) {
    const pathObj = query.path || query._path || query;
    if (pathObj) {
      if (typeof pathObj.canonicalString === 'function') {
        try {
          return pathObj.canonicalString();
        } catch (err) {
          /* ignore */
        }
      }
      if (Array.isArray(pathObj.segments)) {
        return pathObj.segments.join('/');
      }
    }
    if (typeof query.collectionGroup === 'string') {
      const suffix = pathObj && Array.isArray(pathObj.segments)
        ? `/${pathObj.segments.join('/')}`
        : '';
      return `collectionGroup(${query.collectionGroup})${suffix}`;
    }
  }
  if (typeof delegate.toString === 'function') {
    try {
      return delegate.toString();
    } catch (err) {
      /* ignore */
    }
  }
  return 'unknown';
};

const wrapError = (path, errorHandler) => (err) => {
  if (err) {
    const logger = err.code === 'permission-denied' ? console.warn : console.error;
    logger(`[listen] Firestore listener error at ${path}`, err);
  }
  if (typeof errorHandler === 'function') {
    errorHandler(err);
  }
};

const normalizeArgs = (path, observerOrNext, error, completion) => {
  if (typeof observerOrNext === 'function') {
    const wrappedError = wrapError(path, error);
    return [observerOrNext, wrappedError, completion];
  }
  if (observerOrNext && typeof observerOrNext === 'object') {
    const observer = { ...observerOrNext };
    observer.error = wrapError(path, observerOrNext.error);
    return [observer];
  }
  return [wrapError(path, observerOrNext)];
};

const listen = (target, observerOrNext, error, completion) => {
  const path = getPathFromTarget(target);
  const args = normalizeArgs(path, observerOrNext, error, completion);
  return onSnapshot(target, ...args);
};

export default listen;
