import React from 'react';
import BrandAssets from './BrandAssets.jsx';

const BrandAssetsLayout = ({ brandCode, guidelinesUrl = '', height = 500 }) => (
  <div className="flex flex-col sm:flex-row gap-4 items-stretch">
    <div className="flex-1">
      <BrandAssets brandCode={brandCode} inline hideGuidelines height={height} />
    </div>
    {guidelinesUrl && (
      <div className="flex-1">
        <div
          className="mb-4 bg-white p-4 rounded shadow w-full h-full overflow-auto relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
          style={{ outline: '1px solid var(--border-color-default, #d1d5db)', height }}
        >
          <h3 className="mb-3 font-semibold text-lg">Brand Guidelines</h3>
          <iframe
            src={guidelinesUrl}
            title="Brand Guidelines"
            className="w-full border rounded h-full"
          />
        </div>
      </div>
    )}
  </div>
);

export default BrandAssetsLayout;
