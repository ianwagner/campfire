import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import Button from './components/Button.jsx';
import FeedbackPanel from './components/FeedbackPanel.jsx';
import { db } from './firebase/config';
import buildFeedbackEntries from './utils/buildFeedbackEntries';
import diffWords from './utils/diffWords';

const createRenderCopyEditDiff = (meta = {}) =>
  (recipeCode, edit, origOverride) => {
    const metaKey = recipeCode ? String(recipeCode) : '';
    const normalizedKey = metaKey.toLowerCase();
    const recipeMeta =
      (metaKey && meta[metaKey]) ||
      (normalizedKey && meta[normalizedKey]) ||
      null;
    const baseCopy =
      origOverride ??
      recipeMeta?.copy ??
      recipeMeta?.latestCopy ??
      '';
    if (!edit || edit === baseCopy) return null;
    const diff = diffWords(baseCopy, edit);
    return diff.map((part, index) => {
      const text = part.text ?? part.value ?? '';
      const type = part.type ?? (part.added ? 'added' : part.removed ? 'removed' : 'same');
      const space = index < diff.length - 1 ? ' ' : '';
      if (type === 'removed') {
        return (
          <span key={index} className="text-red-600 line-through">
            {text}
            {space}
          </span>
        );
      }
      if (type === 'same') {
        return text + space;
      }
      return (
        <span key={index} className="text-green-600 italic">
          {text}
          {space}
        </span>
      );
    });
  };

const flattenRichText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((child) => flattenRichText(child)).join('');
  }
  if (React.isValidElement(value)) {
    return flattenRichText(value.props?.children);
  }
  if (value && typeof value === 'object' && 'props' in value) {
    return flattenRichText(value.props.children);
  }
  return '';
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toHtmlParagraphs = (value) =>
  String(value || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

const createFallbackNotes = (summaryText) => {
  const sentences = String(summaryText || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!sentences.length) return [];
  return sentences.map((sentence, index) => {
    const cleaned = sentence.replace(/\s+/g, ' ').replace(/\s*[.!?]\s*$/, '');
    const focus = cleaned.length > 90 ? `${cleaned.slice(0, 87)}…` : cleaned;
    const title = focus.length > 60 ? `${focus.slice(0, 57)}…` : focus;
    return {
      id: `fallback-${index}`,
      focus: focus || 'Key takeaway',
      title: title || 'Client feedback update',
      bodyHtml: toHtmlParagraphs(sentence),
    };
  });
};

const toDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const BrandFeedback = ({ brandId, brandCode, brandName }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState(null);
  const [updatingSummary, setUpdatingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [noteSuggestions, setNoteSuggestions] = useState([]);
  const [noteSuggestionLoading, setNoteSuggestionLoading] = useState(false);
  const [savingSuggestedNoteId, setSavingSuggestedNoteId] = useState(null);
  const [noteSuggestionError, setNoteSuggestionError] = useState('');
  const [noteSuggestionMessage, setNoteSuggestionMessage] = useState('');

  const OPENAI_PROXY_URL = useMemo(
    () =>
      `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/openaiProxy`,
    [],
  );

  useEffect(() => {
    setNoteSuggestions([]);
    setNoteSuggestionError('');
    setNoteSuggestionMessage('');
    setNoteSuggestionLoading(false);
    setSavingSuggestedNoteId(null);
  }, [brandId]);

  useEffect(() => {
    if (!brandId) {
      setSummary('');
      setSummaryUpdatedAt(null);
      return;
    }
    let isMounted = true;
    const loadSummary = async () => {
      try {
        const snap = await getDoc(doc(db, 'brands', brandId));
        if (!isMounted) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          setSummary(typeof data.feedbackSummary === 'string' ? data.feedbackSummary : '');
          setSummaryUpdatedAt(toDateValue(data.feedbackSummaryUpdatedAt));
        } else {
          setSummary('');
          setSummaryUpdatedAt(null);
        }
      } catch (err) {
        console.error('Failed to load brand feedback summary', err);
      }
    };
    loadSummary();
    return () => {
      isMounted = false;
    };
  }, [brandId]);

  useEffect(() => {
    if (!brandCode) {
      setEntries([]);
      return;
    }
    let isCancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const groupsSnap = await getDocs(
          query(collection(db, 'adGroups'), where('brandCode', '==', brandCode)),
        );
        if (isCancelled) return;
        const groups = groupsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data()?.name || '',
        }));
        const payloads = await Promise.all(
          groups.map(async (group) => {
            try {
              const [feedbackSnap, responsesSnap, assetsSnap, recipesSnap] = await Promise.all([
                getDocs(collection(db, 'adGroups', group.id, 'feedback')),
                getDocs(collection(db, 'adGroups', group.id, 'responses')),
                getDocs(collection(db, 'adGroups', group.id, 'assets')),
                getDocs(collection(db, 'adGroups', group.id, 'recipes')),
              ]);

              const feedbackList = feedbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              const responsesList = responsesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              const assetsList = assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

              const recipesMeta = {};
              recipesSnap.docs.forEach((recipeDoc) => {
                const recipeData = recipeDoc.data() || {};
                const meta = recipeData.metadata || {};
                recipesMeta[recipeDoc.id] = {
                  id: recipeDoc.id,
                  ...meta,
                  copy: recipeData.copy || '',
                  latestCopy: recipeData.latestCopy || '',
                };
              });

              return {
                groupId: group.id,
                groupName: group.name,
                feedback: feedbackList,
                responses: responsesList,
                assets: assetsList,
                recipesMeta,
                renderCopyEditDiff: createRenderCopyEditDiff(recipesMeta),
              };
            } catch (err) {
              console.error('Failed to load feedback for group', group.id, err);
              return {
                groupId: group.id,
                groupName: group.name,
                feedback: [],
                responses: [],
                assets: [],
                recipesMeta: {},
              };
            }
          }),
        );
        if (isCancelled) return;
        const combined = buildFeedbackEntries(payloads);
        const uniqueMap = new Map();
        combined.forEach((entry) => {
          if (!entry || !entry.id) return;
          if (!uniqueMap.has(entry.id)) {
            uniqueMap.set(entry.id, entry);
            return;
          }
          const previous = uniqueMap.get(entry.id);
          const prevTime = previous?.updatedAt?.getTime?.() || 0;
          const nextTime = entry?.updatedAt?.getTime?.() || 0;
          if (nextTime > prevTime) {
            uniqueMap.set(entry.id, entry);
          }
        });
        const list = Array.from(uniqueMap.values());
        list.sort(
          (a, b) => (b?.updatedAt?.getTime?.() || 0) - (a?.updatedAt?.getTime?.() || 0),
        );
        setEntries(list);
      } catch (err) {
        console.error('Failed to load brand feedback', err);
        if (!isCancelled) setEntries([]);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    load();
    return () => {
      isCancelled = true;
    };
  }, [brandCode]);

  const formatFeedbackForSummary = useCallback(() => {
    if (!entries.length) return 'No client feedback available yet.';
    const formatTimestamp = (value) => {
      if (!value || !(value instanceof Date)) return '';
      try {
        return value.toLocaleString(undefined, { month: 'short', day: 'numeric' });
      } catch (err) {
        return '';
      }
    };
    const sanitizeLine = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');
    const cleanText = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value.trim();
      return flattenRichText(value).trim();
    };

    return entries
      .map((entry, index) => {
        const headerParts = [];
        if (entry.groupName) headerParts.push(`Group: ${entry.groupName}`);
        if (entry.recipeCode) headerParts.push(`Recipe: ${entry.recipeCode}`);
        if (entry.subtitle) headerParts.push(`Details: ${sanitizeLine(entry.subtitle)}`);
        if (entry.adStatus) headerParts.push(`Status: ${entry.adStatus.replace(/_/g, ' ')}`);
        const commentCount = Array.isArray(entry.commentList) ? entry.commentList.length : 0;
        const copyEditCount = Array.isArray(entry.copyEditList) ? entry.copyEditList.length : 0;
        if (commentCount) {
          headerParts.push(`${commentCount} comment${commentCount === 1 ? '' : 's'}`);
        }
        if (copyEditCount) {
          headerParts.push(`${copyEditCount} copy edit${copyEditCount === 1 ? '' : 's'}`);
        }
        const headerLabel = headerParts.length
          ? headerParts.join(' | ')
          : entry.title || `Entry ${index + 1}`;
        const lines = [`Entry ${index + 1}: ${headerLabel}`];

        const commentItems = Array.isArray(entry.commentList) ? entry.commentList : [];
        commentItems.forEach((item) => {
          if (!item?.text) return;
          const detailParts = [];
          if (item.assetLabel) detailParts.push(item.assetLabel);
          if (item.updatedBy) detailParts.push(`by ${item.updatedBy}`);
          const timestamp = formatTimestamp(toDateValue(item.updatedAt));
          if (timestamp) detailParts.push(timestamp);
          if (item.status) {
            detailParts.push(`status: ${item.status.replace(/_/g, ' ')}`);
          }
          const detailString = detailParts.length ? ` (${detailParts.join(' • ')})` : '';
          lines.push(`  - Comment${detailString}: ${sanitizeLine(item.text)}`);
        });
        if (!commentItems.length && entry.comment) {
          lines.push(`  - Comment: ${sanitizeLine(entry.comment)}`);
        }

        const copyItems = Array.isArray(entry.copyEditList) ? entry.copyEditList : [];
        copyItems.forEach((item) => {
          const detailParts = [];
          if (item.assetLabel) detailParts.push(item.assetLabel);
          if (item.updatedBy) detailParts.push(`by ${item.updatedBy}`);
          const timestamp = formatTimestamp(toDateValue(item.updatedAt));
          if (timestamp) detailParts.push(timestamp);
          if (item.status) {
            detailParts.push(`status: ${item.status.replace(/_/g, ' ')}`);
          }
          const detailString = detailParts.length ? ` (${detailParts.join(' • ')})` : '';
          const copyText = sanitizeLine(cleanText(item.text) || cleanText(item.diff));
          if (copyText) {
            lines.push(`  - Copy edit${detailString}: ${copyText}`);
          } else {
            lines.push(`  - Copy edit${detailString}: Updated copy provided via diff.`);
          }
        });
        if (!copyItems.length && entry.copyEdit) {
          lines.push(`  - Copy edit: ${sanitizeLine(entry.copyEdit)}`);
        }

        return lines.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }, [entries]);

  const generateNoteSuggestions = useCallback(
    async (summaryText, digestText) => {
      if (!summaryText) {
        setNoteSuggestions([]);
        setNoteSuggestionLoading(false);
        return;
      }
      setNoteSuggestions([]);
      setNoteSuggestionMessage('');
      setNoteSuggestionError('');
      setNoteSuggestionLoading(true);
      try {
        const brandLabel = brandName || brandCode || 'this brand';
        const notePrompt =
          `You are a marketing project assistant creating an internal brand note for ${brandLabel}.\n` +
          'Use the client feedback summary and raw details below to capture durable guardrails, preferences, or next steps the creative team should remember.\n' +
          'Break the guidance into 2-4 separate notes. Each note must highlight a single primary focus (for example, a decision, guardrail, or next step) and include supporting context.\n' +
          'Respond with strict JSON in the shape {"notes": [{"focus": string, "title": string, "bodyHtml": string}]}. The bodyHtml must be sanitized HTML using <p>, <ul>, <ol>, and <li> tags only. Do not include markdown fences or commentary.\n' +
          '\nClient feedback summary:\n' +
          `${summaryText}\n\n` +
          'Raw feedback details:\n' +
          `${digestText || '(not provided)'}`;

        const response = await fetch(OPENAI_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You write brand notes for marketing creative teams.' },
              { role: 'user', content: notePrompt },
            ],
            temperature: 0.3,
          }),
        });
        if (!response.ok) {
          throw new Error(`OpenAI proxy request failed with ${response.status}`);
        }
        const data = await response.json();
        const rawContent = data?.choices?.[0]?.message?.content?.trim() || '';
        const parseJson = (value) => {
          if (!value) return null;
          try {
            return JSON.parse(value);
          } catch (err) {
            const match = value.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                return JSON.parse(match[0]);
              } catch (innerErr) {
                return null;
              }
            }
            return null;
          }
        };
        const parsed = parseJson(rawContent);
        if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
          throw new Error('Invalid note suggestion format');
        }
        const parsedNotes = Array.isArray(parsed) ? parsed : Array.isArray(parsed.notes) ? parsed.notes : [];
        const normalizedNotes = parsedNotes
          .slice(0, 4)
          .map((item) => (item && typeof item === 'object' ? item : null))
          .filter(Boolean)
          .map((item, index) => {
            const focus = typeof item.focus === 'string' ? item.focus.trim() : '';
            const title = typeof item.title === 'string' ? item.title.trim() : '';
            let bodyHtml = '';
            if (typeof item.bodyHtml === 'string' && item.bodyHtml.trim()) {
              bodyHtml = item.bodyHtml.trim();
            } else if (typeof item.body === 'string' && item.body.trim()) {
              bodyHtml = item.body.trim();
            }
            if (!bodyHtml) {
              bodyHtml = toHtmlParagraphs(summaryText);
            } else if (!/<(p|ul|ol|li|br)\b/i.test(bodyHtml)) {
              bodyHtml = toHtmlParagraphs(bodyHtml);
            }
            const derivedTitle = title || (focus ? `Focus: ${focus}` : 'Client feedback update');
            return {
              id: `${index}-${derivedTitle}`,
              focus: focus || 'Key takeaway',
              title: derivedTitle,
              bodyHtml,
            };
          });
        const fallbackNotes = createFallbackNotes(summaryText);
        let finalNotes = normalizedNotes;
        if (!finalNotes.length && fallbackNotes.length) {
          finalNotes = fallbackNotes;
        } else if (fallbackNotes.length) {
          const minimumTargets = Math.min(2, fallbackNotes.length);
          if (finalNotes.length < minimumTargets) {
            const existingKeys = new Set(finalNotes.map((note) => note.title));
            const supplemental = fallbackNotes
              .filter((note) => !existingKeys.has(note.title))
              .slice(0, Math.max(0, 4 - finalNotes.length));
            finalNotes = [...finalNotes, ...supplemental];
          }
        }
        finalNotes = finalNotes.slice(0, 4);
        if (!finalNotes.length) {
          throw new Error('No note suggestions returned');
        }
        setNoteSuggestions(finalNotes);
      } catch (err) {
        console.error('Failed to generate brand note suggestion', err);
        setNoteSuggestionError('Unable to recommend a brand note right now. Try updating the summary again later.');
      } finally {
        setNoteSuggestionLoading(false);
      }
    },
    [OPENAI_PROXY_URL, brandCode, brandName],
  );

  const handleSaveSuggestedNote = useCallback(
    async (note) => {
      if (!note) return;
      if (!brandId) {
        setNoteSuggestionError('Cannot save note without a brand ID.');
        return;
      }
      const noteId = note.id || note.title || 'note';
      setSavingSuggestedNoteId(noteId);
      setNoteSuggestionError('');
      setNoteSuggestionMessage('');
      try {
        const payload = {
          title: note.title?.trim() || 'Client feedback update',
          body: note.bodyHtml?.trim() || toHtmlParagraphs(summary || ''),
          tags: ['client feedback'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'brands', brandId, 'notes'), payload);
        setNoteSuggestions((prev) => prev.filter((item) => item.id !== noteId));
        setNoteSuggestionMessage('Note saved to brand notes.');
      } catch (err) {
        console.error('Failed to save recommended brand note', err);
        setNoteSuggestionError('Failed to save the recommended note. Please try again.');
      } finally {
        setSavingSuggestedNoteId(null);
      }
    },
    [brandId, summary],
  );

  const handleDismissSuggestedNote = useCallback((noteId) => {
    setNoteSuggestions((prev) => prev.filter((item) => item.id !== noteId));
    setNoteSuggestionError('');
  }, []);

  const handleUpdateSummary = useCallback(async () => {
    if (updatingSummary) return;
    setSummaryError('');
    setNoteSuggestions([]);
    setNoteSuggestionError('');
    setNoteSuggestionMessage('');
    setNoteSuggestionLoading(false);
    if (!entries.length) {
      const emptySummary = 'No client feedback available yet.';
      setSummary(emptySummary);
      const now = new Date();
      setSummaryUpdatedAt(now);
      if (brandId) {
        try {
          await updateDoc(doc(db, 'brands', brandId), {
            feedbackSummary: emptySummary,
            feedbackSummaryUpdatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Failed to save empty brand feedback summary', err);
          setSummaryError('Failed to save summary. Please try again.');
        }
      }
      return;
    }

    setUpdatingSummary(true);
    try {
      const feedbackDigest = formatFeedbackForSummary();
      const existingSummary = summary?.trim() || '';
      const brandLabel = brandName || brandCode || 'this brand';
      const prompt =
        `You are a marketing project assistant summarizing client feedback for the brand "${brandLabel}".\n` +
        `Here is the current summary on file:\n${existingSummary || '(no summary yet)'}\n\n` +
        `Here are the latest feedback notes that should be reflected:\n${feedbackDigest}\n\n` +
        'Write a warm, professional paragraph (around three sentences) that captures the main themes, approvals, and next steps. ' +
        'Avoid bullet points or lists, and respond with the updated paragraph only.';

      const response = await fetch(OPENAI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You summarize client feedback for marketing creative teams.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI proxy request failed with ${response.status}`);
      }
      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error('No summary returned from model');
      }
      if (brandId) {
        await updateDoc(doc(db, 'brands', brandId), {
          feedbackSummary: raw,
          feedbackSummaryUpdatedAt: serverTimestamp(),
        });
      }
      const now = new Date();
      setSummary(raw);
      setSummaryUpdatedAt(now);
      generateNoteSuggestions(raw, feedbackDigest);
    } catch (err) {
      console.error('Failed to update brand feedback summary', err);
      setSummaryError('Failed to update summary. Please try again.');
    } finally {
      setUpdatingSummary(false);
    }
  }, [
    OPENAI_PROXY_URL,
    brandCode,
    brandId,
    brandName,
    entries,
    formatFeedbackForSummary,
    generateNoteSuggestions,
    summary,
    updatingSummary,
  ]);

  const summaryDescription = summaryUpdatedAt
    ? (() => {
        try {
          return `Last updated ${summaryUpdatedAt.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`;
        } catch (err) {
          return 'Summary updated';
        }
      })()
    : 'Generate a quick overview of client feedback across this brand.';

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feedback summary</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{summaryDescription}</p>
          </div>
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={handleUpdateSummary}
            disabled={updatingSummary}
          >
            {updatingSummary ? 'Updating…' : 'Update summary'}
          </Button>
        </div>
        <div className="px-5 pb-5">
          {summary ? (
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
              {summary.split('\n').map((paragraph, index) => (
                <p key={index} className="whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-300">
              No summary yet. Click “Update summary” to generate one.
            </p>
          )}
          {noteSuggestionMessage ? (
            <p className="mt-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {noteSuggestionMessage}
            </p>
          ) : null}
          {noteSuggestionLoading ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
              Preparing recommended brand notes from the latest summary…
            </div>
          ) : null}
          {noteSuggestions.length ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Recommended brand notes
              </p>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {noteSuggestions.map((note) => {
                  const resolvedId = note.id || note.title || 'note';
                  const isSaving = savingSuggestedNoteId === resolvedId;
                  return (
                    <div
                      key={resolvedId}
                      className="flex h-full flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar)] dark:text-gray-200"
                    >
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Primary focus
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{note.focus}</p>
                        {note.title ? (
                          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{note.title}</h3>
                        ) : null}
                      </div>
                      <div
                        className="prose prose-sm max-w-none flex-1 text-gray-700 dark:text-gray-200 dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="accent"
                          size="sm"
                          onClick={() => handleSaveSuggestedNote(note)}
                          disabled={(Boolean(savingSuggestedNoteId) && !isSaving) || !brandId}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          variant="neutral"
                          size="sm"
                          onClick={() => handleDismissSuggestedNote(resolvedId)}
                          disabled={Boolean(savingSuggestedNoteId)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {!noteSuggestions.length && noteSuggestionError && !noteSuggestionLoading ? (
            <p className="mt-4 text-sm text-red-600">{noteSuggestionError}</p>
          ) : null}
          {summaryError ? (
            <p className="mt-3 text-sm text-red-600">{summaryError}</p>
          ) : null}
        </div>
      </div>
      <FeedbackPanel entries={entries} loading={loading} />
    </div>
  );
};

export default BrandFeedback;
