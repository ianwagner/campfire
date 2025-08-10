import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import SaveButton from './components/SaveButton.jsx';
import Table from './components/common/Table.jsx';
import Modal from './components/Modal.jsx';
import useHeadlineGuardrails from './useHeadlineGuardrails.js';

const emptyTemplate = {
  tone: '',
  season: '',
  line: '',
  weight: 50,
  enabled: true,
};

const DynamicHeadlineEditor = () => {
  const { typeId } = useParams();
  const [settings, setSettings] = useState({
    dynamic: true,
    fallback: '',
    rotate: false,
    useName: false,
  });
  const [templates, setTemplates] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filters, setFilters] = useState({ tone: '', season: '' });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [brands, setBrands] = useState([]);
  const [brandCode, setBrandCode] = useState('');
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [preview, setPreview] = useState([]);
  const { guardrails } = useHeadlineGuardrails();
  const displayName = auth.currentUser?.displayName;
  const firstName = displayName ? displayName.split(' ')[0] : '';

  useEffect(() => {
    const loadType = async () => {
      if (!typeId) return;
      try {
        const snap = await getDoc(doc(db, 'headlineTypes', typeId));
        if (snap.exists()) {
          const data = snap.data();
          setSettings({
            dynamic: !!data.dynamic,
            fallback: data.fallback || '',
            rotate: !!data.rotate,
            useName: !!data.useName,
          });
          setTemplates(Array.isArray(data.templates) ? data.templates : []);
        }
      } catch (err) {
        console.error('Failed to load headline type', err);
      } finally {
        setLoading(false);
      }
    };
    loadType();
  }, [typeId]);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };
    loadBrands();
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      if (!brandCode) {
        setProducts([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const prods = Array.isArray(data.products) ? data.products : [];
          setProducts(
            prods.map((p, idx) => ({
              id: `p-${idx}`,
              name: p.name,
              benefits: Array.isArray(p.benefits)
                ? p.benefits
                : typeof p.benefits === 'string'
                ? p.benefits
                    .split(/[;\n]+/)
                    .map((d) => d.trim())
                    .filter(Boolean)
                : [],
            }))
          );
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.error('Failed to load products', err);
        setProducts([]);
      }
    };
    loadProducts();
  }, [brandCode]);

  const handleTemplateChange = (idx, key, value) => {
    setTemplates((arr) => {
      const copy = [...arr];
      copy[idx] = { ...copy[idx], [key]: value };
      return copy;
    });
    setDirty(true);
  };

  const addTemplate = () => {
    setTemplates((arr) => [...arr, { ...emptyTemplate, id: Date.now() }]);
    setDirty(true);
  };

  const handleBulkAdd = () => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const additions = lines.map((line, idx) => ({
      ...emptyTemplate,
      id: `${Date.now()}-${idx}`,
      line,
    }));
    setTemplates((arr) => [...arr, ...additions]);
    setBulkText('');
    setBulkOpen(false);
    setDirty(true);
  };

  const filteredTemplates = templates.filter((t) => {
    return (
      (!filters.tone || t.tone === filters.tone) &&
      (!filters.season || t.season === filters.season)
    );
  });

  const hydrateTemplate = (tpl, name) => {
    let line = tpl.line;
    const brand = brands.find((b) => b.code === brandCode);
    const prod = products.find((p) => p.id === productId);
    if (line.includes('{brand}')) {
      if (!brand) return null;
      line = line.replace(/\{brand\}/g, brand.name || '');
    }
    if (line.includes('{product}')) {
      if (!prod) return null;
      line = line.replace(/\{product\}/g, prod.name || '');
    }
    if (line.includes('{benefit}')) {
      const ben = prod?.benefits?.[0];
      if (!ben) return null;
      line = line.replace(/\{benefit\}/g, ben);
    }
    if (line.includes('{name?}')) {
      line = line.replace(/\{name\?\}/g, settings.useName ? name : '');
    }
    return line.trim();
  };

  const checkGuardrails = (line, lastGreeting) => {
    const warns = [];
    const max = guardrails.maxLength || 60;
    if (line.length > max) warns.push(`Over ${max} characters`);
    if (!/[.!?]$/.test(line)) warns.push('Missing ending punctuation');
    if (guardrails.noExclamation && /!/.test(line)) {
      warns.push('Contains exclamation mark');
    }
    if (guardrails.noPrice && /(\$\s*\d|\d+%|percent|sale|discount|off)/i.test(line)) {
      warns.push('Contains price/discount language');
    }
    if (Array.isArray(guardrails.blocklist)) {
      guardrails.blocklist.forEach((w) => {
        if (w && line.toLowerCase().includes(w.toLowerCase())) {
          warns.push(`Contains blocked word: ${w}`);
        }
      });
    }
    let greeting = null;
    const match = line.match(/^(\w+)/);
    if (match) greeting = match[1].toLowerCase();
    if (
      guardrails.avoidRepeatGreeting &&
      lastGreeting &&
      greeting &&
      greeting === lastGreeting
    ) {
      warns.push('Repeats greeting');
    }
    return { warns, greeting };
  };

  const showVariations = () => {
    const active = templates.filter((t) => t.enabled);
    const lines = [];
    let lastGreeting = null;
    for (let i = 0; i < active.length && lines.length < 10; i++) {
      const hydrated = hydrateTemplate(active[i], firstName);
      if (hydrated) {
        const { warns, greeting } = checkGuardrails(hydrated, lastGreeting);
        lines.push({ text: hydrated, warnings: warns });
        lastGreeting = greeting;
      }
    }
    setPreview(lines);
  };

  const handleSave = async () => {
    if (!typeId) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'headlineTypes', typeId),
        {
          dynamic: settings.dynamic,
          fallback: settings.fallback,
          rotate: settings.rotate,
          useName: settings.useName,
          templates,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      setDirty(false);
    } catch (err) {
      console.error('Failed to save headlines', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-4">Loading...</p>;
  }

  return (
    <div className="dh-editor p-4">
      <div className="grid grid-cols-1 md:grid-cols-[250px_1fr_300px] gap-4">
        <div className="space-y-4">
          <h2 className="font-semibold">Settings</h2>
          <label className="block">
            <input
              type="checkbox"
              checked={settings.dynamic}
              onChange={(e) => {
                setSettings((s) => ({ ...s, dynamic: e.target.checked }));
                setDirty(true);
              }}
              className="mr-2"
            />
            Dynamic on/off
          </label>
          <div>
            <label className="block text-sm mb-1">Fallback line</label>
            <input
              type="text"
              value={settings.fallback}
              onChange={(e) => {
                setSettings((s) => ({ ...s, fallback: e.target.value }));
                setDirty(true);
              }}
              className="w-full p-1 border rounded"
            />
          </div>
          <div>
            <p className="text-sm mb-1">Rotate</p>
            <label className="mr-2">
              <input
                type="radio"
                name="rotate"
                checked={settings.rotate}
                onChange={() => {
                  setSettings((s) => ({ ...s, rotate: true }));
                  setDirty(true);
                }}
                className="mr-1"
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="rotate"
                checked={!settings.rotate}
                onChange={() => {
                  setSettings((s) => ({ ...s, rotate: false }));
                  setDirty(true);
                }}
                className="mr-1"
              />
              No
            </label>
          </div>
          <div>
            <p className="text-sm mb-1">Use name</p>
            <label className="mr-2">
              <input
                type="radio"
                name="usename"
                checked={settings.useName}
                onChange={() => {
                  setSettings((s) => ({ ...s, useName: true }));
                  setDirty(true);
                }}
                className="mr-1"
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="usename"
                checked={!settings.useName}
                onChange={() => {
                  setSettings((s) => ({ ...s, useName: false }));
                  setDirty(true);
                }}
                className="mr-1"
              />
              No
            </label>
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-2">Template Library</h2>
          <div className="flex gap-2 mb-2 flex-wrap">
            <select
              value={filters.tone}
              onChange={(e) => setFilters((f) => ({ ...f, tone: e.target.value }))}
              className="p-1 border rounded"
            >
              <option value="">All Tones</option>
              {[...new Set(templates.map((t) => t.tone).filter(Boolean))].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={filters.season}
              onChange={(e) => setFilters((f) => ({ ...f, season: e.target.value }))}
              className="p-1 border rounded"
            >
              <option value="">All Seasons</option>
              {[...new Set(templates.map((t) => t.season).filter(Boolean))].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {filteredTemplates.length === 0 ? (
            <p className="text-sm text-gray-500">No templates</p>
          ) : (
            <Table className="text-sm">
              <thead>
                <tr>
                  <th>Tone</th>
                  <th>Line</th>
                  <th>Weight</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((tpl, idx) => (
                  <tr key={tpl.id || idx}>
                    <td>
                      <select
                        value={tpl.tone}
                        onChange={(e) => handleTemplateChange(idx, 'tone', e.target.value)}
                        className="p-1 border rounded"
                      >
                        <option value="">-</option>
                        <option value="default">Default</option>
                        <option value="friendly">Friendly</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={tpl.line}
                        onChange={(e) => handleTemplateChange(idx, 'line', e.target.value)}
                        className="w-full p-1 border rounded"
                        placeholder="Headline with {brand} {product} {benefit} {name?}"
                      />
                    </td>
                    <td className="w-32">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={tpl.weight}
                        onChange={(e) => handleTemplateChange(idx, 'weight', Number(e.target.value))}
                      />
                      <div className="text-center text-xs">{tpl.weight}</div>
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={tpl.enabled}
                        onChange={(e) => handleTemplateChange(idx, 'enabled', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="flex gap-2 mt-2">
            <button className="btn-secondary" onClick={addTemplate}>
              Add Template
            </button>
            <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
              Bulk Add
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">Preview</h2>
          <select
            value={brandCode}
            onChange={(e) => {
              setBrandCode(e.target.value);
              setProductId('');
            }}
            className="w-full p-1 border rounded"
          >
            <option value="">Select Brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full p-1 border rounded"
          >
            <option value="">Select Product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary w-full" onClick={showVariations}>
            Show 10 variations
          </button>
          {preview.length === 0 ? (
            <p className="text-sm text-gray-500">No preview</p>
          ) : (
            <ul className="space-y-2 overflow-y-auto max-h-96 pr-2">
              {preview.map((p, idx) => (
                <li key={idx} className="border p-1 rounded">
                  <div>{p.text}</div>
                  {p.warnings.length > 0 && (
                    <ul className="text-xs text-red-600 list-disc pl-4">
                      {p.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <SaveButton
        onClick={handleSave}
        canSave={dirty && !saving}
        loading={saving}
        className="fixed bottom-4 right-4"
      />
      {bulkOpen && (
        <Modal>
          <h2 className="text-lg mb-2">Bulk Add Templates</h2>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full h-40 p-1 border rounded mb-2"
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleBulkAdd}>
              Add
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DynamicHeadlineEditor;
