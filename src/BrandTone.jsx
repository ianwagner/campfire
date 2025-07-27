import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';

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
  const [loading, setLoading] = useState(false);

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
      const wordBankArr = wordBank
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      const noGosArr = noGos
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      const toneOfVoice = `---\nWrite in a tone that is: ${voice}.\nUse phrasing that is: ${phrasing}.\nIncorporate brand-specific words when possible: ${wordBankArr.join(', ')}.\nAvoid the following language or style: ${noGosArr.join(', ')}.\nCTAs should follow this style: ${ctaStyle}.\n---`;

      await setDoc(
        doc(db, 'brands', brandId),
        { voice, phrasing, wordBank: wordBankArr, noGos: noGosArr, ctaStyle, toneOfVoice },
        { merge: true }
      );
      setMessage('Tone settings saved');
    } catch (err) {
      console.error('Failed to save tone settings', err);
      setMessage('Failed to save tone settings');
    } finally {
      setLoading(false);
    }
  };

  const preview = `---\nWrite in a tone that is: ${voice}.\nUse phrasing that is: ${phrasing}.\nIncorporate brand-specific words when possible: ${wordBank}.\nAvoid the following language or style: ${noGos}.\nCTAs should follow this style: ${ctaStyle}.\n---`;

  return (
    <PageWrapper>
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        <FormField label="Voice">
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Phrasing">
          <textarea
            value={phrasing}
            onChange={(e) => setPhrasing(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Word Bank (comma separated)">
          <input
            type="text"
            value={wordBank}
            onChange={(e) => setWordBank(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="No-Go's (comma separated)">
          <input
            type="text"
            value={noGos}
            onChange={(e) => setNoGos(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="CTA Style">
          <textarea
            value={ctaStyle}
            onChange={(e) => setCtaStyle(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <SaveButton type="submit" canSave={!loading} loading={loading} />
        </div>
      </form>
      <div className="mt-6 p-4 border rounded bg-accent-10 text-sm whitespace-pre-wrap">
        {preview}
      </div>
    </PageWrapper>
  );
};

export default BrandTone;
