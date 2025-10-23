export const NOTE_SOURCE_TYPES = {
  CURRENT: 'current',
  FALLBACK: 'fallback',
  LEGACY: 'legacy',
  EMPTY: 'empty',
};

export const NOTE_FALLBACK_TYPES = {
  MONTHLY: 'monthly',
  LEGACY: 'legacy',
};

const hasContent = (value) => typeof value === 'string' && value.trim().length > 0;

const getEntryValue = (entry) => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (entry && typeof entry === 'object' && typeof entry.note === 'string') {
    return entry.note;
  }
  return '';
};

const normalizeMonthlyEntries = (monthNotes) => {
  if (!monthNotes || typeof monthNotes !== 'object' || Array.isArray(monthNotes)) {
    return [];
  }
  const entries = [];
  Object.entries(monthNotes).forEach(([key, entry]) => {
    if (typeof key !== 'string') return;
    const [entryMonth, entryWorkflow] = key.split('__');
    if (!entryMonth || !entryWorkflow) return;
    const value = getEntryValue(entry);
    if (!hasContent(value)) return;
    entries.push({ month: entryMonth, workflow: entryWorkflow, value });
  });
  entries.sort((a, b) => b.month.localeCompare(a.month));
  return entries;
};

export const resolveDashboardNoteState = ({
  monthNotes,
  month,
  workflow,
  legacyNote,
}) => {
  const legacyValue = hasContent(legacyNote) ? legacyNote : '';
  const monthlyEntries = normalizeMonthlyEntries(monthNotes);
  const workflowEntries = monthlyEntries.filter((entry) => entry.workflow === workflow);
  const currentEntry = workflowEntries.find((entry) => entry.month === month);

  let fallbackMonthlyEntry = null;
  for (const entry of workflowEntries) {
    if (entry.month === month) continue;
    if (!fallbackMonthlyEntry) {
      fallbackMonthlyEntry = entry;
    }
    if (entry.month <= month) {
      fallbackMonthlyEntry = entry;
      break;
    }
  }

  if (currentEntry) {
    const fallback = fallbackMonthlyEntry
      ? {
          type: NOTE_FALLBACK_TYPES.MONTHLY,
          month: fallbackMonthlyEntry.month,
          value: fallbackMonthlyEntry.value,
        }
      : legacyValue
      ? {
          type: NOTE_FALLBACK_TYPES.LEGACY,
          month: null,
          value: legacyValue,
        }
      : null;
    return {
      savedValue: currentEntry.value,
      draftValue: currentEntry.value,
      source: { type: NOTE_SOURCE_TYPES.CURRENT, month },
      fallback,
    };
  }

  if (fallbackMonthlyEntry) {
    return {
      savedValue: '',
      draftValue: fallbackMonthlyEntry.value,
      source: {
        type: NOTE_SOURCE_TYPES.FALLBACK,
        month: fallbackMonthlyEntry.month,
      },
      fallback: {
        type: NOTE_FALLBACK_TYPES.MONTHLY,
        month: fallbackMonthlyEntry.month,
        value: fallbackMonthlyEntry.value,
      },
    };
  }

  if (legacyValue) {
    return {
      savedValue: '',
      draftValue: legacyValue,
      source: { type: NOTE_SOURCE_TYPES.LEGACY, month: null },
      fallback: {
        type: NOTE_FALLBACK_TYPES.LEGACY,
        month: null,
        value: legacyValue,
      },
    };
  }

  return {
    savedValue: '',
    draftValue: '',
    source: { type: NOTE_SOURCE_TYPES.EMPTY, month: null },
    fallback: null,
  };
};

export default resolveDashboardNoteState;
