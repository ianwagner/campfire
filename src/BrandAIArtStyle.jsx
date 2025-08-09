import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';

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
    <PageWrapper>
      <div className="flex justify-end mb-2">
        <SaveButton
          form="ai-form"
          type="submit"
          canSave={dirty && !loading}
          loading={loading}
        />
      </div>
      <form id="ai-form" onSubmit={handleSave} className="space-y-4 max-w-md">
        <FormField label="AI Art Style">
          <textarea
            value={style}
            onChange={(e) => {
              setStyle(e.target.value);
              setDirty(true);
            }}
            className="w-full p-2 border rounded"
          />
        </FormField>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </PageWrapper>
  );
};

export default BrandAIArtStyle;
