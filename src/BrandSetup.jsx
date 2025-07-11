import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import { uploadBrandAsset } from './uploadBrandAsset';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';

const emptyLogo = { url: '', file: null };
const emptyFont = { type: 'google', value: '', name: '', file: null };

const BrandSetup = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [guidelines, setGuidelines] = useState({ url: '', file: null });
  const [logos, setLogos] = useState([ { ...emptyLogo } ]);
  const [palette, setPalette] = useState(['#000000']);
  const [fonts, setFonts] = useState([ { ...emptyFont } ]);
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [offering, setOffering] = useState('');
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
            setToneOfVoice(data.toneOfVoice || '');
            setOffering(data.offering || '');
            setGuidelines({ url: data.guidelinesUrl || '', file: null });
            setLogos(
              Array.isArray(data.logos) && data.logos.length
                ? data.logos.map((u) => ({ url: u, file: null }))
                : [{ ...emptyLogo }]
            );
            setPalette(
              Array.isArray(data.palette) && data.palette.length ? data.palette : ['#000000']
            );
            setFonts(
              Array.isArray(data.fonts) && data.fonts.length
                ? data.fonts.map((f) => ({
                    type: f.type || 'google',
                    value: f.value || '',
                    name: f.name || '',
                    file: null,
                  }))
                : [{ ...emptyFont }]
            );
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setToneOfVoice(data.toneOfVoice || '');
            setOffering(data.offering || '');
            setGuidelines({ url: data.guidelinesUrl || '', file: null });
            setLogos(
              Array.isArray(data.logos) && data.logos.length
                ? data.logos.map((u) => ({ url: u, file: null }))
                : [{ ...emptyLogo }]
            );
            setPalette(
              Array.isArray(data.palette) && data.palette.length ? data.palette : ['#000000']
            );
            setFonts(
              Array.isArray(data.fonts) && data.fonts.length
                ? data.fonts.map((f) => ({
                    type: f.type || 'google',
                    value: f.value || '',
                    name: f.name || '',
                    file: null,
                  }))
                : [{ ...emptyFont }]
            );
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
      let guidelinesUrl = guidelines.url;
      if (guidelines.file) {
        guidelinesUrl = await uploadBrandAsset(guidelines.file, brandCode, 'guidelines');
      }
      const logoUrls = [];
      for (const l of logos) {
        if (l.file) {
          const url = await uploadBrandAsset(l.file, brandCode, 'logos');
          logoUrls.push(url);
        } else if (l.url) {
          logoUrls.push(l.url);
        }
      }
      const fontData = [];
      for (const f of fonts) {
        if (f.type === 'custom') {
          let url = f.value;
          if (f.file) {
            url = await uploadBrandAsset(f.file, brandCode, 'fonts');
          }
          if (url) {
            fontData.push({ type: 'custom', value: url, name: f.name || '' });
          }
        } else if (f.type === 'google' && f.value) {
          fontData.push({ type: 'google', value: f.value });
        }
      }
      await setDoc(
        doc(db, 'brands', brandId),
        { guidelinesUrl, logos: logoUrls, palette, fonts: fontData, toneOfVoice, offering },
        { merge: true }
      );
      setGuidelines({ url: guidelinesUrl, file: null });
      setLogos(logoUrls.map((u) => ({ url: u, file: null })));
      setFonts(fontData.map((f) => ({ ...f, file: null })));
      setMessage('Brand assets saved');
    } catch (err) {
      console.error('Failed to save brand', err);
      setMessage('Failed to save brand');
    } finally {
      setLoading(false);
    }
  };

  const updateLogoFile = (idx, file) => {
    setLogos((prev) => prev.map((l, i) => (i === idx ? { url: file ? URL.createObjectURL(file) : l.url, file } : l)));
  };
  const updateFont = (idx, changes) => {
    setFonts((prev) => prev.map((f, i) => (i === idx ? { ...f, ...changes } : f)));
  };

  return (
    <PageWrapper title="Brand Setup">
      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        <FormField label="Tone of Voice">
          <input
            type="text"
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Offering">
          <input
            type="text"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Brand Guidelines (PDF)">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setGuidelines({ url: guidelines.url, file: e.target.files[0] || null })}
            className="w-full p-2 border rounded"
          />
          {guidelines.url && (
            <a href={guidelines.url} target="_blank" rel="noopener noreferrer" className="text-sm underline block mt-1">
              Current file
            </a>
          )}
        </FormField>
        <FormField label="Logos">
          {logos.map((logo, idx) => (
            <div key={idx} className="mb-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => updateLogoFile(idx, e.target.files[0])}
                className="w-full p-2 border rounded"
              />
              {logo.url && <img src={logo.url} alt="logo" className="mt-1 h-16 w-auto" />}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLogos((p) => [...p, { ...emptyLogo }])}
            className="btn-action mt-1"
          >
            Add Logo
          </button>
        </FormField>
        <FormField label="Palette">
          {palette.map((color, idx) => (
            <div key={idx} className="flex items-center mb-2 space-x-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)))}
                className="h-10 w-10 p-0 border rounded"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)))}
                className="w-24 p-1 border rounded"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPalette((p) => [...p, '#000000'])}
            className="btn-action mt-1"
          >
            Add Color
          </button>
        </FormField>
        <FormField label="Typefaces">
          {fonts.map((font, idx) => (
            <div key={idx} className="mb-2 space-y-1">
              <select
                value={font.type}
                onChange={(e) => updateFont(idx, { type: e.target.value })}
                className="p-1 border rounded mr-2"
              >
                <option value="google">Google Font</option>
                <option value="custom">Custom</option>
              </select>
              {font.type === 'google' ? (
                <input
                  type="text"
                  value={font.value}
                  placeholder="Font Name"
                  onChange={(e) => updateFont(idx, { value: e.target.value })}
                  className="w-full p-2 border rounded"
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={font.name}
                    placeholder="Font Name"
                    onChange={(e) => updateFont(idx, { name: e.target.value })}
                    className="w-full p-2 border rounded"
                  />
                  <input
                    type="file"
                    onChange={(e) =>
                      updateFont(idx, {
                        file: e.target.files[0],
                        value: e.target.files[0]
                          ? URL.createObjectURL(e.target.files[0])
                          : font.value,
                      })
                    }
                    className="w-full p-2 border rounded"
                  />
                </>
              )}
              {font.type === 'custom' && font.value && !font.file && (
                <a href={font.value} target="_blank" rel="noopener noreferrer" className="text-sm underline block">
                  Current file
                </a>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFonts((p) => [...p, { ...emptyFont }])}
            className="btn-action mt-1"
          >
            Add Typeface
          </button>
        </FormField>
        {message && <p className="text-sm">{message}</p>}
        <div className="text-right">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Assets'}
          </button>
        </div>
      </form>
    </PageWrapper>
  );
};

export default BrandSetup;
