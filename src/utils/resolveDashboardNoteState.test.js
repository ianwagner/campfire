import {
  NOTE_FALLBACK_TYPES,
  NOTE_SOURCE_TYPES,
  resolveDashboardNoteState,
} from './resolveDashboardNoteState.js';

describe('resolveDashboardNoteState', () => {
  it('returns current month entry when available', () => {
    const result = resolveDashboardNoteState({
      monthNotes: {
        '2024-03__production': { note: 'March note' },
        '2024-02__production': { note: 'February note' },
      },
      month: '2024-03',
      workflow: 'production',
      legacyNote: 'legacy note',
    });

    expect(result).toEqual({
      savedValue: 'March note',
      draftValue: 'March note',
      source: { type: NOTE_SOURCE_TYPES.CURRENT, month: '2024-03' },
      fallback: {
        type: NOTE_FALLBACK_TYPES.MONTHLY,
        month: '2024-02',
        value: 'February note',
      },
    });
  });

  it('falls back to the latest previous month for the workflow', () => {
    const result = resolveDashboardNoteState({
      monthNotes: {
        '2024-02__production': 'February note',
        '2024-01__production': { note: 'January note' },
      },
      month: '2024-03',
      workflow: 'production',
      legacyNote: 'legacy note',
    });

    expect(result).toEqual({
      savedValue: '',
      draftValue: 'February note',
      source: { type: NOTE_SOURCE_TYPES.FALLBACK, month: '2024-02' },
      fallback: {
        type: NOTE_FALLBACK_TYPES.MONTHLY,
        month: '2024-02',
        value: 'February note',
      },
    });
  });

  it('uses the legacy note when no monthly entries exist', () => {
    const result = resolveDashboardNoteState({
      monthNotes: {},
      month: '2024-03',
      workflow: 'production',
      legacyNote: 'legacy note',
    });

    expect(result).toEqual({
      savedValue: '',
      draftValue: 'legacy note',
      source: { type: NOTE_SOURCE_TYPES.LEGACY, month: null },
      fallback: {
        type: NOTE_FALLBACK_TYPES.LEGACY,
        month: null,
        value: 'legacy note',
      },
    });
  });

  it('returns empty values when nothing is saved', () => {
    const result = resolveDashboardNoteState({
      monthNotes: {
        '2024-01__brief': { note: '' },
      },
      month: '2024-03',
      workflow: 'production',
      legacyNote: '',
    });

    expect(result).toEqual({
      savedValue: '',
      draftValue: '',
      source: { type: NOTE_SOURCE_TYPES.EMPTY, month: null },
      fallback: null,
    });
  });

  it('ignores entries for other workflows when resolving fallback', () => {
    const result = resolveDashboardNoteState({
      monthNotes: {
        '2024-03__production': { note: 'March production' },
        '2024-02__brief': { note: 'Brief note' },
      },
      month: '2024-02',
      workflow: 'production',
      legacyNote: '',
    });

    expect(result).toEqual({
      savedValue: '',
      draftValue: 'March production',
      source: { type: NOTE_SOURCE_TYPES.FALLBACK, month: '2024-03' },
      fallback: {
        type: NOTE_FALLBACK_TYPES.MONTHLY,
        month: '2024-03',
        value: 'March production',
      },
    });
  });
});
