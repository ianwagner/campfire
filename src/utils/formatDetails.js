export default function formatDetails(text = '') {
  const escape = (str) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Match URLs for auto-linking
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const lines = text.split(/\r?\n/);
  let html = '';
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^\s*[-*\u2022]\s+/.test(line)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      const content = line.replace(/^\s*[-*\u2022]\s+/, '');
      const escaped = escape(content).replace(
        urlRegex,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="break-all">$1</a>'
      );
      html += `<li>${escaped}</li>`;
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      const escaped = escape(line).replace(
        urlRegex,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="break-all">$1</a>'
      );
      html += `<p>${escaped}</p>`;
    }
  }
  closeList();
  return html;
}
