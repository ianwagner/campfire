export default function diffWords(oldStr = '', newStr = '') {
  const oldWords = oldStr.split(/\s+/).filter(Boolean);
  const newWords = newStr.split(/\s+/).filter(Boolean);
  const m = oldWords.length;
  const n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        oldWords[i - 1] === newWords[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const parts = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ type: 'same', text: oldWords[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      parts.unshift({ type: 'removed', text: oldWords[i - 1] });
      i -= 1;
    } else {
      parts.unshift({ type: 'added', text: newWords[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    parts.unshift({ type: 'removed', text: oldWords[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    parts.unshift({ type: 'added', text: newWords[j - 1] });
    j -= 1;
  }
  return parts;
}
