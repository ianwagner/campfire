import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { FiList, FiLayers, FiEye, FiEdit2, FiTrash, FiSave, FiCopy, FiFile } from 'react-icons/fi';
import TagChecklist from './components/TagChecklist.jsx';
import TagInput from './components/TagInput.jsx';
import PromptTextarea from './components/PromptTextarea.jsx';
import useComponentTypes from './useComponentTypes';
import { db } from './firebase/config';
import useAssets from './useAssets';
import selectRandomOption from './utils/selectRandomOption.js';
import debugLog from './utils/debugLog';
import { MAX_TAG_BONUS } from './constants';

export const parseCsvFile = async (file, importType) => {
  if (!file || !importType) return [];
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    const row = {};
    importType.columns.forEach((col) => {
      const val = parts[col.index] ? parts[col.index].trim() : '';
      if (col.role === 'tag') {
        if (!row.tags) row.tags = [];
        if (val) row.tags.push(val);
      } else if (col.role === 'imageUrl') {
        // allow multiple URLs separated by whitespace or semicolons
        const urls = val
          .split(/[;\s]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        if (urls.length > 0) {
          row.imageUrls = urls;
          row.imageUrl = urls[0];
        }
      } else if (col.role !== 'ignore') {
        row[col.role] = val;
      }
    });
    rows.push(row);
  }
  return rows;
};

const VIEWS = {
  TYPES: 'types',
  COMPONENTS: 'components',
  INSTANCES: 'instances',
  PREVIEW: 'preview',
  CSV_IMPORTS: 'csvImports',
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
        view === VIEWS.CSV_IMPORTS ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.CSV_IMPORTS)}
    >
      <FiFile /> <span>CSV Imports</span>
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
  const [csvImportTypes, setCsvImportTypes] = useState([]);
  const [csvEnabled, setCsvEnabled] = useState(false);
  const [csvType, setCsvType] = useState('');
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const snap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const csvSnap = await getDocs(collection(db, 'csvImportTypes'));
        setCsvImportTypes(csvSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    setCsvEnabled(false);
    setCsvType('');
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
          csvEnabled,
          csvType,
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
                  csvEnabled,
                  csvType,
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
          csvEnabled,
          csvType,
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
            csvEnabled,
            csvType,
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
    setCsvEnabled(!!t.csvEnabled);
    setCsvType(t.csvType || '');
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
        <div className="flex items-center gap-2">
          <label className="text-sm">CSV Import</label>
          <input type="checkbox" checked={csvEnabled} onChange={(e) => setCsvEnabled(e.target.checked)} />
        </div>
        {csvEnabled && (
          <div>
            <label className="block text-sm mb-1">CSV Import Type</label>
            <select className="w-full p-2 border rounded" value={csvType} onChange={(e) => setCsvType(e.target.value)}>
              <option value="">Select...</option>
              {csvImportTypes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
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

const CsvImportTypesView = () => {
  const [types, setTypes] = useState([]);
  const [name, setName] = useState('');
  const [columns, setColumns] = useState([]);
  const [editId, setEditId] = useState(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'csvImportTypes'));
        setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load csv import types', err);
      }
    };
    load();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setName('');
    setColumns([]);
    setFile(null);
  };

  const parseSample = async (f) => {
    if (!f) return;
    const text = await f.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return;
    const headers = lines[0].split(',').map((h) => h.trim());
    setColumns(headers.map((h, i) => ({ index: i, name: h, role: 'ignore', required: false })));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cols = columns.map((c) => ({ name: c.name, index: c.index, role: c.role, required: !!c.required }));
    try {
      if (editId) {
        await updateDoc(doc(db, 'csvImportTypes', editId), { name: name.trim(), columns: cols });
        setTypes((t) => t.map((r) => (r.id === editId ? { ...r, name: name.trim(), columns: cols } : r)));
      } else {
        const ref = await addDoc(collection(db, 'csvImportTypes'), { name: name.trim(), columns: cols });
        setTypes((t) => [...t, { id: ref.id, name: name.trim(), columns: cols }]);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save csv import type', err);
    }
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setName(t.name);
    setColumns(t.columns || []);
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'csvImportTypes', id));
      setTypes((t) => t.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete csv import type', err);
    }
  };

  return (
    <div>
      <h2 className="text-xl mb-2">CSV Import Types</h2>
      {types.length === 0 ? (
        <p>No CSV import types found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Columns</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.columns ? t.columns.length : 0}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <button onClick={() => startEdit(t)} className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 mr-2" aria-label="Edit">
                        <FiEdit2 />
                        <span className="ml-1">Edit</span>
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1 btn-delete" aria-label="Delete">
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
          <label className="block text-sm mb-1">Sample CSV</label>
          <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; setFile(f || null); parseSample(f); }} />
        </div>
        {columns.length > 0 && (
          <div className="space-y-2">
            {columns.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex-1">{c.name}</span>
                <select className="p-2 border rounded" value={c.role} onChange={(e) => { const arr = [...columns]; arr[idx].role = e.target.value; setColumns(arr); }}>
                  <option value="ignore">Ignore</option>
                  <option value="fileName">File Name</option>
                  <option value="imageUrl">Image URL</option>
                  <option value="audience">Audience</option>
                  <option value="angle">Angle</option>
                  <option value="tag">Tag</option>
                </select>
                <label className="text-sm">
                  <input type="checkbox" className="mr-1" checked={c.required || false} onChange={(e) => { const arr = [...columns]; arr[idx].required = e.target.checked; setColumns(arr); }} />
                  Required
                </label>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">{editId ? 'Save Type' : 'Add Type'}</button>
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
  const [csvImportTypes, setCsvImportTypes] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvIndex, setCsvIndex] = useState(0);
  const [csvFile, setCsvFile] = useState(null);
  const assets = useAssets();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeSnap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const csvSnap = await getDocs(collection(db, 'csvImportTypes'));
        setCsvImportTypes(csvSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    const row = csvRows.length > 0 ? csvRows[csvIndex % csvRows.length] : {};
    setCsvIndex((i) => (csvRows.length > 0 ? (i + 1) % csvRows.length : 0));

    const mergedForm = { ...formData, ...row };
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
          val = mergedForm[`${c.key}.${a.key}`] || '';
        }
        componentsData[`${c.key}.${a.key}`] = val;
        const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
        prompt = prompt.replace(regex, val);
      });
    });
    const writeFields = currentType.writeInFields || [];
    writeFields.forEach((f) => {
      let val = mergedForm[f.key];
      if (f.inputType === 'list') {
        val = selectRandomOption(val);
      } else if (Array.isArray(val)) {
        val = selectRandomOption(val);
      } else if (val === undefined) {
        val = '';
      }
      componentsData[f.key] = val;
      const regex = new RegExp(`{{${f.key}}}`, 'g');
      prompt = prompt.replace(regex, val);
    });

    const assetCount =
  parseInt(componentsData['layout.assetNo'], 10) ||
  parseInt(componentsData['layout.assetCount'], 10) ||
  0;

  const scoredAssets = assets.map((a) => {
    let score = 0;
    ['audience', 'angle', 'offer'].forEach((t) => {
      const val = componentsData[t];
      if (!val) return;

      const valLower = val.toLowerCase();
      const assetField = a[t];
      const assetFieldLower =
        typeof assetField === 'string' ? assetField.toLowerCase() : assetField;

      if (assetFieldLower && assetFieldLower === valLower) {
        score += 2;
      } else {
        const tagField = `${t}Tags`;
        const tagVals = Array.isArray(a[tagField])
          ? a[tagField].map((v) =>
              typeof v === 'string' ? v.toLowerCase() : v
            )
          : [];
        if (tagVals.includes(valLower)) {
          score += 1;
        }
      }
    });

  if (a.tags && row?.tags?.length > 0) {
    const matches = row.tags.filter((tag) => a.tags.includes(tag)).length;
    const bonus = Math.min(matches, MAX_TAG_BONUS);
    debugLog('Tag bonus:', bonus, 'matches:', matches);
    score += bonus;
  }

  // Add a tiny random value to avoid deterministic ties between assets
  return { asset: a, score: score + Math.random() * 0.01 };
});

const topAssets = scoredAssets
  .sort((a, b) => b.score - a.score)
  .slice(0, assetCount);


    scoredAssets.sort((a, b) => b.score - a.score);
    let matchedAssets = scoredAssets
      .filter((o) => o.score > 0)
      .map((o) => o.asset);
    if (matchedAssets.length < assetCount) {
      for (const item of scoredAssets) {
        if (item.score === 0) {
          matchedAssets.push(item.asset);
          if (matchedAssets.length >= assetCount) break;
        }
      }
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
        if (Array.isArray(row.imageUrls) && row.imageUrls.length > 0) {
          const selected = row.imageUrls.slice(0, assetCount).map((u) => ({ adUrl: u }));
          while (selected.length < assetCount) {
            selected.push({ needAsset: true });
          }
          result.assets = selected;
        } else if (row.imageUrl) {
          const selected = [{ adUrl: row.imageUrl }];
          while (selected.length < assetCount) {
            selected.push({ needAsset: true });
          }
          result.assets = selected;
        } else if (assetCount > 0) {
          const selected = matchedAssets.slice(0, assetCount);
          while (selected.length < assetCount) {
            selected.push({ needAsset: true });
          }
          result.assets = selected;
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
            {currentType.csvEnabled && (
              <div>
                <label className="block text-sm mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    setCsvFile(f || null);
                    const type = csvImportTypes.find((t) => t.id === currentType.csvType);
                    if (f && type) {
                      const rows = await parseCsvFile(f, type);
                      setCsvRows(rows);
                      setCsvIndex(0);
                    } else {
                      setCsvRows([]);
                    }
                  }}
                />
                {csvRows.length > 0 && (
                  <p className="text-sm italic mt-1">{csvRows.length} rows loaded</p>
                )}
              </div>
            )}
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
          <table className="ad-table min-w-full table-auto text-sm">
            <thead>
              <tr>
                <th>Recipe #</th>
                {columnMeta.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th key={col.key}>{col.label}</th>
                    )
                )}
                <th>Assets</th>
                <th className="w-64">Generated Copy</th>
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
                  <td className="flex gap-1">
                    {r.assets && r.assets.length > 0 ? (
                      r.assets.map((a, i) =>
                        a.needAsset ? (
                          <span key={`na-${i}`} className="text-red-500 text-xs">
                            Need asset
                          </span>
                        ) : (
                          <a
                            key={a.id}
                            href={a.adUrl || a.firebaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary px-1.5 py-0.5 text-xs"
                          >
                            Image Link
                          </a>
                        )
                      )
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="whitespace-pre-wrap break-words text-[12px] relative w-64">
                    {editIdx === idx ? (
                      <>
                      <textarea
                        className="w-full p-1 border rounded text-[12px]"
                        value={r.copy}
                        onChange={(e) => {
                          const arr = [...results];
                          arr[idx].copy = e.target.value;
                          setResults(arr);
                        }}
                        spellCheck
                      />
                      <button
                        type="button"
                        className="absolute top-0 right-0 p-1 text-xs"
                        onClick={() => setEditIdx(null)}
                        aria-label="Save"
                      >
                        <FiSave />
                      </button>
                      </>
                    ) : (
                      <div className="min-h-[1.5rem] text-[12px] w-full">
                        <button
                          type="button"
                          className="absolute top-0 right-6 p-1 text-xs"
                          onClick={() => navigator.clipboard.writeText(r.copy)}
                          aria-label="Copy"
                        >
                          <FiCopy />
                        </button>
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
      {view === VIEWS.CSV_IMPORTS && <CsvImportTypesView />}
      {view === VIEWS.PREVIEW && <Preview />}
    </div>
  );
};

export default AdminRecipeSetup;
