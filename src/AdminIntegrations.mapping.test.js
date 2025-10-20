import { convertPartnerMappingToUi } from './AdminIntegrations.jsx';

describe('convertPartnerMappingToUi', () => {
  it('keeps partner-mapped campfire fields distinct when keys are partner names', () => {
    const persistedMapping = {
      partnerStatus: 'status',
      partnerHeadline: 'headline',
    };

    const result = convertPartnerMappingToUi(persistedMapping);

    expect(result).toEqual({
      status: { target: 'partnerStatus' },
      headline: { target: 'partnerHeadline' },
    });
    expect(Object.keys(result).sort()).toEqual(['headline', 'status']);
  });

  it('normalizes legacy campfire-keyed mappings without duplicating partner keys', () => {
    const legacyMapping = {
      status: 'partnerStatus',
      headline: 'partnerHeadline',
    };

    const result = convertPartnerMappingToUi(legacyMapping);

    expect(result).toEqual({
      status: { target: 'partnerStatus' },
      headline: { target: 'partnerHeadline' },
    });
    expect(result.partnerStatus).toBeUndefined();
    expect(result.partnerHeadline).toBeUndefined();
  });

  it('preserves date formats from normalized entries', () => {
    const normalizedMapping = {
      partnerLaunchDate: { source: 'metadata.launchDate', format: 'yyyy-MM-dd' },
    };

    const result = convertPartnerMappingToUi(normalizedMapping);

    expect(result).toEqual({
      'metadata.launchDate': { target: 'partnerLaunchDate', format: 'yyyy-MM-dd' },
    });
  });
});
