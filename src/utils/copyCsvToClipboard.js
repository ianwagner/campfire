const copyCsvToClipboard = async (csv) => {
  if (!csv) return false;

  const hasNavigator = typeof navigator !== 'undefined';

  if (hasNavigator) {
    try {
      if (
        navigator.clipboard?.write &&
        typeof ClipboardItem !== 'undefined'
      ) {
        const csvBlob = new Blob([csv], { type: 'text/csv' });
        const plainBlob = new Blob([csv], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/csv': csvBlob,
          'text/plain': plainBlob,
        });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (err) {
      console.error('Failed to copy CSV via ClipboardItem', err);
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
        return true;
      }
    } catch (err) {
      console.error('Failed to write CSV text to clipboard', err);
    }
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = csv;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.error('Failed to copy CSV using fallback textarea', err);
  }

  return false;
};

export default copyCsvToClipboard;

