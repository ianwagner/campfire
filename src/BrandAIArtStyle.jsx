import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';

const inputClassName =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]';

const BrandAIArtStyle = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [style, setStyle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!propId && !propCode) setBrandCode(brandCodes[0] || '');
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
            setStyle(data.aiArtStyle || '');
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setStyle(data.aiArtStyle || '');
          }
        }
        setDirty(false);
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
    try {
      await setDoc(doc(db, 'brands', brandId), { aiArtStyle: style }, { merge: true });
      setMessage('AI art style saved');
      setDirty(false);
    } catch (err) {
      console.error('Failed to save AI art style', err);
      setMessage('Failed to save AI art style');
    } finally {
      setLoading(false);
    }
  };

  useUnsavedChanges(dirty, handleSave);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">AI Art Direction</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Document visual references, styles, and prompts that designers and AI tools should follow.
            </p>
          </div>
          <SaveButton
            form="ai-form"
            type="submit"
            canSave={dirty && !loading}
            loading={loading}
          />
        </div>

        <form
          id="ai-form"
          onSubmit={handleSave}
          className="mt-6 space-y-4"
        >
          <FormField label="AI Art Style" className="space-y-2">
            <textarea
              value={style}
              onChange={(e) => {
                setStyle(e.target.value);
                setDirty(true);
              }}
              className={`${inputClassName} h-48 resize-none`}
              placeholder="Describe the preferred art direction, reference artists, compositions, and color treatments."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Share visual cues that help prompt generators and illustrators stay on brand.
            </p>
          </FormField>
          {message && <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
        </form>
      </section>
    </div>
  );
};

export default BrandAIArtStyle;
