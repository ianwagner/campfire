import React, { useMemo } from 'react';
import BrandAssets from './BrandAssets.jsx';
import {
  resourcePanelBodyClass,
  resourcePanelClass,
  resourcePanelHeaderClass,
  resourceSectionSubtitleClass,
  resourceSectionTitleClass,
} from './components/common/resourcePanelStyles.js';

const BrandAssetsLayout = ({ brandCode, guidelinesUrl = '', brandNotes = [], height = 500 }) => {
  const notes = useMemo(() => {
    if (!Array.isArray(brandNotes)) return [];
    return brandNotes
      .filter((note) => {
        if (!note) return false;
        const title = typeof note.title === 'string' ? note.title.trim() : '';
        const rawBody = typeof note.body === 'string' ? note.body : '';
        const strippedBody = rawBody.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
        return Boolean(title || strippedBody);
      })
      .map((note) => ({
        ...note,
        title: typeof note.title === 'string' ? note.title.trim() : '',
        body: typeof note.body === 'string' ? note.body : '',
      }));
  }, [brandNotes]);

  const hasGuidelines = Boolean(guidelinesUrl);
  const hasNotes = notes.length > 0;

  const resolvedHeight = useMemo(() => {
    if (typeof height === 'number') {
      return `${height}px`;
    }
    return height;
  }, [height]);

  const constrainedStyle =
    resolvedHeight && resolvedHeight !== 'auto'
      ? { maxHeight: resolvedHeight }
      : undefined;

  return (
    <div
      className={
        hasGuidelines
          ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr),minmax(0,1.5fr)]'
          : 'flex flex-col gap-6'
      }
    >
      <div className="flex flex-col gap-6">
        <BrandAssets
          brandCode={brandCode}
          inline
          hideGuidelines
          hideNotes
          height={height}
        />
        {hasNotes && (
          <section className={resourcePanelClass} style={constrainedStyle}>
            <div className={resourcePanelHeaderClass}>
              <div className="flex flex-col gap-1">
                <h3 className={resourceSectionTitleClass}>Brand notes</h3>
                <p className={resourceSectionSubtitleClass}>
                  Quick access to the context your team has captured in Brand Notes.
                </p>
              </div>
            </div>
            <div className={`${resourcePanelBodyClass} space-y-4 overflow-y-auto`}>
              {notes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]"
                >
                  {note.title ? (
                    <h4 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                      {note.title}
                    </h4>
                  ) : null}
                  {note.body ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200 dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: note.body }}
                    />
                  ) : null}
                  {(() => {
                    const timestamp = note.updatedAt || note.createdAt;
                    if (!timestamp) return null;
                    const label = note.updatedAt ? 'Updated' : 'Created';
                    return (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        {label} {timestamp.toLocaleString()}
                      </p>
                    );
                  })()}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      {hasGuidelines ? (
        <section className={resourcePanelClass} style={constrainedStyle}>
          <div className={resourcePanelHeaderClass}>
            <div className="flex flex-col gap-1">
              <h3 className={resourceSectionTitleClass}>Brand guidelines</h3>
              <p className={resourceSectionSubtitleClass}>
                Embed reference documents so the team always works from the latest rules.
              </p>
            </div>
          </div>
          <div className={`flex flex-1 flex-col gap-4 ${resourcePanelBodyClass}`}>
            <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <iframe
                src={guidelinesUrl}
                title="Brand Guidelines"
                className="h-full w-full border-0"
                loading="lazy"
              />
            </div>
            <a
              href={guidelinesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[var(--accent-color)] hover:underline"
            >
              Open in new tab
            </a>
          </div>
        </section>
      ) : hasNotes ? (
        <section className={`${resourcePanelClass} flex items-center justify-center px-6 py-12 text-sm text-gray-500 dark:text-gray-300`}>
          No brand guidelines yet.
        </section>
      ) : (
        <section className={`${resourcePanelClass} flex items-center justify-center px-6 py-12 text-sm text-gray-500 dark:text-gray-300`}>
          No brand guidelines or notes yet.
        </section>
      )}
    </div>
  );
};

export default BrandAssetsLayout;
