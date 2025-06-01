import React from 'react';
import useAgencyTheme from './useAgencyTheme';
import { DEFAULT_LOGO_URL } from './constants';
import { OptimizedImage } from '@studio-tak/shared-ui';

const AgencyTheme = ({ agencyId, children }) => {
  const { agency } = useAgencyTheme(agencyId);

  return (
    <div className="min-h-screen">
      <div className="text-center my-4">
        <OptimizedImage
          pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
          alt={`${agency.name || 'Agency'} logo`}
          loading="eager"
          cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
          className="mx-auto max-h-16 w-auto"
        />
      </div>
      {children}
    </div>
  );
};

export default AgencyTheme;
