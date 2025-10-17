import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FiCopy, FiDownload, FiFilter, FiPlus, FiSearch } from 'react-icons/fi';
import OptimizedImage from './components/OptimizedImage.jsx';
import { useBrandAssets } from './useBrandAssets.js';

const SECTION_ORDER = ['logos', 'colors', 'typography', 'guidelines', 'notes'];

const stripHtml = (value = '') =>
  value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
};

const normalizeBrandNotes = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      if (!item) return null;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const rawBody = item.body || item.text || item.note || '';
      const body = typeof rawBody === 'string' ? rawBody : '';
      const tags = Array.isArray(item.tags)
        ? item.tags
            .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
            .filter(Boolean)
        : [];
      const createdAt = normalizeTimestamp(item.createdAt);
      const updatedAt = normalizeTimestamp(item.updatedAt);
      const plainText = stripHtml(body || title);
      if (!plainText) return null;
      return {
        id: item.id || `note-${index}`,
        title,
        body,
        plainText,
        tags,
        createdAt,
        updatedAt,
      };
    })
    .filter(Boolean);
};

const addNoteIfUnique = (collection, seen, note) => {
  if (!note) return;
  const key = note.id || `${note.title}-${note.plainText}`;
  if (seen.has(key)) return;
  seen.set(key, true);
  collection.push(note);
};

const buildFileName = (base, extension) => {
  const safeBase = (base || 'asset').replace(/[^a-z0-9-_]+/gi, '_');
  const safeExt = extension ? extension.toLowerCase() : '';
  return `${safeBase}${safeExt ? `.${safeExt}` : ''}`;
};

const copyToClipboard = async (value = '') => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (err) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (fallbackErr) {
      console.error('Failed to copy to clipboard', fallbackErr);
      return false;
    }
  }
};

const loadedGoogleFonts = new Set();
const loadedCustomFonts = new Set();

const BrandAssetsLayout = ({
  brandCode,
  guidelinesUrl = '',
  brandNotes = [],
  height = 'auto',
  onCreateNote,
}) => {
  const {
    loading,
    guidelinesUrl: brandGuidelinesUrl,
    logos,
    colors,
    fonts,
    profileNotes,
    brandNotes: storedBrandNotes,
  } = useBrandAssets(brandCode);

  const resolvedGuidelinesUrl = guidelinesUrl || brandGuidelinesUrl;

  const internalNotes = useMemo(
    () =>
      profileNotes.map((note) => ({
        ...note,
        plainText: stripHtml(note.body),
      })),
    [profileNotes],
  );

  const firestoreNotes = useMemo(() => normalizeBrandNotes(brandNotes), [brandNotes]);
  const brandProfileNotes = useMemo(
    () => normalizeBrandNotes(storedBrandNotes),
    [storedBrandNotes],
  );

  const combinedNotes = useMemo(() => {
    const seen = new Map();
    const merged = [];
    firestoreNotes.forEach((note) => addNoteIfUnique(merged, seen, note));
    brandProfileNotes.forEach((note) => addNoteIfUnique(merged, seen, note));
    internalNotes.forEach((note) => addNoteIfUnique(merged, seen, note));
    return merged;
  }, [brandProfileNotes, firestoreNotes, internalNotes]);

  const noteTags = useMemo(() => {
    const tagSet = new Set();
    combinedNotes.forEach((note) => {
      note.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [combinedNotes]);

  const [activeSection, setActiveSection] = useState('logos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [copiedColorId, setCopiedColorId] = useState('');

  const contentRef = useRef(null);
  const sectionRefs = useRef({});
  const colorCopyTimeout = useRef(null);

  const resolvedHeight = useMemo(() => {
    if (!height || height === 'auto') return undefined;
    return typeof height === 'number' ? `${height}px` : height;
  }, [height]);

  useEffect(
    () => () => {
      if (colorCopyTimeout.current) clearTimeout(colorCopyTimeout.current);
    },
    [],
  );

  const registerSection = useCallback(
    (id) => (node) => {
      if (node) {
        sectionRefs.current[id] = node;
      }
    },
    [],
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              SECTION_ORDER.indexOf(a.target.id) - SECTION_ORDER.indexOf(b.target.id),
          );
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { root, threshold: 0.35 },
    );

    const nodes = SECTION_ORDER.map((id) => sectionRefs.current[id]).filter(Boolean);
    nodes.forEach((node) => observer.observe(node));

    return () => {
      nodes.forEach((node) => observer.unobserve(node));
      observer.disconnect();
    };
  }, [logos.length, colors.length, fonts.length, combinedNotes.length, resolvedGuidelinesUrl]);

  const handleNavClick = (id) => {
    const section = sectionRefs.current[id];
    if (section && typeof section.scrollIntoView === 'function') {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveSection(id);
  };

  const handleCopyHex = async (color) => {
    const success = await copyToClipboard(color.hex);
    if (!success) return;
    if (colorCopyTimeout.current) clearTimeout(colorCopyTimeout.current);
    setCopiedColorId(color.id);
    colorCopyTimeout.current = setTimeout(() => setCopiedColorId(''), 2000);
  };

  const triggerDownload = (url, filename) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = filename;
    }
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadLogo = (logo) => {
    const filename =
      logo.downloadFileName ||
      buildFileName(logo.description || logo.variant || logo.displayName || logo.name, logo.format);
    triggerDownload(logo.downloadUrl || logo.url, filename);
  };

  const handleDownloadAllLogos = () => {
    logos.forEach((logo) => handleDownloadLogo(logo));
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    fonts.forEach((font) => {
      if (font.stylesheetUrl) {
        if (!loadedGoogleFonts.has(font.stylesheetUrl)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = font.stylesheetUrl;
          link.dataset.brandFont = font.id;
          document.head.appendChild(link);
          loadedGoogleFonts.add(font.stylesheetUrl);
        }
      } else if (font.type === 'custom' && font.downloadUrl && font.primaryFamily) {
        if (!loadedCustomFonts.has(font.primaryFamily) && 'fonts' in document && typeof FontFace !== 'undefined') {
          try {
            const fontFace = new FontFace(font.primaryFamily, `url(${font.downloadUrl})`, {
              weight: font.previewStyles.fontWeight || 'normal',
              style: font.previewStyles.fontStyle || 'normal',
              display: 'swap',
            });
            fontFace
              .load()
              .then((loadedFace) => {
                document.fonts.add(loadedFace);
                loadedCustomFonts.add(font.primaryFamily);
              })
              .catch((err) => {
                console.error('Failed to load custom font', err);
              });
          } catch (err) {
            console.error('Failed to instantiate custom font', err);
          }
        }
      }
    });
    return undefined;
  }, [fonts]);

  const filteredNotes = useMemo(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    return combinedNotes.filter((note) => {
      const matchesSearch = trimmedSearch
        ? `${note.title} ${note.plainText}`.toLowerCase().includes(trimmedSearch)
        : true;
      const matchesTag =
        selectedTag === 'all' || note.tags.some((tag) => tag === selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [combinedNotes, searchTerm, selectedTag]);

  const contentClasses = [
    'gm-brand-assets__content flex-1 space-y-6 px-4 py-6 scroll-smooth lg:px-8',
  ];
  if (resolvedHeight) {
    contentClasses.push('overflow-y-auto');
  } else {
    contentClasses.push('overflow-visible');
  }

  return (
    <div className="gm-brand-assets flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div className="flex flex-col lg:flex-row">
        <nav className="gm-brand-assets__nav border-b border-gray-200 bg-white dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] lg:min-w-[14rem] lg:border-b-0 lg:border-r lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="flex overflow-x-auto px-4 py-3 text-sm font-medium text-gray-600 lg:flex-col lg:gap-1 lg:overflow-visible">
            {SECTION_ORDER.map((sectionId) => {
              const label =
                sectionId === 'logos'
                  ? 'Logos'
                  : sectionId === 'colors'
                  ? 'Colors'
                  : sectionId === 'typography'
                  ? 'Typography'
                  : sectionId === 'guidelines'
                  ? 'Guidelines'
                  : 'Notes';
              const isActive = activeSection === sectionId;
              return (
                <button
                  key={sectionId}
                  type="button"
                  onClick={() => handleNavClick(sectionId)}
                  className={`gm-brand-assets__nav-link mr-2 flex-shrink-0 rounded-full px-4 py-2 transition-colors last:mr-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] lg:mr-0 ${
                    isActive
                      ? 'bg-[var(--accent-color)] text-white shadow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
        <div
          ref={contentRef}
          className={contentClasses.join(' ')}
          style={resolvedHeight ? { maxHeight: resolvedHeight } : undefined}
        >
          <header className="gm-brand-assets__intro space-y-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Brand Assets</h2>
            <p className="text-sm text-gray-500 dark:text-gray-300">
              A modular reference hub with the latest logos, colors, typography, and notes for this brand.
            </p>
          </header>

          <section
            id="logos"
            ref={registerSection('logos')}
            className="gm-brand-assets__section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
          >
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Logos</h3>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  Preview logo variants and download the exact files designers need.
                </p>
              </div>
              {logos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadAllLogos}
                    className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <FiDownload size={16} />
                    Download All
                  </button>
                </div>
              ) : null}
            </div>
            {logos.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {logos.map((logo) => (
                  <article
                    key={logo.id}
                    className="gm-brand-assets__logo-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 transition-shadow hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                  >
                    <div className="flex items-center justify-center rounded-lg bg-white p-4 dark:bg-[var(--dark-sidebar-hover)]">
                      <OptimizedImage pngUrl={logo.url} alt={logo.description || logo.name || 'Logo'} className="max-h-20 w-auto" />
                    </div>
                    <div className="flex flex-col gap-1">
                      {(logo.description || logo.variant || logo.displayName || logo.name) && (
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                          {logo.description || logo.variant || logo.displayName || logo.name}
                        </p>
                      )}
                      {logo.description && logo.variant ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">{logo.variant}</p>
                      ) : null}
                      {logo.format ? (
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{logo.format}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadLogo(logo)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-color)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-95"
                    >
                      <FiDownload size={16} />
                      Download
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                No logo files have been added yet.
              </p>
            )}
          </section>

          <section
            id="colors"
            ref={registerSection('colors')}
            className="gm-brand-assets__section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Colors</h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                Grab official HEX values and usage notes for the brand palette.
              </p>
            </div>
            {colors.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {colors.map((color) => (
                  <article
                    key={color.id}
                    className="gm-brand-assets__color-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 transition-shadow hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="h-14 w-14 flex-shrink-0 rounded-lg border border-gray-200 shadow-inner dark:border-[var(--border-color-default)]"
                        style={{ backgroundColor: color.hex }}
                      />
                      <div className="flex flex-col">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{color.name}</h4>
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{color.hex}</span>
                      </div>
                    </div>
                    {color.usage ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{color.usage}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleCopyHex(color)}
                      className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                    >
                      <FiCopy size={14} />
                      {copiedColorId === color.id ? 'Copied!' : 'Copy HEX'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                No brand colors are defined yet.
              </p>
            )}
          </section>

          <section
            id="typography"
            ref={registerSection('typography')}
            className="gm-brand-assets__section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Typography</h3>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  Review the brand type system with real usage guidance.
                </p>
              </div>
            {fonts.length > 0 ? (
              <div className="flex flex-col gap-4">
                {fonts.map((font) => (
                  <article
                    key={font.id}
                    className="gm-brand-assets__type-card flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-5 transition-shadow hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-2">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{font.displayName || font.name}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-100">
                              {font.type === 'google' ? 'Google Font' : 'Custom Font'}
                            </span>
                            {font.role ? (
                              <span className="rounded-full bg-[var(--accent-color-10)] px-2 py-0.5 font-medium uppercase tracking-wide text-[var(--accent-color)] dark:bg-[var(--accent-color-20)] dark:text-[var(--accent-color)]">
                                {font.role}
                              </span>
                            ) : null}
                            {font.type === 'google' && font.rawValue && !/^https?:/i.test(font.rawValue) ? (
                              <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{font.rawValue}</span>
                            ) : null}
                            {font.format ? (
                              <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{font.format}</span>
                            ) : null}
                          </div>
                        </div>
                        {font.rules ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{font.rules}</p>
                        ) : null}
                        {font.previewMetrics.length > 0 ? (
                          <dl className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                            {font.previewMetrics.map((metric) => (
                              <div key={`${font.id}-${metric.label}`} className="flex flex-col rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-[var(--dark-sidebar-hover)]">
                                <dt className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{metric.label}</dt>
                                <dd className="font-medium text-gray-700 dark:text-gray-200">{metric.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                      {font.downloadUrl ? (
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={font.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={font.downloadFileName || undefined}
                            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-color)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-95"
                          >
                            <FiDownload size={14} />
                            Download Font
                          </a>
                        </div>
                      ) : null}
                    </div>
                    <p
                      className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow-inner dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-100"
                      style={{
                        fontFamily: font.previewStyles.fontFamily || font.family,
                        ...(font.previewStyles.fontWeight ? { fontWeight: font.previewStyles.fontWeight } : {}),
                        ...(font.previewStyles.fontStyle ? { fontStyle: font.previewStyles.fontStyle } : {}),
                        ...(font.previewStyles.fontSize ? { fontSize: font.previewStyles.fontSize } : {}),
                        ...(font.previewStyles.lineHeight ? { lineHeight: font.previewStyles.lineHeight } : {}),
                        ...(font.previewStyles.letterSpacing ? { letterSpacing: font.previewStyles.letterSpacing } : {}),
                        ...(font.previewStyles.textTransform ? { textTransform: font.previewStyles.textTransform } : {}),
                        ...(font.previewStyles.textDecoration ? { textDecoration: font.previewStyles.textDecoration } : {}),
                      }}
                    >
                      {font.example}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                No typefaces are configured for this brand.
              </p>
            )}
          </section>

          <section
            id="guidelines"
            ref={registerSection('guidelines')}
            className="gm-brand-assets__section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
          >
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Guidelines</h3>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  Keep the latest brand manuals accessible to everyone on the team.
                </p>
              </div>
              {resolvedGuidelinesUrl ? (
                <a
                  href={resolvedGuidelinesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <FiDownload size={16} />
                  Open Full PDF
                </a>
              ) : null}
            </div>
            {resolvedGuidelinesUrl ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-inner dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                <iframe
                  title="Brand Guidelines"
                  src={resolvedGuidelinesUrl}
                  className="h-[36rem] w-full border-0"
                  loading="lazy"
                />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                No guideline document has been linked yet.
              </p>
            )}
          </section>

          <section
            id="notes"
            ref={registerSection('notes')}
            className="gm-brand-assets__section rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
          >
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notes</h3>
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  Search and filter client notes to align your creative work quickly.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search notes..."
                    className="w-full rounded-full border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                  />
                </div>
                <div className="relative w-full sm:w-48">
                  <FiFilter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={selectedTag}
                    onChange={(event) => setSelectedTag(event.target.value)}
                    className="w-full appearance-none rounded-full border border-gray-300 bg-white py-2 pl-10 pr-8 text-sm text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                  >
                    <option value="all">All tags</option>
                    {noteTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    ▾
                  </span>
                </div>
                {onCreateNote ? (
                  <button
                    type="button"
                    onClick={onCreateNote}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-color)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-95"
                  >
                    <FiPlus size={16} />
                    New Note
                  </button>
                ) : null}
              </div>
            </div>
            {combinedNotes.length > 0 ? (
              filteredNotes.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {filteredNotes.map((note) => {
                    const timestamp = note.updatedAt || note.createdAt;
                    const timestampLabel = note.updatedAt
                      ? 'Updated'
                      : note.createdAt
                      ? 'Created'
                      : '';
                    return (
                      <article
                        key={note.id}
                        className="gm-brand-assets__note-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 transition-shadow hover:shadow-md dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                      >
                        {note.title ? (
                          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">{note.title}</h4>
                        ) : null}
                        <div
                          className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200 dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: note.body || note.plainText }}
                        />
                        {note.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {note.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {timestamp ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {timestampLabel} {timestamp.toLocaleString()}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                  No notes match your filters yet.
                </p>
              )
            ) : loading ? (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                Loading notes...
              </p>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:text-gray-300">
                No brand notes have been added yet.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default BrandAssetsLayout;
