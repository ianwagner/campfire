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

  it('treats payload response status errors as failures even when stored status is ok', () => {
    const integrationId = 'compass';
    const asset = buildAsset(integrationId, {
      state: 'received',
      responseStatus: 200,
      responsePayload: {
        dispatch: {
          status: 422,
          message: 'Unprocessable entity',
          response: {
            status: 422,
            statusText: 'Unprocessable Entity',
          },
        },
      },
      errorMessage: 'Remote validation failed',
    });

    const summary = computeIntegrationStatusSummary(integrationId, 'Compass', [asset]);

    expect(summary).toMatchObject({
      outcome: 'error',
      wasTriggered: true,
      responseStatus: 422,
      errorMessage: 'Remote validation failed',
    });
  });

  it('treats duplicate states as successful when no errors are present', () => {
    const integrationId = 'compass';
    const baseTime = Date.now();
    const duplicateAsset = buildAsset(integrationId, {
      state: 'duplicate',
      responseStatus: 409,
      updatedAt: baseTime + 1000,
      errorMessage: 'Already exists',
    });

    const summary = computeIntegrationStatusSummary(integrationId, 'Compass', [duplicateAsset]);

    expect(summary).toMatchObject({
      outcome: 'success',
      wasTriggered: true,
      latestState: 'duplicate',
      responseStatus: 409,
    });
  });

  it('treats manual states as successful outcomes', () => {
    const integrationId = 'compass';
    const manualAsset = buildAsset(integrationId, {
      state: 'manual',
      statusMessage: 'Manually Input',
    });

    const summary = computeIntegrationStatusSummary(integrationId, 'Compass', [manualAsset]);

    expect(summary).toMatchObject({
      outcome: 'success',
      wasTriggered: true,
      latestState: 'manual',
    });
  });
});
