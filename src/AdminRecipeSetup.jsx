import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const VIEWS = {
  TYPES: 'types',
  COMPONENTS: 'components',
  PREVIEW: 'preview',
};

const Tabs = ({ view, setView }) => (
  <div className="space-x-2 mb-4">
    <button className={`btn-tab${view === VIEWS.TYPES ? ' active' : ''}`} onClick={() => setView(VIEWS.TYPES)}>
      Recipe Types
    </button>
    <button className={`btn-tab${view === VIEWS.COMPONENTS ? ' active' : ''}`} onClick={() => setView(VIEWS.COMPONENTS)}>
      Components
    </button>
    <button className={`btn-tab${view === VIEWS.PREVIEW ? ' active' : ''}`} onClick={() => setView(VIEWS.PREVIEW)}>
      Preview
    </button>
  </div>
);

const RecipeTypes = () => {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [componentOrder, setComponentOrder] = useState('');

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

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const order = componentOrder
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const docRef = await addDoc(collection(db, 'recipeTypes'), {
        name: name.trim(),
        gptPrompt: prompt,
        components: order,
      });
      setTypes((t) => [
        ...t,
        { id: docRef.id, name: name.trim(), gptPrompt: prompt, components: order },
      ]);
      setName('');
      setPrompt('');
      setComponentOrder('');
    } catch (err) {
      console.error('Failed to add recipe type', err);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-2">Recipe Types</h2>
      {types.length === 0 ? (
        <p>No recipe types found.</p>
      ) : (
        <ul className="list-disc list-inside mb-4">
          {types.map((t) => (
            <li key={t.id}>
              {t.name}
              {t.components && t.components.length > 0 && (
                <span className="ml-1 text-gray-500 text-sm">
                  - {t.components.join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="space-y-2 max-w-sm">
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
        <button type="submit" className="btn-primary">Add Type</button>
      </form>
    </div>
  );
};

const ComponentsView = () => {
  const [components, setComponents] = useState([]);
  const [label, setLabel] = useState('');
  const [keyVal, setKeyVal] = useState('');
  const [inputType, setInputType] = useState('text');

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

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'componentTypes'), {
        label: label.trim(),
        key: keyVal.trim(),
        inputType,
      });
      setComponents((c) => [...c, { id: docRef.id, label: label.trim(), key: keyVal.trim(), inputType }]);
      setLabel('');
      setKeyVal('');
      setInputType('text');
    } catch (err) {
      console.error('Failed to add component type', err);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-2">Components</h2>
      {components.length === 0 ? (
        <p>No components found.</p>
      ) : (
        <ul className="list-disc list-inside mb-4">
          {components.map((c) => (
            <li key={c.id}>{c.label} ({c.key}) - {c.inputType}</li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="space-y-2 max-w-sm">
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
        <button type="submit" className="btn-primary">Add Component</button>
      </form>
    </div>
  );
};

const Preview = () => {
  const [types, setTypes] = useState([]);
  const [components, setComponents] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({});

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

  const handleGenerate = (e) => {
    e.preventDefault();
    // placeholder generation logic
    alert('Generate copy with GPT using prompt from recipe type');
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
