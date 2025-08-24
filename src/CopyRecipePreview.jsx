import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import TagInput from './components/TagInput.jsx';
import { FiEdit2, FiTrash, FiCheck, FiLink } from 'react-icons/fi';
import RecipeTypeCard from './components/RecipeTypeCard.jsx';
import selectRandomOption from './utils/selectRandomOption.js';

const CopyRecipePreview = ({
  onSave = null,
  initialResults = null,
  showOnlyResults = false,
  brandCode: initialBrandCode = '',
  hideBrandSelect = false,
  onCopyClick = null,
  onCopiesChange = null,
  showSave = !showOnlyResults,
}) => {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [copies, setCopies] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [brandCode, setBrandCode] = useState(initialBrandCode);
  const [brandProducts, setBrandProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [formData, setFormData] = useState({});

  const isUrl = (str) => /^https?:\/\//i.test(str);

  useEffect(() => {
    if (typeof onCopiesChange === 'function') {
      onCopiesChange(copies);
    }
  }, [copies, onCopiesChange]);

  useEffect(() => {
    if (initialResults && Array.isArray(initialResults)) {
      setCopies(
        initialResults.map((c) => ({
          id: c.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          primary: c.primary || '',
          headline: c.headline || '',
          description: c.description || '',
          editing: false,
        }))
      );
    }
  }, [initialResults]);

  useEffect(() => {
    if (initialBrandCode) {
      setBrandCode(initialBrandCode);
    }
  }, [initialBrandCode]);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const snap = await getDocs(collection(db, 'copyRecipeTypes'));
        setTypes(
          snap.docs.map((d) => ({ id: d.id, writeInFields: [], ...d.data() }))
        );
      } catch (err) {
        console.error('Failed to fetch copy recipe types', err);
        setTypes([]);
      }
    };
    fetchTypes();
  }, []);

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
        setBrandProducts([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const prods = Array.isArray(data.products) ? data.products : [];
          setBrandProducts(
            prods.map((p, idx) => ({
              id: `p-${idx}`,
              name: p.name,
              values: {
                name: p.name,
                description: Array.isArray(p.description)
                  ? p.description
                  : typeof p.description === 'string'
                  ? p.description
                      .split(/[;\n]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                  : [],
                benefits: Array.isArray(p.benefits)
                  ? p.benefits
                  : typeof p.benefits === 'string'
                  ? p.benefits
                      .split(/[;\n]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                  : [],
              },
            }))
          );
        } else {
          setBrandProducts([]);
        }
      } catch (err) {
        console.error('Failed to load products', err);
        setBrandProducts([]);
      }
    };
    loadProducts();
  }, [brandCode]);

  const buildPrompt = (template, type) => {
    if (!template) return '';
    let prompt = template;
    const brand = brands.find((b) => b.code === brandCode) || {};
    prompt = prompt.replace(/{{brand\.name}}/g, brand.name || '');
    prompt = prompt.replace(/{{brand\.toneOfVoice}}/g, brand.toneOfVoice || '');
    prompt = prompt.replace(/{{brand\.offering}}/g, brand.offering || '');
    const prod = brandProducts.find((p) => p.id === selectedProduct) || {};
    prompt = prompt.replace(/{{product\.name}}/g, prod.values?.name || '');
    const desc = selectRandomOption(prod.values?.description);
    const ben = selectRandomOption(prod.values?.benefits);
    prompt = prompt.replace(/{{product\.description}}/g, desc);
    prompt = prompt.replace(/{{product\.benefits}}/g, ben);
    (type?.writeInFields || []).forEach((f) => {
      const val = formData[f.key] || '';
      const regex = new RegExp(`{{${f.key}}}`, 'g');
      prompt = prompt.replace(regex, Array.isArray(val) ? val.join(', ') : val);
    });
    return prompt;
  };

  const OPENAI_PROXY_URL = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/openaiProxy`;
  const fetchCopy = async (prompt) => {
    if (!prompt) return '';
    try {
      const response = await fetch(OPENAI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      return data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      console.error('OpenAI request failed', err);
      return '';
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    const type = types.find((t) => t.id === selectedType);
    if (!type) return;
    setLoading(true);
    const [p, h, d] = await Promise.all([
      fetchCopy(buildPrompt(type.primaryPrompt, type)),
      fetchCopy(buildPrompt(type.headlinePrompt, type)),
      fetchCopy(buildPrompt(type.descriptionPrompt, type)),
    ]);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCopies((arr) => [
      ...arr,
      { id, primary: p, headline: h, description: d, editing: false },
    ]);
    setLoading(false);
  };

  const currentType = types.find((t) => t.id === selectedType);

  return (
    <div className="space-y-4">
      {!showOnlyResults && (
        <>
          <div>
            <label id="copy-recipe-type-label" className="block text-sm mb-1">
              Recipe Type
            </label>
            <div
              role="group"
              aria-labelledby="copy-recipe-type-label"
              className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            >
              {types.map((t) => (
                <RecipeTypeCard
                  key={t.id}
                  type={t}
                  selected={selectedType === t.id}
                  onClick={() => setSelectedType(t.id)}
                />
              ))}
            </div>
          </div>
          {!hideBrandSelect ? (
            <div>
              <label className="block text-sm mb-1">Brand</label>
              <select
                className="p-2 border rounded"
                value={brandCode}
                onChange={(e) => {
                  setBrandCode(e.target.value);
                  setSelectedProduct('');
                }}
              >
                <option value="">Select brand...</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.code}>
                    {b.code} {b.name ? `- ${b.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm mb-1">Brand</label>
              <div className="p-2 border rounded bg-gray-100 dark:bg-gray-800">
                {brands.find((b) => b.code === brandCode)?.name || brandCode || '-'}
              </div>
            </div>
          )}
          {brandProducts.length > 0 && (
            <div>
              <label className="block text-sm mb-1">Product</label>
              <select
                className="p-2 border rounded"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Evergreen</option>
                {brandProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <form onSubmit={handleGenerate} className="space-y-2">
            {currentType?.writeInFields?.map((f) => (
              <div key={f.key}>
                <label className="block text-sm mb-1">{f.label}</label>
                {f.inputType === 'textarea' ? (
                  <textarea
                    className="w-full p-2 border rounded"
                    value={formData[f.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  />
                ) : f.inputType === 'list' ? (
                  <TagInput
                    id={`list-${f.key}`}
                    value={formData[f.key] || []}
                    onChange={(arr) => setFormData({ ...formData, [f.key]: arr })}
                  />
                ) : (
                  <input
                    className="w-full p-2 border rounded"
                    type={f.inputType}
                    value={formData[f.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
            <button
              type="submit"
              className="btn-primary"
              disabled={!selectedType || loading}
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </form>
        </>
      )}
      {showOnlyResults && onCopyClick && (
        <div>
          <button
            type="button"
            className="btn-secondary px-2 py-0.5 flex items-center gap-1"
            onClick={onCopyClick}
          >
            Copy
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {copies.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-gray-300 dark:border-gray-600 shadow p-3 relative max-w-[350px] w-full dark:bg-[var(--dark-sidebar-hover)]"
          >
            <button
              type="button"
              onClick={() =>
                setCopies((arr) =>
                  arr.map((x) =>
                    x.id === c.id ? { ...x, editing: !x.editing } : x,
                  ),
                )
              }
              aria-label={c.editing ? 'Save' : 'Edit'}
              className="absolute top-1 right-7 text-sm"
            >
              {c.editing ? <FiCheck /> : <FiEdit2 />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(c.id)}
              aria-label="Delete"
              className="absolute top-1 right-1 text-sm"
            >
              <FiTrash />
            </button>
            <div>
              <label className="block text-sm mb-1">Primary Text</label>
              {c.editing ? (
                <textarea
                  className="w-full p-2 border rounded"
                  rows="3"
                  value={c.primary}
                  onChange={(e) =>
                    setCopies((arr) =>
                      arr.map((x) =>
                        x.id === c.id ? { ...x, primary: e.target.value } : x,
                      ),
                    )
                  }
                />
              ) : (
                <p className="p-2 whitespace-pre-wrap bg-gray-50 rounded dark:bg-[var(--dark-sidebar-bg)]">
                  {isUrl(c.primary.trim()) ? (
                    <a href={c.primary.trim()} target="_blank" rel="noreferrer">
                      <FiLink />
                    </a>
                  ) : (
                    c.primary
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Headline</label>
              {c.editing ? (
                <textarea
                  className="w-full p-2 border rounded"
                  rows="2"
                  value={c.headline}
                  onChange={(e) =>
                    setCopies((arr) =>
                      arr.map((x) =>
                        x.id === c.id ? { ...x, headline: e.target.value } : x,
                      ),
                    )
                  }
                />
              ) : (
                <p className="p-2 whitespace-pre-wrap bg-gray-50 rounded dark:bg-[var(--dark-sidebar-bg)]">
                  {isUrl(c.headline.trim()) ? (
                    <a href={c.headline.trim()} target="_blank" rel="noreferrer">
                      <FiLink />
                    </a>
                  ) : (
                    c.headline
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1">Description</label>
              {c.editing ? (
                <textarea
                  className="w-full p-2 border rounded"
                  rows="2"
                  value={c.description}
                  onChange={(e) =>
                    setCopies((arr) =>
                      arr.map((x) =>
                        x.id === c.id
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    )
                  }
                />
              ) : (
                <p className="p-2 whitespace-pre-wrap bg-gray-50 rounded dark:bg-[var(--dark-sidebar-bg)]">
                  {isUrl(c.description.trim()) ? (
                    <a href={c.description.trim()} target="_blank" rel="noreferrer">
                      <FiLink />
                    </a>
                  ) : (
                    c.description
                  )}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {showSave && onSave && copies.length > 0 && (
        <div className="mt-4 text-right">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSave(copies)}
          >
            Save Copy
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded-xl shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <p className="mb-4">Delete this copy?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary px-3 py-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setCopies((arr) => arr.filter((x) => x.id !== confirmDelete));
                  setConfirmDelete(null);
                }}
                className="btn-delete px-3 py-1"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CopyRecipePreview;

