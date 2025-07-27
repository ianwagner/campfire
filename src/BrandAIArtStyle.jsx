import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';

const BrandAIArtStyle = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [style, setStyle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [brandCode, propId, propCode]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'brands', brandId), { aiArtStyle: style }, { merge: true });
      setMessage('AI art style saved');
    } catch (err) {
      console.error('Failed to save AI art style', err);
      setMessage('Failed to save AI art style');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        <FormField label="AI Art Style">
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <SaveButton type="submit" canSave={!loading} loading={loading} />
        </div>
      </form>
    </PageWrapper>
  );
};

export default BrandAIArtStyle;
