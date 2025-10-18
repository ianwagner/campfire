import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { FiAlertTriangle, FiBookOpen, FiMessageCircle, FiTarget, FiType } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';

const BrandTone = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');

  const [voice, setVoice] = useState('');
  const [phrasing, setPhrasing] = useState('');
  const [wordBank, setWordBank] = useState('');
  const [noGos, setNoGos] = useState('');
  const [ctaStyle, setCtaStyle] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!propId && !propCode) {
      setBrandCode(brandCodes[0] || '');
    }
  }, [brandCodes, propId, propCode]);

  useEffect(() => {
    const load = async () => {
      try {
        if (propId) {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            setBrandId(propId);
            const data = snap.data();
            setBrandCode(data.code || propCode);
            setVoice(data.voice || '');
            setPhrasing(data.phrasing || '');
            setWordBank(Array.isArray(data.wordBank) ? data.wordBank.join(', ') : '');
            setNoGos(Array.isArray(data.noGos) ? data.noGos.join(', ') : '');
            setCtaStyle(data.ctaStyle || '');
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setVoice(data.voice || '');
            setPhrasing(data.phrasing || '');
            setWordBank(Array.isArray(data.wordBank) ? data.wordBank.join(', ') : '');
            setNoGos(Array.isArray(data.noGos) ? data.noGos.join(', ') : '');
            setCtaStyle(data.ctaStyle || '');
          }
        }
        setDirty(false);
        setMessage('');
        setMessageType('info');
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    setMessageType('info');
    try {
      const wordBankArr = wordBank
        .split(/[\n,]/)
        .map((w) => w.trim())
        .filter(Boolean);
      const noGosArr = noGos
        .split(/[\n,]/)
        .map((w) => w.trim())
        .filter(Boolean);
      const toneOfVoice = `---\nWrite in a tone that is: ${voice}.\nUse phrasing that is: ${phrasing}.\nIncorporate brand-specific words when possible: ${wordBankArr.join(', ')}.\nAvoid the following language or style: ${noGosArr.join(', ')}.\nCTAs should follow this style: ${ctaStyle}.\n---`;

      await setDoc(
        doc(db, 'brands', brandId),
        { voice, phrasing, wordBank: wordBankArr, noGos: noGosArr, ctaStyle, toneOfVoice },
        { merge: true }
      );
      setMessage('Tone settings saved');
      setMessageType('success');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save tone settings', err);
      setMessage('Failed to save tone settings');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const preview = useMemo(
    () =>
      [
        '---',
        `Write in a tone that is: ${voice || '…'}.`,
        `Use phrasing that is: ${phrasing || '…'}.`,
        `Incorporate brand-specific words when possible: ${wordBank || '…'}.`,
        `Avoid the following language or style: ${noGos || '…'}.`,
        `CTAs should follow this style: ${ctaStyle || '…'}.`,
        '---',
      ].join('\n'),
    [voice, phrasing, wordBank, noGos, ctaStyle]
  );

  useUnsavedChanges(dirty, handleSave);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Tone of Voice System</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Keep copywriters, strategists, and AI prompts aligned with a single source of truth for the brand voice.
            </p>
          </div>
          <SaveButton
            form="tone-form"
            type="submit"
            canSave={dirty && !loading}
            loading={loading}
          />
        </div>

        <form
          id="tone-form"
          onSubmit={handleSave}
          className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]"
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="mb-4 flex items-center gap-2 text-gray-800 dark:text-[var(--dark-text)]">
                <FiMessageCircle className="text-[var(--accent-color)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Voice &amp; Personality</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Voice" className="space-y-2">
                  <div className="space-y-2">
                    <textarea
                      value={voice}
                      onChange={(e) => {
                        setVoice(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Confident, warm, and energetic with a conversational tone."
                      className="h-32 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Summarize the brand personality in a sentence or two.
                    </p>
                  </div>
                </FormField>
                <FormField label="Phrasing" className="space-y-2">
                  <div className="space-y-2">
                    <textarea
                      value={phrasing}
                      onChange={(e) => {
                        setPhrasing(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Short, punchy sentences with playful metaphors and inclusive language."
                      className="h-32 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Describe sentence structure, rhythm, and any signature expressions.
                    </p>
                  </div>
                </FormField>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="mb-4 flex items-center gap-2 text-gray-800 dark:text-[var(--dark-text)]">
                <FiAlertTriangle className="text-[var(--accent-color)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Language Guardrails</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Word Bank" className="space-y-2">
                  <div className="space-y-2">
                    <textarea
                      value={wordBank}
                      onChange={(e) => {
                        setWordBank(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="spark, ignite, members, playbook"
                      className="h-28 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enter keywords separated by commas or line breaks.
                    </p>
                  </div>
                </FormField>
                <FormField label="No-Go Language" className="space-y-2">
                  <div className="space-y-2">
                    <textarea
                      value={noGos}
                      onChange={(e) => {
                        setNoGos(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="corporate buzzwords, fear-based messaging, hard-sell tactics"
                      className="h-28 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      List phrases, tones, or topics to avoid.
                    </p>
                  </div>
                </FormField>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="mb-4 flex items-center gap-2 text-gray-800 dark:text-[var(--dark-text)]">
                <FiTarget className="text-[var(--accent-color)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Call-to-Action Style</h3>
              </div>
              <FormField label="CTA Style" className="space-y-2">
                <div className="space-y-2">
                  <textarea
                    value={ctaStyle}
                    onChange={(e) => {
                      setCtaStyle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Use clear, energetic verbs with an emphasis on community participation (e.g., “Join the next session”)."
                    className="h-32 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Share the structure and energy level you expect from calls to action.
                  </p>
                </div>
              </FormField>
            </div>

            {message ? (
              <div
                role={messageType === 'error' ? 'alert' : 'status'}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  messageType === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                }`}
              >
                {message}
              </div>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="mb-3 flex items-center gap-2 text-gray-800 dark:text-[var(--dark-text)]">
                <FiType className="text-[var(--accent-color)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">AI Prompt Preview</h3>
              </div>
              <p className="mb-3 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Generated prompt
              </p>
              <pre className="whitespace-pre-wrap rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-[var(--dark-text)]">
                {preview}
              </pre>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
              <div className="mb-3 flex items-center gap-2 text-gray-800 dark:text-[var(--dark-text)]">
                <FiBookOpen className="text-[var(--accent-color)]" aria-hidden="true" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">How to Use This Tab</h3>
              </div>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
                  <span>Reference this hub before writing campaigns or replying in the helpdesk to keep the brand voice consistent.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
                  <span>Drop in new keywords from product launches so the AI prompt stays up to date.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--accent-color)]" aria-hidden="true" />
                  <span>Document tone guardrails here instead of scattered notes—everyone sees the same guidance.</span>
                </li>
              </ul>
            </div>
          </aside>
        </form>
      </section>
    </div>
  );
};

export default BrandTone;
