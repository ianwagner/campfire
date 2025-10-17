import React, { useMemo } from "react";
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
import { useBrandAssets } from "./useBrandAssets.js";

const BrandAssets = ({
  brandCode,
  onClose,
  inline = false,
  hideGuidelines = false,
  hideNotes = false,
  height = "auto",
  inlineClassName = "",
}) => {
  const {
    loading,
    guidelinesUrl: brandGuidelinesUrl,
    logos,
    colors,
    fonts,
    profileNotes,
    rawBrand,
  } = useBrandAssets(brandCode);

  const resolvedHeight = useMemo(() => {
    if (typeof height === "number") {
      return `${height}px`;
    }
    return height;
  }, [height]);

  const guidelinesUrl = hideGuidelines ? "" : brandGuidelinesUrl;
  const notes = useMemo(() => {
    if (hideNotes) return [];
    return profileNotes;
  }, [hideNotes, profileNotes]);

  const hasLogos = logos.length > 0;
  const hasColors = colors.length > 0;
  const hasFonts = fonts.length > 0;
  const hasNotes = notes.length > 0;
  const hasGuidelines = Boolean(guidelinesUrl);
  const hasAnyContent = hasLogos || hasColors || hasFonts || hasNotes || hasGuidelines;

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
          {logos.map((logo) => (
            <div
              key={logo.id}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
            >
              <OptimizedImage pngUrl={logo.url} alt={logo.description || logo.name || "logo"} className="max-h-16 w-auto" />
              <div className="text-center">
                {(logo.description || logo.variant || logo.name) && (
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                    {logo.description || logo.variant || logo.name}
                  </p>
                )}
                {logo.description && logo.variant ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{logo.variant}</p>
                ) : null}
                {logo.format ? (
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{logo.format}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (hasColors) {
    sections.push(
      <section key="palette" className="space-y-3">
        <h4 className={resourceSectionTitleClass}>Color palette</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {colors.map((color) => (
            <div
              key={color.id}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200"
            >
              <span
                className="h-10 w-10 rounded-lg border border-gray-200 shadow-inner dark:border-[var(--border-color-default)]"
                style={{ backgroundColor: color.hex }}
              />
              <div>
                <p className="font-semibold">{color.name}</p>
                <p className="font-mono text-xs">{color.hex}</p>
                {color.usage ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-300">{color.usage}</p>
                ) : null}
              </div>
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
            const displayName = font.name || `Typeface ${idx + 1}`;
            const fontTypeLabel = font.type === "google" ? "Google Font" : "Custom Font";
            const isGoogleFont = font.type === "google";
            return (
              <li
                key={font.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
              >
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{displayName}</span>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                    {fontTypeLabel}
                  </span>
                  {font.role ? (
                    <span className="rounded-full bg-[var(--accent-color-10)] px-2 py-0.5 font-medium uppercase tracking-wide text-[var(--accent-color)] dark:bg-[var(--accent-color-20)] dark:text-[var(--accent-color)]">
                      {font.role}
                    </span>
                  ) : null}
                  {isGoogleFont && font.rawValue ? (
                    <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{font.rawValue}</span>
                  ) : null}
                  {!isGoogleFont && font.format ? (
                    <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{font.format}</span>
                  ) : null}
                  {!isGoogleFont && font.downloadUrl ? (
                    <a
                      href={font.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={font.downloadFileName || undefined}
                      className="font-medium text-[var(--accent-color)] hover:underline"
                    >
                      Download file
                    </a>
                  ) : null}
                </div>
                {font.rules ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-line">{font.rules}</p>
                ) : null}
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 shadow-inner dark:bg-gray-800 dark:text-gray-200" style={{ fontFamily: font.family }}>
                  {font.example}
                </p>
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
              <p className="whitespace-pre-wrap">{note.body}</p>
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
              className="h-[36rem] w-full border-0"
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
      ) : loading && !rawBrand ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-300">
          Loading brand assets...
        </div>
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6a2 2 0 012-2h6" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h4a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2v-8" />
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
