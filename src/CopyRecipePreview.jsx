import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

const CopyRecipePreview = () => {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [primary, setPrimary] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const snap = await getDocs(collection(db, 'copyRecipeTypes'));
        setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch copy recipe types', err);
        setTypes([]);
      }
    };
    fetchTypes();
  }, []);

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
      fetchCopy(type.primaryPrompt),
      fetchCopy(type.headlinePrompt),
      fetchCopy(type.descriptionPrompt),
    ]);
    setPrimary(p);
    setHeadline(h);
    setDescription(d);
    setLoading(false);
  };

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
      <form onSubmit={handleGenerate} className="space-y-2">
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

