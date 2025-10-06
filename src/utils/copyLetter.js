export const getCopyLetter = (index) => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index == null || Number.isNaN(index)) {
    return '';
  }
  let value = Number(index);
  if (value < 0) {
    return '';
  }
  let result = '';
  do {
    result = letters[value % letters.length] + result;
    value = Math.floor(value / letters.length) - 1;
  } while (value >= 0);
  return result;
};

export default getCopyLetter;
