import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import TagInput from './components/TagInput.jsx';

const CopyRecipePreview = () => {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [primary, setPrimary] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [brandCode, setBrandCode] = useState('');
  const [brandProducts, setBrandProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [formData, setFormData] = useState({});

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
                description: p.description || '',
                benefits: p.benefits || '',
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
    prompt = prompt.replace(/{{product\.description}}/g, prod.values?.description || '');
    prompt = prompt.replace(/{{product\.benefits}}/g, prod.values?.benefits || '');
    (type?.writeInFields || []).forEach((f) => {
      const val = formData[f.key] || '';
      const regex = new RegExp(`{{${f.key}}}`, 'g');
      prompt = prompt.replace(regex, Array.isArray(val) ? val.join(', ') : val);
    });
    return prompt;
  };

  const fetchCopy = async (prompt) => {
    if (!prompt) return '';
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('OpenAI API error', data);
        return '';
      }
      return data.choices?.[0]?.message?.content?.trim() || '';
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
    setPrimary(p);
    setHeadline(h);
    setDescription(d);
    setLoading(false);
  };

  const currentType = types.find((t) => t.id === selectedType);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Recipe Type</label>
        <select
          className="p-2 border rounded"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
        >
          <option value="">Select type...</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
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
      {brandProducts.length > 0 && (
        <div>
          <label className="block text-sm mb-1">Product</label>
          <select
            className="p-2 border rounded"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">Select product...</option>
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
      <div>
        <label className="block text-sm mb-1">Primary Text</label>
        <textarea
          className="w-full p-2 border rounded"
          rows="3"
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Headline</label>
        <textarea
          className="w-full p-2 border rounded"
          rows="2"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Description</label>
        <textarea
          className="w-full p-2 border rounded"
          rows="2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </div>
  );
};

export default CopyRecipePreview;

