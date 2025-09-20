const chunkArray = (arr = [], size = 1) => {
  if (size <= 0) return [arr.slice()];
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export default chunkArray;
