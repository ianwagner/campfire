import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { uploadBrandAsset } from './uploadBrandAsset';
import { deleteBrandAsset } from './deleteBrandAsset';
import PageWrapper from './components/PageWrapper.jsx';
import FormField from './components/FormField.jsx';
import useAgencies from './useAgencies';
import useSubscriptionPlans from './useSubscriptionPlans';

const emptyLogo = { url: '', file: null, description: '' };
const emptyFont = {
  type: 'google',
  value: '',
  name: '',
  file: null,
  role: '',
  rules: '',
};

const normalizeLogo = (entry = null) => {
  if (!entry) return { ...emptyLogo };
  if (typeof entry === 'string') {
    return { url: entry, file: null, description: '' };
  }
  return {
    url: entry.url || '',
    file: null,
    description: entry.description || '',
  };
};

const normalizeFont = (entry = null) => ({
  type: entry?.type || 'google',
  value: entry?.value || '',
  name: entry?.name || entry?.value || '',
  file: null,
  role: entry?.role || '',
  rules: entry?.rules || '',
});

const FONT_ROLE_OPTIONS = ['Heading', 'Subheading', 'Body', 'CTA', 'Misc.'];

const driveIdRegex = /^[\w-]{10,}$/;
const isValidDriveId = (id) => driveIdRegex.test(id);

const AdminBrandDetail = () => {
  const { id } = useParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [offering, setOffering] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [guidelines, setGuidelines] = useState({ url: '', file: null });
  const [logos, setLogos] = useState([{ ...emptyLogo }]);
  const [palette, setPalette] = useState(['#000000']);
  const [fonts, setFonts] = useState([{ ...emptyFont }]);
  const [notes, setNotes] = useState(['']);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState('');
  const [credits, setCredits] = useState(0);
  const [lastCreditReset, setLastCreditReset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { agencies } = useAgencies();
  const { plans } = useSubscriptionPlans();

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
          setDriveFolderId(data.driveFolderId || '');
          setGuidelines({ url: data.guidelinesUrl || '', file: null });
          setLogos(
            Array.isArray(data.logos) && data.logos.length
              ? data.logos.map((entry) => normalizeLogo(entry))
              : [{ ...emptyLogo }]
          );
          setPalette(
            Array.isArray(data.palette) && data.palette.length
              ? data.palette
              : ['#000000']
          );
          setFonts(
            Array.isArray(data.fonts) && data.fonts.length
              ? data.fonts.map((f) => normalizeFont(f))
              : [{ ...emptyFont }]
          );
          setNotes(Array.isArray(data.notes) && data.notes.length ? data.notes : ['']);
          setSubscriptionPlanId(data.subscriptionPlanId || '');
          setCredits(typeof data.credits === 'number' ? data.credits : 0);
          setLastCreditReset(data.lastCreditReset || null);
        }
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [id]);

  const selectedPlan = plans.find((p) => p.id === subscriptionPlanId);

  useEffect(() => {
    if (selectedPlan && !selectedPlan.isEnterprise) {
      setCredits(selectedPlan.monthlyCredits || 0);
    }
  }, [selectedPlan]);

  const updateLogoFile = (idx, file) => {
    setLogos((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              url: file ? URL.createObjectURL(file) : l.url,
              file,
            }
          : l
      )
    );
  };

  const updateLogoDescription = (idx, description) => {
    setLogos((prev) => prev.map((l, i) => (i === idx ? { ...l, description } : l)));
  };

  const updateFont = (idx, changes) => {
    setFonts((prev) => prev.map((f, i) => (i === idx ? { ...f, ...changes } : f)));
  };

  const handleDeleteLogo = async (idx) => {
    const logo = logos[idx];
    if (logo.url) {
      try {
        await deleteBrandAsset(logo.url);
        const updated = logos.filter((_, i) => i !== idx);
        setLogos(updated.length ? updated : [{ ...emptyLogo }]);
        if (id) {
          await updateDoc(doc(db, 'brands', id), {
            logos: updated
              .filter((l) => l.url)
              .map((l) => ({ url: l.url, description: (l.description || '').trim() })),
          });
        }
      } catch (err) {
        console.error('Failed to delete logo', err);
        setMessage('Failed to delete logo');
      }
    } else {
      const updated = logos.filter((_, i) => i !== idx);
      setLogos(updated.length ? updated : [{ ...emptyLogo }]);
    }
  };

  const handleDeleteFont = async (idx) => {
    const font = fonts[idx];
    try {
      if (font.type === 'custom' && font.value) {
        await deleteBrandAsset(font.value);
      }
      const updated = fonts.filter((_, i) => i !== idx);
      setFonts(updated.length ? updated : [{ ...emptyFont }]);
      if (id) {
        const fontData = updated
          .map((f) => {
            if (f.type === 'custom' && f.value) {
              return {
                type: 'custom',
                value: f.value,
                name: (f.name || '').trim(),
                role: f.role || '',
                rules: f.rules || '',
              };
            }
            if (f.type === 'google' && f.value) {
              return {
                type: 'google',
                value: f.value,
                name: (f.name || f.value || '').trim(),
                role: f.role || '',
                rules: f.rules || '',
              };
            }
            return null;
          })
          .filter(Boolean);
        await updateDoc(doc(db, 'brands', id), { fonts: fontData });
      }
    } catch (err) {
      console.error('Failed to delete font', err);
      setMessage('Failed to delete font');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id) return;
    setMessage('');
    const trimmedId = driveFolderId.trim();
    if (trimmedId && !isValidDriveId(trimmedId)) {
      setMessage('Drive folder ID is malformed');
      return;
    }
    setLoading(true);
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
      const logoEntries = [];
      for (const l of logos) {
        let url = l.url;
        if (l.file) {
          url = await uploadBrandAsset(l.file, brandCode, 'logos');
        }
        if (url) {
          logoEntries.push({
            url,
            description: (l.description || '').trim(),
          });
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
            fontData.push({
              type: 'custom',
              value: url,
              name: (f.name || '').trim(),
              role: f.role || '',
              rules: f.rules || '',
            });
          }
        } else if (f.type === 'google' && f.value) {
          fontData.push({
            type: 'google',
            value: f.value,
            name: (f.name || f.value || '').trim(),
            role: f.role || '',
            rules: f.rules || '',
          });
        }
      }
      await updateDoc(doc(db, 'brands', id), {
        code: brandCode,
        name: name.trim(),
        agencyId: agencyId.trim(),
        toneOfVoice: toneOfVoice.trim(),
        offering: offering.trim(),
        driveFolderId: driveFolderId.trim(),
        guidelinesUrl,
        logos: logoEntries,
        palette,
        fonts: fontData,
        notes,
        subscriptionPlanId: subscriptionPlanId || null,
        credits,
      });
      setGuidelines({ url: guidelinesUrl, file: null });
      setLogos(logoEntries.length ? logoEntries.map((entry) => ({ ...entry, file: null })) : [{ ...emptyLogo }]);
      setFonts(fontData.length ? fontData.map((f) => normalizeFont(f)) : [{ ...emptyFont }]);
      setMessage('Brand updated');
    } catch (err) {
      console.error('Failed to update brand', err);
      setMessage('Failed to update brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper title="Edit Brand" className="flex flex-col items-center">
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
        <FormField label="Code">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </FormField>
        <FormField label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </FormField>
        <FormField label="Agency ID">
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select agency</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </FormField>
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
        <FormField label="Drive Folder ID">
          <input
            type="text"
            value={driveFolderId}
            onChange={(e) => setDriveFolderId(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Optional Google Drive folder ID"
          />
          <p className="text-xs text-gray-600 mt-1">
            Optional. Use the ID from the folder's URL and share the folder with the service account to store uploaded ads.
          </p>
        </FormField>
        <FormField label="Brand Guidelines (PDF)">
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
        </FormField>
        <FormField label="Logos">
          {logos.map((logo, idx) => (
            <div key={idx} className="mb-2">
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => updateLogoFile(idx, e.target.files[0])}
                  className="w-full p-2 border rounded"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteLogo(idx)}
                  className="btn-action"
                >
                  Delete
                </button>
              </div>
              {logo.url && <img src={logo.url} alt="logo" className="mt-1 h-16 w-auto" />}
              <input
                type="text"
                value={logo.description}
                onChange={(e) => updateLogoDescription(idx, e.target.value)}
                className="mt-2 w-full p-2 border rounded"
                placeholder="Describe how to use this logo"
              />
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
                  onChange={(e) => updateFont(idx, { value: e.target.value, name: e.target.value })}
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
                <a
                  href={font.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline block"
                >
                  Current file
                </a>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600" htmlFor={`admin-font-role-${idx}`}>
                    Usage
                  </label>
                  <select
                    id={`admin-font-role-${idx}`}
                    value={font.role}
                    onChange={(e) => updateFont(idx, { role: e.target.value })}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select usage</option>
                    {FONT_ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-600" htmlFor={`admin-font-rules-${idx}`}>
                    Usage rules
                  </label>
                  <textarea
                    id={`admin-font-rules-${idx}`}
                    value={font.rules}
                    onChange={(e) => updateFont(idx, { rules: e.target.value })}
                    className="w-full rounded border p-2"
                    rows={2}
                    placeholder="Kerning, leading, line height, etc."
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteFont(idx)}
                className="btn-action"
              >
                Delete
              </button>
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
        <FormField label="Brand Notes">
          {notes.map((note, idx) => (
            <div key={idx} className="flex items-start mb-2 gap-2">
              <textarea
                className="w-full p-2 border rounded"
                value={note}
                onChange={(e) =>
                  setNotes((p) => p.map((n, i) => (i === idx ? e.target.value : n)))
                }
              />
              <button
                type="button"
                onClick={() => setNotes((p) => p.filter((_, i) => i !== idx))}
                className="btn-action"
              >
                Delete
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setNotes((p) => [...p, ''])} className="btn-action mt-1">
            Add Note
          </button>
        </FormField>
        <FormField label="Subscription Plan">
          <select
            value={subscriptionPlanId}
            onChange={(e) => setSubscriptionPlanId(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Credits">
          <input
            type="number"
            value={credits}
            onChange={(e) =>
              setCredits(e.target.value === '' ? 0 : Number(e.target.value))
            }
            className="w-full p-2 border rounded"
            min="0"
            disabled={!selectedPlan?.isEnterprise}
          />
        </FormField>
        <FormField label="Last Credit Reset">
          <p className="p-2 border rounded bg-gray-100 dark:bg-gray-800">
            {lastCreditReset && lastCreditReset.toDate
              ? lastCreditReset.toDate().toLocaleString()
              : 'N/A'}
          </p>
        </FormField>
        {message && <p className="text-sm text-center">{message}</p>}
        <div className="text-right">
          <button type="submit" className="w-full btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Brand'}
          </button>
        </div>
      </form>
    </PageWrapper>
  );
};

export default AdminBrandDetail;
