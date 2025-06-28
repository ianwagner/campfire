import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { uploadBrandAsset } from './uploadBrandAsset';

const emptyLogo = { url: '', file: null };
const emptyFont = { type: 'google', value: '', file: null };

const AdminBrandDetail = () => {
  const { id } = useParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [offering, setOffering] = useState('');
  const [guidelines, setGuidelines] = useState({ url: '', file: null });
  const [logos, setLogos] = useState([{ ...emptyLogo }]);
  const [palette, setPalette] = useState(['#000000']);
  const [fonts, setFonts] = useState([{ ...emptyFont }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'brands', id));
        if (snap.exists()) {
          const data = snap.data();
          setCode(data.code || '');
          setName(data.name || '');
          setAgencyId(data.agencyId || '');
          setToneOfVoice(data.toneOfVoice || '');
          setOffering(data.offering || '');
          setGuidelines({ url: data.guidelinesUrl || '', file: null });
          setLogos(
            Array.isArray(data.logos) && data.logos.length
              ? data.logos.map((u) => ({ url: u, file: null }))
              : [{ ...emptyLogo }]
          );
          setPalette(
            Array.isArray(data.palette) && data.palette.length
              ? data.palette
              : ['#000000']
          );
          setFonts(
            Array.isArray(data.fonts) && data.fonts.length
              ? data.fonts.map((f) => ({ type: f.type || 'google', value: f.value || '', file: null }))
              : [{ ...emptyFont }]
          );
        }
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [id]);

  const updateLogoFile = (idx, file) => {
    setLogos((prev) =>
      prev.map((l, i) =>
        i === idx ? { url: file ? URL.createObjectURL(file) : l.url, file } : l
      )
    );
  };

  const updateFont = (idx, changes) => {
    setFonts((prev) => prev.map((f, i) => (i === idx ? { ...f, ...changes } : f)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setMessage('');
    try {
      let guidelinesUrl = guidelines.url;
      const brandCode = code.trim();
      if (guidelines.file) {
        guidelinesUrl = await uploadBrandAsset(
          guidelines.file,
          brandCode,
          'guidelines'
        );
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
        if (f.type === 'custom' && f.file) {
          const url = await uploadBrandAsset(f.file, brandCode, 'fonts');
          fontData.push({ type: 'custom', value: url });
        } else if (f.type === 'custom' && f.value) {
          fontData.push({ type: 'custom', value: f.value });
        } else if (f.type === 'google' && f.value) {
          fontData.push({ type: 'google', value: f.value });
        }
      }
      await updateDoc(doc(db, 'brands', id), {
        code: brandCode,
        name: name.trim(),
        agencyId: agencyId.trim(),
        toneOfVoice: toneOfVoice.trim(),
        offering: offering.trim(),
        guidelinesUrl,
        logos: logoUrls,
        palette,
        fonts: fontData,
      });
      setGuidelines({ url: guidelinesUrl, file: null });
      setLogos(logoUrls.map((u) => ({ url: u, file: null })));
      setFonts(fontData.map((f) => ({ ...f, file: null })));
      setMessage('Brand updated');
    } catch (err) {
      console.error('Failed to update brand', err);
      setMessage('Failed to update brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
      <h1 className="text-2xl mb-4">Edit Brand</h1>
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
        <div>
          <label className="block mb-1 text-sm font-medium">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Agency ID</label>
          <input
            type="text"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Tone of Voice</label>
          <input
            type="text"
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Offering</label>
          <input
            type="text"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Brand Guidelines (PDF)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) =>
              setGuidelines({ url: guidelines.url, file: e.target.files[0] || null })
            }
            className="w-full p-2 border rounded"
          />
          {guidelines.url && (
            <a
              href={guidelines.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline block mt-1"
            >
              Current file
            </a>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Logos</label>
          {logos.map((logo, idx) => (
            <div key={idx} className="mb-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => updateLogoFile(idx, e.target.files[0])}
                className="w-full p-2 border rounded"
              />
              {logo.url && (
                <img src={logo.url} alt="logo" className="mt-1 h-16 w-auto" />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLogos((p) => [...p, { ...emptyLogo }])}
            className="underline text-sm"
          >
            Add Logo
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Palette</label>
          {palette.map((color, idx) => (
            <div key={idx} className="flex items-center mb-2 space-x-2">
              <input
                type="color"
                value={color}
                onChange={(e) =>
                  setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)))
                }
                className="h-10 w-10 p-0 border rounded"
              />
              <input
                type="text"
                value={color}
                onChange={(e) =>
                  setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)))
                }
                className="w-24 p-1 border rounded"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPalette((p) => [...p, '#000000'])}
            className="underline text-sm"
          >
            Add Color
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Typefaces</label>
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
              )}
              {font.type === 'custom' && font.value && !font.file && (
                <a
                  href={font.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline block"
                >
                  Current file
                </a>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFonts((p) => [...p, { ...emptyFont }])}
            className="underline text-sm"
          >
            Add Typeface
          </button>
        </div>
        {message && <p className="text-sm text-center">{message}</p>}
        <button type="submit" className="w-full btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Brand'}
        </button>
      </form>
    </div>
  );
};

export default AdminBrandDetail;
