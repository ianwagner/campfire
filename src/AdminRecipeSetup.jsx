import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { FiList, FiLayers, FiEye, FiEdit2, FiTrash } from 'react-icons/fi';
import TagChecklist from './components/TagChecklist.jsx';
import TagInput from './components/TagInput.jsx';
import PromptTextarea from './components/PromptTextarea.jsx';
import useComponentTypes from './useComponentTypes';
import { db } from './firebase/config';
import useAssets from './useAssets';

const VIEWS = {
  TYPES: 'types',
  COMPONENTS: 'components',
  INSTANCES: 'instances',
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
        view === VIEWS.INSTANCES ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.INSTANCES)}
    >
      <FiLayers /> <span>Instances</span>
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
  const componentsData = useComponentTypes();
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [assetPrompt, setAssetPrompt] = useState('');
  const [componentOrder, setComponentOrder] = useState('');
  const [fields, setFields] = useState([{ label: '', key: '', inputType: 'text' }]);
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
    setAssetPrompt('');
    setComponentOrder('');
    setFields([{ label: '', key: '', inputType: 'text' }]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const order = componentOrder
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const writeFields = fields
      .map((f) => ({
        label: f.label.trim(),
        key: f.key.trim(),
        inputType: f.inputType || 'text',
      }))
      .filter((f) => f.label && f.key);
    try {
      if (editId) {
        await updateDoc(doc(db, 'recipeTypes', editId), {
          name: name.trim(),
          gptPrompt: prompt,
          assetPrompt: assetPrompt,
          components: order,
          writeInFields: writeFields,
        });
        setTypes((t) =>
          t.map((r) =>
            r.id === editId
              ? {
                  ...r,
                  name: name.trim(),
                  gptPrompt: prompt,
                  assetPrompt: assetPrompt,
                  components: order,
                  writeInFields: writeFields,
                }
              : r
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'recipeTypes'), {
          name: name.trim(),
          gptPrompt: prompt,
          assetPrompt: assetPrompt,
          components: order,
          writeInFields: writeFields,
        });
        setTypes((t) => [
          ...t,
          {
            id: docRef.id,
            name: name.trim(),
            gptPrompt: prompt,
            assetPrompt: assetPrompt,
            components: order,
            writeInFields: writeFields,
          },
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
    setAssetPrompt(t.assetPrompt || '');
    setComponentOrder((t.components || []).join(', '));
    setFields(
      t.writeInFields && t.writeInFields.length > 0
        ? t.writeInFields
        : [{ label: '', key: '', inputType: 'text' }]
    );
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'recipeTypes', id));
      setTypes((t) => t.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete recipe type', err);
    }
  };

  const placeholders = [];
  componentsData.forEach((c) => {
    c.attributes?.forEach((a) => {
      placeholders.push(`${c.key}.${a.key}`);
    });
  });
  fields.forEach((f) => {
    if (f.key) placeholders.push(f.key);
  });

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
                <th>Write-In Fields</th>
                <th>Asset Prompt</th>
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
                  <td>
                    {t.writeInFields && t.writeInFields.length > 0
                      ? t.writeInFields.map((f) => f.key).join(', ')
                      : '-'}
                  </td>
                  <td>{t.assetPrompt || '-'}</td>
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
          <PromptTextarea
            value={prompt}
            onChange={setPrompt}
            placeholders={placeholders}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Asset Prompt</label>
          <PromptTextarea
            value={assetPrompt}
            onChange={setAssetPrompt}
            placeholders={placeholders}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Components (comma separated keys in order)</label>
          <input
            className="w-full p-2 border rounded"
            value={componentOrder}
            onChange={(e) => setComponentOrder(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Write-In Fields</label>
          {fields.map((f, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                className="p-2 border rounded flex-1"
                placeholder="Label"
                value={f.label}
                onChange={(e) => {
                  const arr = [...fields];
                  arr[idx].label = e.target.value;
                  setFields(arr);
                }}
              />
              <input
                className="p-2 border rounded flex-1"
                placeholder="Key"
                value={f.key}
                onChange={(e) => {
                  const arr = [...fields];
                  arr[idx].key = e.target.value;
                  setFields(arr);
                }}
              />
              <select
                className="p-2 border rounded"
                value={f.inputType}
                onChange={(e) => {
                  const arr = [...fields];
                  arr[idx].inputType = e.target.value;
                  setFields(arr);
                }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="textarea">Textarea</option>
                <option value="image">Image</option>
                <option value="list">List</option>
              </select>
              <button
                type="button"
                onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                className="btn-secondary px-2 py-0.5"
              >
                <FiTrash />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFields([...fields, { label: '', key: '', inputType: 'text' }])}
            className="btn-secondary px-2 py-0.5"
          >
            Add Field
          </button>
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
  const [selectionMode, setSelectionMode] = useState('dropdown');
  const [attributes, setAttributes] = useState([{ label: '', key: '', inputType: 'text' }]);
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
    setSelectionMode('dropdown');
    setAttributes([{ label: '', key: '', inputType: 'text' }]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const attrs = attributes
      .map((a) => ({
        label: a.label.trim(),
        key: a.key.trim(),
        inputType: a.inputType || 'text',
      }))
      .filter((a) => a.label && a.key);
    try {
      if (editId) {
        await updateDoc(doc(db, 'componentTypes', editId), {
          label: label.trim(),
          key: keyVal.trim(),
          selectionMode,
          attributes: attrs,
        });
        setComponents((c) =>
          c.map((comp) =>
            comp.id === editId
              ? { ...comp, label: label.trim(), key: keyVal.trim(), selectionMode, attributes: attrs }
              : comp
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'componentTypes'), {
          label: label.trim(),
          key: keyVal.trim(),
          selectionMode,
          attributes: attrs,
        });
        setComponents((c) => [
          ...c,
          { id: docRef.id, label: label.trim(), key: keyVal.trim(), selectionMode, attributes: attrs },
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
    setSelectionMode(c.selectionMode || 'dropdown');
    setAttributes(c.attributes && c.attributes.length > 0 ? c.attributes : [{ label: '', key: '', inputType: 'text' }]);
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
                <th>Mode</th>
                <th>Attributes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.key}</td>
                  <td>{c.selectionMode || 'dropdown'}</td>
                  <td>{c.attributes ? c.attributes.length : 0}</td>
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
          <label className="block text-sm mb-1">Selection Mode</label>
          <select
            className="w-full p-2 border rounded"
            value={selectionMode}
            onChange={(e) => setSelectionMode(e.target.value)}
          >
            <option value="random">random</option>
            <option value="dropdown">dropdown</option>
            <option value="checklist">checklist</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Attributes</label>
          {attributes.map((a, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                className="p-2 border rounded flex-1"
                placeholder="Label"
                value={a.label}
                onChange={(e) => {
                  const arr = [...attributes];
                  arr[idx].label = e.target.value;
                  setAttributes(arr);
                }}
              />
              <input
                className="p-2 border rounded flex-1"
                placeholder="Key"
                value={a.key}
                onChange={(e) => {
                  const arr = [...attributes];
                  arr[idx].key = e.target.value;
                  setAttributes(arr);
                }}
              />
              <select
                className="p-2 border rounded"
                value={a.inputType}
                onChange={(e) => {
                  const arr = [...attributes];
                  arr[idx].inputType = e.target.value;
                  setAttributes(arr);
                }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="textarea">Textarea</option>
                <option value="image">Image</option>
              </select>
              <button
                type="button"
                onClick={() => setAttributes(attributes.filter((_, i) => i !== idx))}
                className="btn-secondary px-2 py-0.5"
              >
                <FiTrash />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAttributes([...attributes, { label: '', key: '', inputType: 'text' }])}
            className="btn-secondary px-2 py-0.5"
          >
            Add Attribute
          </button>
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

const InstancesView = () => {
  const [components, setComponents] = useState([]);
  const [instances, setInstances] = useState([]);
  const [component, setComponent] = useState('');
  const [name, setName] = useState('');
  const [values, setValues] = useState({});
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        setComponents(
          compSnap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, ...data, selectionMode: data.selectionMode || 'dropdown' };
          })
        );
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load component instances', err);
      }
    };
    fetchData();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setComponent('');
    setName('');
    setValues({});
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const comp = components.find((c) => c.id === component);
    if (!comp) return;
    try {
      if (editId) {
        await updateDoc(doc(db, 'componentInstances', editId), {
          componentKey: comp.key,
          name: name.trim(),
          values,
        });
        setInstances((i) =>
          i.map((ins) =>
            ins.id === editId
              ? { ...ins, componentKey: comp.key, name: name.trim(), values }
              : ins
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'componentInstances'), {
          componentKey: comp.key,
          name: name.trim(),
          values,
        });
        setInstances((i) => [
          ...i,
          { id: docRef.id, componentKey: comp.key, name: name.trim(), values },
        ]);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save instance', err);
    }
  };

  const startEdit = (inst) => {
    setEditId(inst.id);
    const comp = components.find((c) => c.key === inst.componentKey);
    setComponent(comp ? comp.id : '');
    setName(inst.name);
    setValues(inst.values || {});
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'componentInstances', id));
      setInstances((i) => i.filter((ins) => ins.id !== id));
    } catch (err) {
      console.error('Failed to delete instance', err);
    }
  };

  const currentComp = components.find((c) => c.id === component);

  return (
    <div>
      <h2 className="text-xl mb-2">Component Instances</h2>
      {instances.length === 0 ? (
        <p>No instances found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Component</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.componentKey}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => startEdit(i)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2"
                        aria-label="Edit"
                      >
                        <FiEdit2 />
                        <span className="ml-1">Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(i.id)}
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
          <label className="block text-sm mb-1">Component</label>
          <select className="w-full p-2 border rounded" value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="">Select...</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        {currentComp && (
          <div className="space-y-2">
            {currentComp.attributes?.map((a) => (
              <div key={a.key}>
                <label className="block text-sm mb-1">{a.label}</label>
                <input
                  className="w-full p-2 border rounded"
                  value={values[a.key] || ''}
                  onChange={(e) => setValues({ ...values, [a.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editId ? 'Save Instance' : 'Add Instance'}
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
  const [instances, setInstances] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({});
  const [selectedInstances, setSelectedInstances] = useState({});
  const [results, setResults] = useState([]);
  const [generateCount, setGenerateCount] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const assets = useAssets();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeSnap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        setComponents(
          compSnap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, ...data, selectionMode: data.selectionMode || 'dropdown' };
          })
        );
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    fetchData();
  }, []);

  const generateOnce = async () => {
    if (!currentType) return;

    let prompt = currentType.gptPrompt || '';
    const componentsData = {};
    orderedComponents.forEach((c) => {
      const instOptions = instances.filter((i) => i.componentKey === c.key);
      let selectedInst = null;
      if (c.selectionMode === 'random') {
        if (instOptions.length > 0) {
          selectedInst = instOptions[Math.floor(Math.random() * instOptions.length)];
        }
      } else if (c.selectionMode === 'checklist') {
        const ids =
          selectedInstances[c.key] !== undefined
            ? selectedInstances[c.key]
            : instOptions.map((i) => i.id);
        const opts = ids
          .map((id) => instOptions.find((i) => i.id === id))
          .filter(Boolean);
        if (opts.length > 0) {
          selectedInst = opts[Math.floor(Math.random() * opts.length)];
        }
      } else {
        const id = selectedInstances[c.key];
        const inst = instOptions.find((i) => i.id === id);
        if (inst) selectedInst = inst;
      }
      c.attributes?.forEach((a) => {
        let val = '';
        if (selectedInst) {
          val = selectedInst.values?.[a.key] || '';
        } else {
          val = formData[`${c.key}.${a.key}`] || '';
        }
        componentsData[`${c.key}.${a.key}`] = val;
        const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
        prompt = prompt.replace(regex, val);
      });
    });
    const writeFields = currentType.writeInFields || [];
    writeFields.forEach((f) => {
      let val = formData[f.key] || '';
      if (Array.isArray(val)) {
        val = val.length > 0 ? val[Math.floor(Math.random() * val.length)] : '';
      }
      componentsData[f.key] = val;
      const regex = new RegExp(`{{${f.key}}}`, 'g');
      prompt = prompt.replace(regex, val);
    });

    const assetCount = parseInt(componentsData['layout.assetCount'], 10) || 0;
    let matchedAssets = assets;
    ['audience', 'angle', 'offer'].forEach((t) => {
      const val = componentsData[t];
      if (val) matchedAssets = matchedAssets.filter((a) => a[t] === val);
    });
    if (assetCount > 0 && matchedAssets.length < assetCount) {
      console.warn('Not enough assets for recipe', matchedAssets.length, 'need', assetCount);
      return;
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
      setResults((prev) => {
        const result = {
          recipeNo: prev.length + 1,
          components: componentsData,
          copy: text,
          editing: false,
        };
        if (assetCount > 0) {
          result.assets = matchedAssets.slice(0, assetCount);
        }
        return [...prev, result];
      });
    } catch (err) {
      console.error('Failed to call OpenAI', err);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    const times = Number(generateCount) || 1;
    for (let i = 0; i < times; i++) {
      // eslint-disable-next-line no-await-in-loop
      await generateOnce();
    }
  };

  const currentType = types.find((t) => t.id === selectedType);
  const compMap = Object.fromEntries(components.map((c) => [c.key, c]));
  const orderedComponents = currentType?.components?.length
    ? currentType.components.map((k) => compMap[k]).filter(Boolean)
    : components;
  const writeFields = currentType?.writeInFields || [];
  const columnMeta = useMemo(() => {
    const cols = [];
    orderedComponents.forEach((c) => {
      c.attributes?.forEach((a) => {
        cols.push({ key: `${c.key}.${a.key}`, label: `${c.label} - ${a.label}` });
      });
    });
    writeFields.forEach((f) => {
      cols.push({ key: f.key, label: f.label });
    });
    return cols;
  }, [orderedComponents, writeFields]);

  useEffect(() => {
    const defaults = {};
    columnMeta.forEach((c) => {
      defaults[c.key] = c.label.toLowerCase().includes('name');
    });
    setVisibleColumns(defaults);
  }, [columnMeta]);

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
          <div className="space-y-4">
            {orderedComponents.map((c) => {
              const instOptions = instances.filter((i) => i.componentKey === c.key);
              const defaultList = instOptions.map((i) => i.id);
              const current = selectedInstances[c.key] !== undefined
                ? selectedInstances[c.key]
                : c.selectionMode === 'checklist'
                ? defaultList
                : '';
              const inst = c.selectionMode === 'dropdown' ? instances.find((i) => i.id === current) : null;
              return (
                <div key={c.id} className="space-y-2">
                  <label className="block text-sm mb-1">{c.label}</label>
                  {c.selectionMode === 'dropdown' && instOptions.length > 0 && (
                    <select
                      className="w-full p-2 border rounded"
                      value={current}
                      onChange={(e) =>
                        setSelectedInstances({ ...selectedInstances, [c.key]: e.target.value })
                      }
                    >
                      <option value="">Custom...</option>
                      {instOptions.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  )}
                  {c.selectionMode === 'checklist' && instOptions.length > 0 && (
                    <TagChecklist
                      options={instOptions.map((i) => ({ id: i.id, name: i.name }))}
                      value={current}
                      onChange={(arr) => setSelectedInstances({ ...selectedInstances, [c.key]: arr })}
                      id={`check-${c.id}`}
                    />
                  )}
                  {c.selectionMode === 'random' && instOptions.length > 0 && (
                    <p className="text-sm italic">Random instance</p>
                  )}
                  {((c.selectionMode === 'dropdown' && !inst) || instOptions.length === 0) &&
                    c.attributes?.map((a) => (
                      <div key={a.key}>
                        <label className="block text-xs mb-1">{a.label}</label>
                        <input
                          className="w-full p-2 border rounded"
                          value={formData[`${c.key}.${a.key}`] || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, [`${c.key}.${a.key}`]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                </div>
              );
            })}
            {writeFields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm mb-1">{f.label}</label>
                {f.inputType === 'textarea' ? (
                  <textarea
                    className="w-full p-2 border rounded"
                    value={formData[f.key] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [f.key]: e.target.value })
                    }
                  />
                ) : f.inputType === 'list' ? (
                  <TagInput
                    id={`list-${f.key}`}
                    value={formData[f.key] || []}
                    onChange={(arr) =>
                      setFormData({ ...formData, [f.key]: arr })
                    }
                  />
                ) : (
                  <input
                    className="w-full p-2 border rounded"
                    type={f.inputType}
                    value={formData[f.key] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [f.key]: e.target.value })
                    }
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary">Generate</button>
              <input
                type="number"
                min="1"
                className="p-2 border rounded w-20"
                value={generateCount}
                onChange={(e) =>
                  setGenerateCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
          </div>
        )}
      </form>
      {results.length > 0 && (
        <div className="table-container mt-6">
          <div className="relative inline-block mb-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowColumnMenu((s) => !s)}
            >
              Columns
            </button>
            {showColumnMenu && (
              <div className="absolute z-10 bg-white border rounded shadow p-2 right-0">
                {columnMeta.map((c) => (
                  <label key={c.key} className="block whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={visibleColumns[c.key] || false}
                      onChange={() =>
                        setVisibleColumns({
                          ...visibleColumns,
                          [c.key]: !visibleColumns[c.key],
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <table className="ad-table min-w-full table-fixed text-sm">
            <thead>
              <tr>
                <th>Recipe #</th>
                {columnMeta.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th key={col.key}>{col.label}</th>
                    )
                )}
                <th>Generated Copy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center">{r.recipeNo}</td>
                  {columnMeta.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <td key={col.key}>{r.components[col.key]}</td>
                      )
                  )}
                  <td className="whitespace-pre-wrap break-words text-[10px] relative">
                    {editIdx === idx ? (
                      <textarea
                        className="w-full p-1 border rounded"
                        value={r.copy}
                        onChange={(e) => {
                          const arr = [...results];
                          arr[idx].copy = e.target.value;
                          setResults(arr);
                        }}
                        onBlur={() => setEditIdx(null)}
                        spellCheck
                      />
                    ) : (
                      <div className="min-h-[1.5rem]">
                        <button
                          type="button"
                          className="absolute top-0 right-0 p-1 text-xs"
                          onClick={() => setEditIdx(idx)}
                          aria-label="Edit"
                        >
                          <FiEdit2 />
                        </button>
                        {r.copy}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="text-red-600"
                      onClick={() => {
                        setResults((prev) =>
                          prev
                            .filter((_, i) => i !== idx)
                            .map((res, i2) => ({ ...res, recipeNo: i2 + 1 }))
                        );
                      }}
                      aria-label="Delete"
                    >
                      <FiTrash />
                    </button>
                  </td>
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
      {view === VIEWS.INSTANCES && <InstancesView />}
      {view === VIEWS.PREVIEW && <Preview />}
    </div>
  );
};

export default AdminRecipeSetup;
