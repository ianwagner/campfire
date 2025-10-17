import React, { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase/config";
import OptimizedImage from "./components/OptimizedImage.jsx";
import Modal from "./components/Modal.jsx";
import CloseButton from "./components/CloseButton.jsx";
import {
  resourcePanelBodyClass,
  resourcePanelClass,
  resourcePanelHeaderClass,
  resourceSectionSubtitleClass,
  resourceSectionTitleClass,
} from "./components/common/resourcePanelStyles.js";

const BrandAssets = ({
  brandCode,
  onClose,
  inline = false,
  hideGuidelines = false,
  hideNotes = false,
  height = "auto",
  inlineClassName = "",
}) => {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!brandCode) return;
      try {
        const q = query(collection(db, "brands"), where("code", "==", brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setBrand({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        console.error("Failed to load brand", err);
      }
    };
    load();
  }, [brandCode]);

  const resolvedHeight = useMemo(() => {
    if (typeof height === "number") {
      return `${height}px`;
    }
    return height;
  }, [height]);

  const logos = useMemo(() => {
    if (!Array.isArray(brand?.logos)) return [];
    return brand.logos.filter((url) => typeof url === "string" && url.trim());
  }, [brand]);

  const palette = useMemo(() => {
    if (!Array.isArray(brand?.palette)) return [];
    return brand.palette.filter((color) => typeof color === "string" && color.trim());
  }, [brand]);

  const fonts = useMemo(() => {
    if (!Array.isArray(brand?.fonts)) return [];
    return brand.fonts.filter((font) => {
      if (!font || typeof font !== "object") return false;
      return typeof font.value === "string" && font.value.trim();
    });
  }, [brand]);

  const notes = useMemo(() => {
    if (hideNotes || !Array.isArray(brand?.notes)) return [];
    return brand.notes
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry, index) => ({ id: index, text: entry.trim() }));
  }, [brand, hideNotes]);

  if (!brand) return null;

  const guidelinesUrl = !hideGuidelines && typeof brand.guidelinesUrl === "string"
    ? brand.guidelinesUrl
    : "";

  const hasLogos = logos.length > 0;
  const hasPalette = palette.length > 0;
  const hasFonts = fonts.length > 0;
  const hasNotes = notes.length > 0;
  const hasGuidelines = Boolean(guidelinesUrl);
  const hasAnyContent = hasLogos || hasPalette || hasFonts || hasNotes || hasGuidelines;

  const header = (
    <div className={resourcePanelHeaderClass}>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand assets</h3>
        <p className={resourceSectionSubtitleClass}>
          Reference the latest logos, colors, and typefaces from the brand profile.
        </p>
      </div>
      {onClose && !inline ? <CloseButton onClick={onClose} /> : null}
    </div>
  );

  const sections = [];

  if (hasLogos) {
    sections.push(
      <section key="logos" className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className={resourceSectionTitleClass}>Logos</h4>
          <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {logos.length} {logos.length === 1 ? "file" : "files"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {logos.map((url, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
            >
              <OptimizedImage pngUrl={url} alt="logo" className="max-h-16 w-auto" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (hasPalette) {
    sections.push(
      <section key="palette" className="space-y-3">
        <h4 className={resourceSectionTitleClass}>Color palette</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {palette.map((color, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200"
            >
              <span
                className="h-10 w-10 rounded-lg border border-gray-200 shadow-inner dark:border-[var(--border-color-default)]"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-sm">{color}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (hasFonts) {
    sections.push(
      <section key="fonts" className="space-y-3">
        <h4 className={resourceSectionTitleClass}>Typefaces</h4>
        <ul className="space-y-2">
          {fonts.map((font, idx) => {
            const { type, value, name } = font;
            const displayName = name && name.trim() ? name.trim() : `Typeface ${idx + 1}`;
            const fontTypeLabel = type === "google" ? "Google Font" : "Custom Font";
            const isGoogleFont = type === "google";
            return (
              <li
                key={`${displayName}-${idx}`}
                className="flex flex-col rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
              >
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{displayName}</span>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                    {fontTypeLabel}
                  </span>
                  {isGoogleFont ? (
                    <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{value}</span>
                  ) : (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--accent-color)] hover:underline"
                    >
                      Download file
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (hasNotes) {
    sections.push(
      <section key="notes" className="space-y-3">
        <h4 className={resourceSectionTitleClass}>Brand notes</h4>
        <div className="space-y-3">
          {notes.map((note) => (
            <article
              key={note.id}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200"
            >
              <p className="whitespace-pre-wrap">{note.text}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (hasGuidelines) {
    sections.push(
      <section key="guidelines" className="space-y-3">
        <h4 className={resourceSectionTitleClass}>Brand guidelines</h4>
        <div className="flex flex-col gap-3">
          <a
            href={guidelinesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--accent-color)] hover:underline"
          >
            Open in new tab
          </a>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
            <iframe
              src={guidelinesUrl}
              title="Brand Guidelines"
              className="h-72 w-full border-0"
              loading="lazy"
            />
          </div>
        </div>
      </section>
    );
  }

  const body = (
    <div className={resourcePanelBodyClass}>
      {hasAnyContent ? (
        <div className="space-y-6">{sections}</div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 17v-6a2 2 0 012-2h6"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7h4a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2v-8"
            />
          </svg>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-200">No brand assets yet.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Upload logos, colors, and fonts from the brand profile to populate this tab.
          </p>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div
        className={`${resourcePanelClass} ${inlineClassName}`.trim()}
        style={resolvedHeight ? { height: resolvedHeight } : undefined}
      >
        {header}
        {body}
      </div>
    );
  }

  return (
    <Modal sizeClass="max-w-3xl w-full" className="p-0 overflow-hidden">
      <div
        className={resourcePanelClass}
        style={resolvedHeight ? { height: resolvedHeight } : undefined}
      >
        {header}
        {body}
      </div>
    </Modal>
  );
};

export default BrandAssets;
