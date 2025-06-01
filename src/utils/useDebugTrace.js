import { useEffect, useRef } from 'react';
import debugLog from './debugLog';

export default function useDebugTrace(label, values) {
  const mounted = useRef(false);
  const prev = useRef(values);

  // Log mount and unmount
  useEffect(() => {
    debugLog(`${label} mounted`, values);
    mounted.current = true;
    return () => {
      debugLog(`${label} unmounted`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log updates whenever values change
  useEffect(() => {
    if (!mounted.current) return;
    const changed = {};
    Object.keys(values).forEach((key) => {
      if (prev.current[key] !== values[key]) {
        changed[key] = { previous: prev.current[key], current: values[key] };
      }
    });
    if (Object.keys(changed).length > 0) {
      debugLog(`${label} updated`, changed);
    }
    prev.current = values;
  });
}
