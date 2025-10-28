import computeIntegrationStatusSummary from './computeIntegrationStatusSummary';

const buildAsset = (integrationId, statusEntry) => ({
  integrationStatuses: {
    [integrationId]: {
      updatedAt: Date.now(),
      ...statusEntry,
    },
  },
});

describe('computeIntegrationStatusSummary', () => {
  it('returns null when integration id is missing', () => {
    expect(computeIntegrationStatusSummary('', 'Compass', [])).toBeNull();
  });

  it('treats successful received states as success when response status is ok', () => {
    const integrationId = 'compass';
    const asset = buildAsset(integrationId, {
      state: 'received',
      responseStatus: 200,
    });

    const summary = computeIntegrationStatusSummary(integrationId, 'Compass', [asset]);

    expect(summary).toMatchObject({
      outcome: 'success',
      wasTriggered: true,
      latestState: 'received',
      responseStatus: 200,
    });
  });

  it('treats received states with 400+ response status as errors', () => {
    const integrationId = 'compass';
    const asset = buildAsset(integrationId, {
      state: 'received',
      responseStatus: '400',
      errorMessage: 'Invalid entry format',
    });

    const summary = computeIntegrationStatusSummary(integrationId, 'Compass', [asset]);

    expect(summary).toMatchObject({
      outcome: 'error',
      wasTriggered: true,
      responseStatus: 400,
      errorMessage: 'Invalid entry format',
    });
    expect(summary.latestState).toBe('received');
  });
});
