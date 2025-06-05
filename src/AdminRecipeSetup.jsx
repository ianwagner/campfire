import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { FiList, FiLayers, FiEye, FiEdit2, FiTrash } from 'react-icons/fi';
import { db } from './firebase/config';

const VIEWS = {
  TYPES: 'types',
  COMPONENTS: 'components',
  PREVIEW: 'preview',
};

const Tabs = ({ view, setView }) => (
  <div className="flex space-x-4 mb-4">
    <button
      className={`px-3 py-1 rounded flex items-center gap-1 ${
        view === VIEWS.TYPES ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.TYPES)}
    >
      <FiList /> <span>Recipe Types</span>
    </button>
    <button
      className={`px-3 py-1 rounded flex items-center gap-1 ${
        view === VIEWS.COMPONENTS ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.COMPONENTS)}
    >
      <FiLayers /> <span>Components</span>
    </button>
    <button
      className={`px-3 py-1 rounded flex items-center gap-1 ${
        view === VIEWS.PREVIEW ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.PREVIEW)}
    >
      <FiEye /> <span>Preview</span>
    </button>
  </div>
);

const RecipeTypes = () => {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [componentOrder, setComponentOrder] = useState('');
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const snap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch recipe types', err);
        setTypes([]);
      }
    };
    fetchTypes();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setName('');
    setPrompt('');
    setComponentOrder('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const order = componentOrder
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      if (editId) {
        await updateDoc(doc(db, 'recipeTypes', editId), {
          name: name.trim(),
          gptPrompt: prompt,
          components: order,
        });
        setTypes((t) =>
          t.map((r) =>
            r.id === editId
              ? { ...r, name: name.trim(), gptPrompt: prompt, components: order }
              : r
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'recipeTypes'), {
          name: name.trim(),
          gptPrompt: prompt,
          components: order,
        });
        setTypes((t) => [
          ...t,
          { id: docRef.id, name: name.trim(), gptPrompt: prompt, components: order },
        ]);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save recipe type', err);
    }
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setName(t.name);
    setPrompt(t.gptPrompt || '');
    setComponentOrder((t.components || []).join(', '));
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'recipeTypes', id));
      setTypes((t) => t.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete recipe type', err);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-2">Recipe Types</h2>
      {types.length === 0 ? (
        <p>No recipe types found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Components</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    {t.components && t.components.length > 0
                      ? t.components.join(', ')
                      : '-'}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => startEdit(t)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                        aria-label="Edit"
                      >
                        <FiEdit2 />
                        <span className="ml-1">Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-2 max-w-sm">
        <div>
          <label className="block text-sm mb-1">Name</label>
          <input className="w-full p-2 border rounded" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm mb-1">GPT Prompt</label>
          <textarea className="w-full p-2 border rounded" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm mb-1">Components (comma separated keys in order)</label>
          <input
            className="w-full p-2 border rounded"
            value={componentOrder}
            onChange={(e) => setComponentOrder(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editId ? 'Save Type' : 'Add Type'}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="btn-secondary px-2 py-0.5">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

const ComponentsView = () => {
  const [components, setComponents] = useState([]);
  const [label, setLabel] = useState('');
  const [keyVal, setKeyVal] = useState('');
  const [inputType, setInputType] = useState('text');
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    const fetchComponents = async () => {
      try {
        const snap = await getDocs(collection(db, 'componentTypes'));
        setComponents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to fetch components', err);
        setComponents([]);
      }
    };
    fetchComponents();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setLabel('');
    setKeyVal('');
    setInputType('text');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateDoc(doc(db, 'componentTypes', editId), {
          label: label.trim(),
          key: keyVal.trim(),
          inputType,
        });
        setComponents((c) =>
          c.map((comp) =>
            comp.id === editId
              ? { ...comp, label: label.trim(), key: keyVal.trim(), inputType }
              : comp
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'componentTypes'), {
          label: label.trim(),
          key: keyVal.trim(),
          inputType,
        });
        setComponents((c) => [
          ...c,
          { id: docRef.id, label: label.trim(), key: keyVal.trim(), inputType },
        ]);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save component type', err);
    }
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setLabel(c.label);
    setKeyVal(c.key);
    setInputType(c.inputType);
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'componentTypes', id));
      setComponents((c) => c.filter((comp) => comp.id !== id));
    } catch (err) {
      console.error('Failed to delete component type', err);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-2">Components</h2>
      {components.length === 0 ? (
        <p>No components found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.key}</td>
                  <td>{c.inputType}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => startEdit(c)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                        aria-label="Edit"
                      >
                        <FiEdit2 />
                        <span className="ml-1">Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-2 max-w-sm">
        <div>
          <label className="block text-sm mb-1">Label</label>
          <input className="w-full p-2 border rounded" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm mb-1">Key</label>
          <input className="w-full p-2 border rounded" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm mb-1">Input Type</label>
          <select className="w-full p-2 border rounded" value={inputType} onChange={(e) => setInputType(e.target.value)}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="textarea">Textarea</option>
            <option value="image">Image</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editId ? 'Save Component' : 'Add Component'}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="btn-secondary px-2 py-0.5">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

const Preview = () => {
  const [types, setTypes] = useState([]);
  const [components, setComponents] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({});
  const [results, setResults] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeSnap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        setComponents(compSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    fetchData();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!currentType) return;

    let prompt = currentType.gptPrompt || '';
    for (const [key, value] of Object.entries(formData)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      prompt = prompt.replace(regex, value);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      const data = await response.json();
      if (!response.ok) {
        console.error('OpenAI API error', data);
        return;
      }
      const text = data.choices?.[0]?.message?.content?.trim() || 'No result';
      setResults((prev) => [
        ...prev,
        { recipeNo: prev.length + 1, components: { ...formData }, copy: text },
      ]);
    } catch (err) {
      console.error('Failed to call OpenAI', err);
    }
  };

  const currentType = types.find((t) => t.id === selectedType);
  const compMap = Object.fromEntries(components.map((c) => [c.key, c]));
  const orderedComponents = currentType?.components?.length
    ? currentType.components.map((k) => compMap[k]).filter(Boolean)
    : components;

  return (
    <div>
      <h2 className="text-xl mb-2">Preview</h2>
      <form onSubmit={handleGenerate} className="space-y-2 max-w-sm">
        <div>
          <label className="block text-sm mb-1">Recipe Type</label>
          <select className="w-full p-2 border rounded" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="">Select...</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {currentType && (
          <div className="space-y-2">
            {orderedComponents.map((c) => (
              <div key={c.id}>
                <label className="block text-sm mb-1">{c.label}</label>
                <input
                  className="w-full p-2 border rounded"
                  value={formData[c.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [c.key]: e.target.value })}
                />
              </div>
            ))}
            <button type="submit" className="btn-primary">Generate</button>
          </div>
        )}
      </form>
      {results.length > 0 && (
        <div className="overflow-x-auto table-container mt-6">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Recipe #</th>
                {orderedComponents.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
                <th>Generated Copy</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.recipeNo}</td>
                  {orderedComponents.map((c) => (
                    <td key={c.id}>{r.components[c.key]}</td>
                  ))}
                  <td>{r.copy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const AdminRecipeSetup = () => {
  const [view, setView] = useState(VIEWS.TYPES);
  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Recipe Setup</h1>
      <Tabs view={view} setView={setView} />
      {view === VIEWS.TYPES && <RecipeTypes />}
      {view === VIEWS.COMPONENTS && <ComponentsView />}
      {view === VIEWS.PREVIEW && <Preview />}
    </div>
  );
};

export default AdminRecipeSetup;
