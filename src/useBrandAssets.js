import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

const extractFileExtension = (url = '') => {
  if (!url) return '';
  const cleanUrl = url.split('?')[0] || url;
  const parts = cleanUrl.split('.');
  if (parts.length < 2) return '';
  return parts.pop()?.toUpperCase() || '';
};

const extractFileName = (url = '', fallback = '') => {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length) {
      return decodeURIComponent(segments.pop());
    }
  } catch (err) {
    // Ignore URL parsing errors and fall back to string operations
  }
  const stripped = url.split('?')[0] || url;
  const segments = stripped.split('/').filter(Boolean);
  if (segments.length) {
    return decodeURIComponent(segments.pop());
  }
  return fallback;
};

const buildSafeFileName = (base, extension) => {
  const safeBase = String(base || 'asset').replace(/[^a-z0-9-_]+/gi, '_');
  const safeExt = extension ? String(extension).replace(/^\./, '').toLowerCase() : '';
  return `${safeBase}${safeExt ? `.${safeExt}` : ''}`;
};

const buildLogoRecord = (entry, index) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const format = extractFileExtension(entry);
    const extension = (format || '').toLowerCase();
    const displayName = `Logo ${index + 1}`;
    const downloadFileName = buildSafeFileName(displayName.replace(/\.[^.]+$/, ''), extension);
    return {
      id: `logo-${index}`,
      url: entry,
      name: displayName,
      variant: '',
      format,
      downloadUrl: entry,
      description: '',
      displayName,
      downloadFileName,
    };
  }
  if (typeof entry === 'object') {
    const url = entry.url || entry.href || entry.downloadUrl || '';
    if (!url) return null;
    const name = entry.name || extractFileName(url, `Logo ${index + 1}`);
    const variant = entry.variant || entry.label || '';
    const format = (entry.format || extractFileExtension(url)).toUpperCase();
    const description = entry.description || entry.notes || '';
    const displayName = description || variant || `Logo ${index + 1}`;
    const downloadFileName = buildSafeFileName(
      displayName || name.replace(/\.[^.]+$/, ''),
      (format || '').toLowerCase(),
    );
    return {
      id: entry.id || `logo-${index}`,
      url,
      name,
      variant,
      format,
      downloadUrl: entry.downloadUrl || url,
      description,
      displayName,
      downloadFileName,
    };
  }
  return null;
};

const normalizeLogos = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => buildLogoRecord(entry, index))
    .filter((logo) => Boolean(logo?.url));
};

const buildColorRecord = (entry, index) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return {
      id: `color-${index}`,
      name: `Color ${index + 1}`,
      hex: entry.trim(),
      usage: '',
    };
  }
  if (typeof entry === 'object') {
    const hex = entry.hex || entry.value || entry.code || '';
    if (!hex) return null;
    return {
      id: entry.id || `color-${index}`,
      name: entry.name || `Color ${index + 1}`,
      hex: hex.trim(),
      usage: entry.usage || entry.description || entry.notes || '',
    };
  }
  return null;
};

const normalizeColors = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => buildColorRecord(entry, index))
    .filter((color) => Boolean(color?.hex));
};

const getPrimaryFamily = (family = '') => {
  if (!family) return '';
  return family
    .split(',')[0]
    .replace(/^['"]|['"]$/g, '')
    .trim();
};

const formatCssValue = (value, defaultUnit = '') => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return defaultUnit ? `${value}${defaultUnit}` : `${value}`;
  }
  const trimmed = `${value}`.trim();
  if (!trimmed) return '';
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    return defaultUnit ? `${trimmed}${defaultUnit}` : trimmed;
  }
  return trimmed;
};

const buildFontRecord = (entry, index) => {
  if (!entry || typeof entry !== 'object') return null;
  const type = entry.type || 'custom';
  const rawValue = entry.value || '';
  const name = (entry.name || rawValue || `Typeface ${index + 1}`).trim();
  const fallback = entry.fallback || (type === 'serif' ? 'serif' : 'sans-serif');
  const family = entry.family || entry.fontFamily || (name ? `'${name}', ${fallback}` : fallback);
  const cssSnippet = entry.cssSnippet || entry.css || `font-family: ${family};`;
  let downloadUrl = entry.downloadUrl || entry.fileUrl || '';
  if (!downloadUrl && type === 'custom') {
    downloadUrl = typeof rawValue === 'string' ? rawValue : '';
  }
  if (!downloadUrl && type === 'google' && rawValue) {
    const encoded = encodeURIComponent(rawValue.replace(/\s+/g, '+'));
    downloadUrl = `https://fonts.google.com/specimen/${encoded}`;
  }
  const importUrl = entry.importUrl || (type === 'google' && rawValue
    ? `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        rawValue.replace(/\s+/g, '+'),
      )}&display=swap');`
    : '');
  const format = extractFileExtension(downloadUrl || rawValue || '') || '';
  const displayName = entry.displayName || entry.label || entry.role || name;
  const downloadFileName = downloadUrl
    ? buildSafeFileName(displayName, format.toLowerCase())
    : buildSafeFileName(displayName, '');
  const usageSource =
    (Array.isArray(entry.usage) ? entry.usage[0] : null) || entry.usage || entry.preview || entry.styles || {};
  const previewFamily = usageSource.fontFamily || entry.previewFamily || '';
  const fontSizeValue = usageSource.fontSize || entry.fontSize || '';
  const lineHeightValue =
    usageSource.lineHeight || usageSource.leading || entry.lineHeight || entry.leading || '';
  const letterSpacingValue =
    usageSource.letterSpacing || usageSource.tracking || entry.letterSpacing || entry.tracking || entry.kerning || '';
  const fontWeightValue = usageSource.fontWeight || entry.fontWeight || '';
  const fontStyleValue = usageSource.fontStyle || entry.fontStyle || '';
  const textTransformValue = usageSource.textTransform || entry.textTransform || '';
  const textDecorationValue = usageSource.textDecoration || entry.textDecoration || '';
  const previewStyles = {};
  const previewMetrics = [];

  const resolvedFontSize = formatCssValue(fontSizeValue, 'px');
  const resolvedLineHeight = formatCssValue(lineHeightValue);
  const resolvedLetterSpacing = formatCssValue(letterSpacingValue, 'px');

  const applyStyle = (prop, value) => {
    if (value !== null && value !== undefined && value !== '') {
      previewStyles[prop] = value;
    }
  };

  applyStyle('fontFamily', previewFamily || family);
  applyStyle('fontSize', resolvedFontSize);
  applyStyle('lineHeight', resolvedLineHeight);
  applyStyle('letterSpacing', resolvedLetterSpacing);
  applyStyle('fontWeight', fontWeightValue);
  applyStyle('fontStyle', fontStyleValue);
  applyStyle('textTransform', textTransformValue);
  applyStyle('textDecoration', textDecorationValue);

  if (resolvedFontSize) {
    previewMetrics.push({ label: 'Size', value: resolvedFontSize });
  }
  if (resolvedLineHeight) {
    previewMetrics.push({ label: 'Line height', value: resolvedLineHeight });
  }
  if (resolvedLetterSpacing) {
    previewMetrics.push({ label: 'Kerning', value: resolvedLetterSpacing });
  }
  if (fontWeightValue) {
    previewMetrics.push({ label: 'Weight', value: `${fontWeightValue}` });
  }

  const stylesheetUrl =
    entry.stylesheetUrl ||
    (type === 'google' && rawValue
      ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
          rawValue.replace(/\s+/g, '+'),
        )}&display=swap`
      : '');

  return {
    id: entry.id || `font-${index}`,
    name,
    type,
    rawValue,
    cssSnippet,
    importSnippet: importUrl,
    downloadUrl,
    family,
    example: entry.previewText || entry.sample || 'The quick brown fox jumps over the lazy dog.',
    role: entry.role || '',
    rules: entry.rules || '',
    format,
    displayName,
    downloadFileName,
    previewStyles,
    previewMetrics,
    stylesheetUrl,
    primaryFamily: getPrimaryFamily(previewFamily || family),
  };
};

const normalizeFonts = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => buildFontRecord(entry, index))
    .filter((font) => Boolean(font?.name));
};

const normalizeProfileNotes = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry, index) => ({
      id: `profile-note-${index}`,
      title: '',
      body: entry.trim(),
      tags: [],
      createdAt: null,
      updatedAt: null,
    }));
};

export const useBrandAssets = (brandCode) => {
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!brandCode) {
      setBrand(null);
      return () => {
        isMounted = false;
      };
    }
    setLoading(true);
    const load = async () => {
      try {
        const q = query(
          collection(db, 'brands'),
          where('code', '==', brandCode),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!isMounted) return;
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setBrand({ id: docSnap.id, ...docSnap.data() });
        } else {
          setBrand(null);
        }
      } catch (err) {
        console.error('Failed to load brand assets', err);
        if (isMounted) {
          setBrand(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [brandCode]);

  const logos = useMemo(() => normalizeLogos(brand?.logos), [brand?.logos]);
  const colors = useMemo(() => normalizeColors(brand?.palette), [brand?.palette]);
  const fonts = useMemo(() => normalizeFonts(brand?.fonts), [brand?.fonts]);
  const profileNotes = useMemo(() => normalizeProfileNotes(brand?.notes), [brand?.notes]);
  const brandNotes = useMemo(
    () => (Array.isArray(brand?.brandNotes) ? brand.brandNotes : []),
    [brand?.brandNotes],
  );
  const guidelinesUrl = brand?.guidelinesUrl || '';
  const brandName = brand?.name || '';

  return {
    loading,
    brandId: brand?.id || '',
    brandName,
    guidelinesUrl,
    logos,
    colors,
    fonts,
    profileNotes,
    brandNotes,
    rawBrand: brand,
  };
};

export default useBrandAssets;
