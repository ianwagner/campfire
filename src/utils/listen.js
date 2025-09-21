import { onSnapshot } from 'firebase/firestore';

const describeListenTarget = (target) => {
  if (!target) return 'unknown';
  if (typeof target === 'string') return target;
  if (typeof target.path === 'string') return target.path;
  const delegate = target._delegate || target._original || target._ref;
  if (delegate) {
    const described = describeListenTarget(delegate);
    if (described !== 'unknown') return described;
  }
  const pathSegments =
    target._path?.segments ||
    target._query?.path?.segments ||
    target._query?.collectionGroup ||
    null;

  if (Array.isArray(pathSegments) && pathSegments.length > 0) {
    return pathSegments.join('/');
  }

  if (typeof target._query?.collectionGroup === 'string') {
    return `collectionGroup(${target._query.collectionGroup})`;
  }

  if (typeof target.toString === 'function') {
    try {
      return target.toString();
    } catch (err) {
      /* ignore */
    }
  }

  return 'unknown';
};

const createErrorHandler = (path, onError) => (err) => {
  if (err) {
    const prefix = err.code === 'permission-denied' ? 'Firestore listen denied' : 'Firestore listen error';
    console.error(`${prefix} at ${path}`, err);
  }
  if (onError) onError(err);
};

const listen = (ref, ...args) => {
  if (!ref) {
    throw new Error('listen() requires a valid Firestore reference or query.');
  }

  if (args.length === 0) {
    throw new Error('listen() requires at least one callback.');
  }

  const path = describeListenTarget(ref);

  if (typeof args[0] === 'function') {
    const [onNext, onError, onCompletion] = args;
    return onSnapshot(ref, onNext, createErrorHandler(path, onError), onCompletion);
  }

  const [options, onNext, onError, onCompletion] = args;
  return onSnapshot(ref, options, onNext, createErrorHandler(path, onError), onCompletion);
};

export default listen;
