import { useEffect } from 'react';

/**
 * Warn when navigating away with unsaved changes.
 * Returns a function that can be called to check before routing changes.
 */
function useUnsavedChanges(unsaved, onSave) {
  useEffect(() => {
    const handler = (e) => {
      if (!unsaved) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved]);

  return () => {
    if (!unsaved) return true;
    const proceed = window.confirm('You have unsaved changes. Save before leaving?');
    if (proceed && onSave) onSave();
    return proceed;
  };
}

export default useUnsavedChanges;
