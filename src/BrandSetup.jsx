import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import { uploadBrandAsset } from './uploadBrandAsset';
import { deleteBrandAsset } from './deleteBrandAsset';
import FormField from './components/FormField.jsx';
import SaveButton from './components/SaveButton.jsx';
import IconButton from './components/IconButton.jsx';
import { FiEdit2 } from 'react-icons/fi';
import BrandAssetsLayout from './BrandAssetsLayout.jsx';
import useUnsavedChanges from './useUnsavedChanges.js';
import ensurePublicDashboardSlug from './utils/ensurePublicDashboardSlug.js';

const driveIdRegex = /^[\w-]{10,}$/;
const isValidDriveId = (id) => driveIdRegex.test(id);

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

const BrandSetup = ({ brandId: propId = null, brandCode: propCode = '' }) => {
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const [brandId, setBrandId] = useState(propId);
  const [brandCode, setBrandCode] = useState(propCode || brandCodes[0] || '');
  const [guidelines, setGuidelines] = useState({ url: '', file: null });
  const [logos, setLogos] = useState([{ ...emptyLogo }]);
  const [palette, setPalette] = useState(['#000000']);
  const [fonts, setFonts] = useState([{ ...emptyFont }]);
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [offering, setOffering] = useState('');
  const [storeId, setStoreId] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publicDashboardSlug, setPublicDashboardSlug] = useState('');
  const [slugLoading, setSlugLoading] = useState(false);
  const [slugInitialized, setSlugInitialized] = useState(false);
  const { agencies } = useAgencies();

  useEffect(() => {
    if (!propId && !propCode) {
      setBrandCode(brandCodes[0] || '');
    }
  }, [brandCodes, propId, propCode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSlugInitialized(false);
      try {
        if (propId) {
          const snap = await getDoc(doc(db, 'brands', propId));
          if (snap.exists()) {
            setBrandId(propId);
            const data = snap.data();
            setBrandCode(data.code || propCode);
            setName(data.name || '');
            setAgencyId(data.agencyId || '');
            setOffering(data.offering || '');
            setStoreId(data.storeId || '');
            setDriveFolderId(data.driveFolderId || '');
            setGuidelines({ url: data.guidelinesUrl || '', file: null });
            setLogos(
              Array.isArray(data.logos) && data.logos.length
                ? data.logos.map((entry) => normalizeLogo(entry))
                : [{ ...emptyLogo }]
            );
            setPalette(
              Array.isArray(data.palette) && data.palette.length ? data.palette : ['#000000']
            );
            setFonts(
              Array.isArray(data.fonts) && data.fonts.length
                ? data.fonts.map((f) => normalizeFont(f))
                : [{ ...emptyFont }]
            );
            setPublicDashboardSlug((data.publicDashboardSlug || '').trim());
          }
        } else if (brandCode) {
          const q = query(collection(db, 'brands'), where('code', '==', brandCode));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const docData = snap.docs[0];
            setBrandId(docData.id);
            const data = docData.data();
            setBrandCode(data.code || brandCode);
            setName(data.name || '');
            setAgencyId(data.agencyId || '');
            setOffering(data.offering || '');
            setStoreId(data.storeId || '');
            setDriveFolderId(data.driveFolderId || '');
            setGuidelines({ url: data.guidelinesUrl || '', file: null });
            setLogos(
              Array.isArray(data.logos) && data.logos.length
                ? data.logos.map((entry) => normalizeLogo(entry))
                : [{ ...emptyLogo }]
            );
            setPalette(
              Array.isArray(data.palette) && data.palette.length ? data.palette : ['#000000']
            );
            setFonts(
              Array.isArray(data.fonts) && data.fonts.length
                ? data.fonts.map((f) => normalizeFont(f))
                : [{ ...emptyFont }]
            );
            setPublicDashboardSlug((data.publicDashboardSlug || '').trim());
          }
        }
        if (!cancelled) {
          setDirty(false);
        }
      } catch (err) {
        console.error('Failed to load brand', err);
      } finally {
        if (!cancelled) {
          setSlugInitialized(true);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [brandCode, propId, propCode]);

  useEffect(() => {
    const trimmed = (publicDashboardSlug || '').trim();
    if (!brandId || !slugInitialized || trimmed) return undefined;
    let cancelled = false;
    const ensureSlug = async () => {
      setSlugLoading(true);
      try {
        const slug = await ensurePublicDashboardSlug(db, brandId, trimmed);
        if (!cancelled) {
          setPublicDashboardSlug(slug);
        }
      } catch (err) {
        console.error('Failed to assign public dashboard slug', err);
      } finally {
        if (!cancelled) {
          setSlugLoading(false);
        }
      }
    };
    ensureSlug();
    return () => {
      cancelled = true;
    };
  }, [brandId, publicDashboardSlug, slugInitialized]);

  const dashboardUrl = useMemo(() => {
    if (!publicDashboardSlug) return '';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/${publicDashboardSlug}`;
    }
    return `/${publicDashboardSlug}`;
  }, [publicDashboardSlug]);

  const renderDashboardUrlField = (className = '') => (
    <FormField label="Public Dashboard URL" className={className}>
      <input
        type="text"
        value={dashboardUrl}
        readOnly
        onFocus={(e) => e.target.select()}
        className="w-full p-2 border rounded bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        placeholder={slugLoading ? 'Generating link…' : 'Link not available yet'}
      />
      {publicDashboardSlug ? (
        <p className="text-xs text-gray-600 mt-1 dark:text-gray-400">
          Share this read-only link with partners to give them access to the public dashboard.
        </p>
      ) : (
        <p className="text-xs text-gray-600 mt-1 dark:text-gray-400">
          {slugLoading
            ? 'Generating a shareable dashboard link…'
            : 'A shareable dashboard link will appear here once it is ready.'}
        </p>
      )}
    </FormField>
  );

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!brandId) return;
    setLoading(true);
    setMessage('');
    const trimmedId = driveFolderId.trim();
    if (trimmedId && !isValidDriveId(trimmedId)) {
      setMessage('Drive folder ID is malformed');
      setLoading(false);
      return;
    }
    try {
      let guidelinesUrl = guidelines.url;
      if (guidelines.file) {
        guidelinesUrl = await uploadBrandAsset(guidelines.file, brandCode, 'guidelines');
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
      await setDoc(
        doc(db, 'brands', brandId),
        {
          name: name.trim(),
          agencyId: agencyId.trim(),
          guidelinesUrl,
          logos: logoEntries,
          palette,
          fonts: fontData,
          offering,
          storeId: storeId.trim(),
          driveFolderId: trimmedId,
        },
        { merge: true }
      );
      setGuidelines({ url: guidelinesUrl, file: null });
      setLogos(logoEntries.length ? logoEntries.map((entry) => ({ ...entry, file: null })) : [{ ...emptyLogo }]);
      setFonts(fontData.length ? fontData.map((f) => normalizeFont(f)) : [{ ...emptyFont }]);
      setDriveFolderId(trimmedId);
      setStoreId(storeId.trim());
      setMessage('Brand assets saved');
      setDirty(false);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save brand', err);
      setMessage('Failed to save brand');
    } finally {
      setLoading(false);
    }
  };

  const updateLogoFile = (idx, file) => {
    setLogos((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              url: file ? URL.createObjectURL(file) : l.url,
              file,
            }
          : l,
      )
    );
    setDirty(true);
  };

  const updateLogoDescription = (idx, description) => {
    setLogos((prev) => prev.map((l, i) => (i === idx ? { ...l, description } : l)));
    setDirty(true);
  };
  const updateFont = (idx, changes) => {
    setFonts((prev) => prev.map((f, i) => (i === idx ? { ...f, ...changes } : f)));
    setDirty(true);
  };

  const handleDeleteLogo = async (idx) => {
    const logo = logos[idx];
    if (logo.url) {
      try {
        await deleteBrandAsset(logo.url);
        const updated = logos.filter((_, i) => i !== idx);
        setLogos(updated.length ? updated : [{ ...emptyLogo }]);
        if (brandId) {
          await updateDoc(doc(db, 'brands', brandId), {
            logos: updated
              .filter((l) => l.url)
              .map((l) => ({ url: l.url, description: (l.description || '').trim() })),
          });
        }
        setDirty(true);
      } catch (err) {
        console.error('Failed to delete logo', err);
        setMessage('Failed to delete logo');
      }
    } else {
      const updated = logos.filter((_, i) => i !== idx);
      setLogos(updated.length ? updated : [{ ...emptyLogo }]);
      setDirty(true);
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
      if (brandId) {
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
        await updateDoc(doc(db, 'brands', brandId), { fonts: fontData });
      }
      setDirty(true);
    } catch (err) {
      console.error('Failed to delete font', err);
      setMessage('Failed to delete font');
    }
  };

  useUnsavedChanges(dirty, handleSave);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Brand Setup</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Manage core brand details, assets, and guidelines for the team.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {editing ? (
              <SaveButton
                form="brand-form"
                type="submit"
                canSave={dirty && !loading}
                loading={loading}
              />
            ) : (
              <IconButton aria-label="Edit" onClick={() => setEditing(true)}>
                <FiEdit2 />
              </IconButton>
            )}
          </div>
        </div>
        <div className="mt-6">
          {editing ? (
            <form id="brand-form" onSubmit={handleSave} className="space-y-6 max-w-2xl">
            <h2 className="text-xl mb-2">General Information</h2>
            <FormField label="Brand Name">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Agency">
              <select
                value={agencyId}
                onChange={(e) => {
                  setAgencyId(e.target.value);
                  setDirty(true);
                }}
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
            <FormField label="Offering">
              <input
                type="text"
                value={offering}
                onChange={(e) => {
                  setOffering(e.target.value);
                  setDirty(true);
                }}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Store ID">
              <input
                type="text"
                value={storeId}
                onChange={(e) => {
                  setStoreId(e.target.value);
                  setDirty(true);
                }}
                className="w-full p-2 border rounded"
              />
            </FormField>
            <FormField label="Drive Folder ID">
              <input
                type="text"
                value={driveFolderId}
                onChange={(e) => {
                  setDriveFolderId(e.target.value);
                  setDirty(true);
                }}
                className="w-full p-2 border rounded"
                placeholder="Optional Google Drive folder ID"
              />
              <p className="text-xs text-gray-600 mt-1">
                Optional. Use the ID from the folder's URL and share the folder with the service account to store uploaded ads.
              </p>
            </FormField>
            {renderDashboardUrlField()}
            <h2 className="text-xl mb-2">Brand Assets</h2>
            <FormField label="Brand Guidelines (PDF)">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  setGuidelines({ url: guidelines.url, file: e.target.files[0] || null });
                  setDirty(true);
                }}
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
                onClick={() => {
                  setLogos((p) => [...p, { ...emptyLogo }]);
                  setDirty(true);
                }}
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
                    onChange={(e) => {
                      setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)));
                      setDirty(true);
                    }}
                    className="h-10 w-10 p-0 border rounded"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => {
                      setPalette((p) => p.map((c, i) => (i === idx ? e.target.value : c)));
                      setDirty(true);
                    }}
                    className="w-24 p-1 border rounded"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPalette((p) => p.filter((_, i) => i !== idx));
                      setDirty(true);
                    }}
                    className="btn-action"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPalette((p) => [...p, '#000000']);
                  setDirty(true);
                }}
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
                <a href={font.value} target="_blank" rel="noopener noreferrer" className="text-sm underline block">
                  Current file
                </a>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600" htmlFor={`font-role-${idx}`}>
                    Usage
                  </label>
                  <select
                    id={`font-role-${idx}`}
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
                  <label className="text-xs font-medium text-gray-600" htmlFor={`font-rules-${idx}`}>
                    Usage rules
                  </label>
                  <textarea
                    id={`font-rules-${idx}`}
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
            onClick={() => {
              setFonts((p) => [...p, { ...emptyFont }]);
              setDirty(true);
            }}
            className="btn-action mt-1"
          >
            Add Typeface
          </button>
        </FormField>
        {message && <p className="text-sm">{message}</p>}
      </form>
      ) : (
        <div className="space-y-6">
          {renderDashboardUrlField('max-w-2xl')}
          <BrandAssetsLayout
            brandCode={brandCode}
            guidelinesUrl={guidelines.url}
          />
        </div>
      )}
        </div>
      </section>
    </div>
  );
};

export default BrandSetup;
