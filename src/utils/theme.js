export const hexToRgba = (hex, alpha = 1) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const applyAccentColor = (color) => {
  document.documentElement.style.setProperty('--accent-color', color);
  document.documentElement.style.setProperty(
    '--accent-color-10',
    hexToRgba(color, 0.1)
  );
};

