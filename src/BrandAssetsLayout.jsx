import React from 'react';
import BrandAssets from './BrandAssets.jsx';

const BrandAssetsLayout = ({ brandCode, guidelinesUrl = '', brandNotes = [], height = 500 }) => {
  const hasGuidelines = Boolean(guidelinesUrl);
  const notes = Array.isArray(brandNotes)
    ? brandNotes.filter((note) => {
        if (!note) return false;
        const title = typeof note.title === 'string' ? note.title.trim() : '';
        const rawBody = typeof note.body === 'string' ? note.body : '';
        const strippedBody = rawBody.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
        return Boolean(title || strippedBody);
      })
    : [];
  const hasNotes = notes.length > 0;

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-stretch">
      <div className="flex-1">
        <BrandAssets brandCode={brandCode} inline hideGuidelines height={height} />
      </div>
      {(hasGuidelines || hasNotes) && (
        <div className="flex-1 flex flex-col gap-4">
          {hasGuidelines && (
            <div
              className="mb-4 bg-white p-4 rounded shadow w-full overflow-auto relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              style={{ outline: '1px solid var(--border-color-default, #d1d5db)', height }}
            >
              <h3 className="mb-3 font-semibold text-lg">Brand Guidelines</h3>
              <iframe
                src={guidelinesUrl}
                title="Brand Guidelines"
                className="w-full border rounded h-full"
              />
            </div>
          )}
          {hasNotes && (
            <div
              className="mb-4 bg-white p-4 rounded shadow w-full overflow-auto relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              style={{ outline: '1px solid var(--border-color-default, #d1d5db)', maxHeight: height }}
            >
              <h3 className="mb-3 font-semibold text-lg">Brand Notes</h3>
              <div className="space-y-4">
                {notes.map((note) => (
                  <article
                    key={note.id}
                    className="rounded border border-gray-200 p-3 text-sm shadow-sm dark:border-gray-700"
                  >
                    {note.title && (
                      <h4 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                        {note.title}
                      </h4>
                    )}
                    {note.body && (
                      <div
                        className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200 dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: note.body }}
                      />
                    )}
                    {(() => {
                      const timestamp = note.updatedAt || note.createdAt;
                      if (!timestamp) return null;
                      const label = note.updatedAt ? 'Updated' : 'Created';
                      return (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {label} {timestamp.toLocaleString()}
                        </p>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BrandAssetsLayout;
