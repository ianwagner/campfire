import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import {
  FiList,
  FiLayers,
  FiEye,
  FiEdit2,
  FiTrash,
} from 'react-icons/fi';
import TagInput from './components/TagInput.jsx';
import PromptTextarea from './components/PromptTextarea.jsx';
import useComponentTypes from './useComponentTypes';
import { db } from './firebase/config';
import { splitCsvLine } from "./utils/csv.js";
import RecipePreview from "./RecipePreview.jsx";



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
  const [enableAssetCsv, setEnableAssetCsv] = useState(false);
  const [assetFields, setAssetFields] = useState([]);
  const [defaultColumnsText, setDefaultColumnsText] = useState('');
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
    setEnableAssetCsv(false);
    setAssetFields([]);
    setDefaultColumnsText('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const order = componentOrder
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const defaultColumns = defaultColumnsText
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
          enableAssetCsv,
          assetMatchFields: assetFields,
          components: order,
          writeInFields: writeFields,
          defaultColumns,
        });
        setTypes((t) =>
          t.map((r) =>
            r.id === editId
              ? {
                  ...r,
                  name: name.trim(),
                  gptPrompt: prompt,
                  assetPrompt: assetPrompt,
                  enableAssetCsv,
                  assetMatchFields: assetFields,
                  components: order,
                  writeInFields: writeFields,
                  defaultColumns,
                }
              : r
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'recipeTypes'), {
          name: name.trim(),
          gptPrompt: prompt,
          assetPrompt: assetPrompt,
          enableAssetCsv,
          assetMatchFields: assetFields,
          components: order,
          writeInFields: writeFields,
          defaultColumns,
        });
        setTypes((t) => [
          ...t,
          {
            id: docRef.id,
            name: name.trim(),
            gptPrompt: prompt,
            assetPrompt: assetPrompt,
            enableAssetCsv,
            assetMatchFields: assetFields,
            components: order,
            writeInFields: writeFields,
            defaultColumns,
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
    setEnableAssetCsv(!!t.enableAssetCsv);
    setAssetFields(t.assetMatchFields || []);
    setComponentOrder((t.components || []).join(', '));
    setDefaultColumnsText((t.defaultColumns || []).join(', '));
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
  placeholders.push('csv.context');
  for (let i = 1; i <= 10; i += 1) {
    placeholders.push(`csv.asset${i}`);
  }

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
                <th>Asset Fields</th>
                <th>Default Columns</th>
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
                  <td>
                    {t.assetMatchFields && t.assetMatchFields.length > 0
                      ? t.assetMatchFields.join(', ')
                      : '-'}
                  </td>
                  <td>
                    {t.defaultColumns && t.defaultColumns.length > 0
                      ? t.defaultColumns.join(', ')
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
      <form onSubmit={handleSave} className="space-y-2 max-w-[50rem]">
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
          <label className="block text-sm">
            <input
              type="checkbox"
              className="mr-1"
              checked={enableAssetCsv}
              onChange={(e) => setEnableAssetCsv(e.target.checked)}
            />
            Enable Asset CSV
          </label>
          {enableAssetCsv && (
            <div className="mt-2">
              <label className="block text-sm mb-1">Asset Match Fields</label>
              <TagInput
                id="asset-fields"
                value={assetFields}
                onChange={setAssetFields}
                suggestions={placeholders}
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm mb-1">Components (comma separated keys in order)</label>
          <input
            className="w-full p-2 border rounded"
            value={componentOrder}
            onChange={(e) => setComponentOrder(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Default Visible Columns (comma separated keys)</label>
          <input
            className="w-full p-2 border rounded"
            value={defaultColumnsText}
            onChange={(e) => setDefaultColumnsText(e.target.value)}
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
      <form onSubmit={handleSave} className="space-y-2 max-w-[50rem]">
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
                <option value="list">List</option>
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
  const [brands, setBrands] = useState([]);
  const [component, setComponent] = useState('');
  const [name, setName] = useState('');
  const [values, setValues] = useState({});
  const [brandCode, setBrandCode] = useState('');
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [csvMap, setCsvMap] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        setComponents(
          compSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              selectionMode: data.selectionMode || 'dropdown',
            };
          })
        );
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const brandSnap = await getDocs(collection(db, 'brands'));
        setBrands(brandSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    setBrandCode('');
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
          relationships: brandCode ? { brandCode } : {},
        });
        setInstances((i) =>
          i.map((ins) =>
            ins.id === editId
              ? {
                  ...ins,
                  componentKey: comp.key,
                  name: name.trim(),
                  values,
                  relationships: brandCode ? { brandCode } : {},
                }
              : ins
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'componentInstances'), {
          componentKey: comp.key,
          name: name.trim(),
          values,
          relationships: brandCode ? { brandCode } : {},
        });
        setInstances((i) => [
          ...i,
          {
            id: docRef.id,
            componentKey: comp.key,
            name: name.trim(),
            values,
            relationships: brandCode ? { brandCode } : {},
          },
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
    setBrandCode(inst.relationships?.brandCode || '');
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'componentInstances', id));
      setInstances((i) => i.filter((ins) => ins.id !== id));
    } catch (err) {
      console.error('Failed to delete instance', err);
    }
  };

  const handleCsvChange = async (e) => {
    const f = e.target.files?.[0];
    setCsvFile(f || null);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
    if (f) {
      const text = await f.text();
      const lines = text.trim().split(/\r?\n/);
      if (lines.length > 1) {
        const headers = splitCsvLine(lines[0]).map((h) => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i += 1) {
          if (lines[i]) rows.push(splitCsvLine(lines[i]).map((p) => p.trim()));
        }
        setCsvColumns(headers);
        setCsvRows(rows);
      }
    }
  };

  const handleAddCsvInstances = async () => {
    const comp = components.find((c) => c.id === component);
    if (!comp || csvRows.length === 0) return;
    for (const row of csvRows) {
      const instNameIdx = csvMap.name;
      const instName =
        instNameIdx !== undefined && instNameIdx !== ''
          ? (row[instNameIdx] || '').trim()
          : '';
      const vals = {};
      comp.attributes?.forEach((a) => {
        const idx = csvMap[a.key];
        if (idx !== undefined && idx !== '') {
          vals[a.key] = row[idx] || '';
        }
      });
      try {
        const docRef = await addDoc(collection(db, 'componentInstances'), {
          componentKey: comp.key,
          name: instName,
          values: vals,
          relationships: brandCode ? { brandCode } : {},
        });
        setInstances((i) => [
          ...i,
          {
            id: docRef.id,
            componentKey: comp.key,
            name: instName,
            values: vals,
            relationships: brandCode ? { brandCode } : {},
          },
        ]);
      } catch (err) {
        console.error('Failed to save instance from CSV', err);
      }
    }
    setCsvFile(null);
    setCsvColumns([]);
    setCsvRows([]);
    setCsvMap({});
  };

  const currentComp = components.find((c) => c.id === component);
  const filteredInstances = instances.filter((i) => {
    const term = filter.toLowerCase();
    return (
      !term ||
      i.name.toLowerCase().includes(term) ||
      i.componentKey.toLowerCase().includes(term) ||
      (i.relationships?.brandCode || '').toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <h2 className="text-xl mb-2">Component Instances</h2>
      <div className="mb-2">
        <input
          type="text"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="p-1 border rounded"
        />
      </div>
      {filteredInstances.length === 0 ? (
        <p>No instances found.</p>
      ) : (
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Component</th>
                <th>Brand</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstances.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.componentKey}</td>
                  <td>{i.relationships?.brandCode || ''}</td>
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
      <form onSubmit={handleSave} className="space-y-2 max-w-[50rem]">
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
        <div>
          <label className="block text-sm mb-1">Brand</label>
          <select
            className="w-full p-2 border rounded"
            value={brandCode}
            onChange={(e) => setBrandCode(e.target.value)}
          >
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.code}>
                {b.code} {b.name ? `- ${b.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        {currentComp && (
          <div className="space-y-2">
          {currentComp.attributes?.map((a) => {
            const val = values[a.key];
            const handleChange = (v) => setValues({ ...values, [a.key]: v });
            const toArray = (v) => {
              if (Array.isArray(v)) return v;
              if (typeof v === 'string') {
                return v
                  .split(/[;,\n]+/)
                  .map((p) => p.trim())
                  .filter(Boolean);
              }
              return [];
            };
            return (
              <div key={a.key}>
                <label className="block text-sm mb-1">{a.label}</label>
                {a.inputType === 'textarea' ? (
                  <textarea
                    className="w-full p-2 border rounded"
                    value={val || ''}
                    onChange={(e) => handleChange(e.target.value)}
                  />
                ) : a.inputType === 'list' ? (
                  <TagInput
                    id={`attr-${a.key}`}
                    value={toArray(val)}
                    onChange={handleChange}
                  />
                ) : (
                  <input
                    className="w-full p-2 border rounded"
                    type={a.inputType}
                    value={val || ''}
                    onChange={(e) => handleChange(e.target.value)}
                  />
                )}
              </div>
            );
          })}
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
      {editId && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-lg w-full relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <form onSubmit={handleSave} className="space-y-2">
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
              <div>
                <label className="block text-sm mb-1">Brand</label>
                <select
                  className="w-full p-2 border rounded"
                  value={brandCode}
                  onChange={(e) => setBrandCode(e.target.value)}
                >
                  <option value="">None</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.code}>
                      {b.code} {b.name ? `- ${b.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {currentComp && (
                <div className="space-y-2">
                  {currentComp.attributes?.map((a) => {
                    const val = values[a.key];
                    const handleChange = (v) => setValues({ ...values, [a.key]: v });
                    const toArray = (v) => {
                      if (Array.isArray(v)) return v;
                      if (typeof v === 'string') {
                        return v
                          .split(/[;,\n]+/)
                          .map((p) => p.trim())
                          .filter(Boolean);
                      }
                      return [];
                    };
                    return (
                      <div key={a.key}>
                        <label className="block text-sm mb-1">{a.label}</label>
                        {a.inputType === 'textarea' ? (
                          <textarea
                            className="w-full p-2 border rounded"
                            value={val || ''}
                            onChange={(e) => handleChange(e.target.value)}
                          />
                        ) : a.inputType === 'list' ? (
                          <TagInput
                            id={`modal-attr-${a.key}`}
                            value={toArray(val)}
                            onChange={handleChange}
                          />
                        ) : (
                          <input
                            className="w-full p-2 border rounded"
                            type={a.inputType}
                            value={val || ''}
                            onChange={(e) => handleChange(e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">Save Instance</button>
                <button type="button" onClick={resetForm} className="btn-secondary px-2 py-0.5">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {currentComp && (
        <div className="mt-8 space-y-2 max-w-[50rem]">
          <h3 className="text-lg">Bulk Add via CSV</h3>
          <input type="file" accept=".csv" onChange={handleCsvChange} />
          {csvColumns.length > 0 && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1">Name Column</label>
                <select
                  className="w-full p-2 border rounded"
                  value={csvMap.name ?? ''}
                  onChange={(e) =>
                    setCsvMap({ ...csvMap, name: e.target.value })
                  }
                >
                  <option value="">Ignore</option>
                  {csvColumns.map((c, idx) => (
                    <option key={idx} value={idx}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {currentComp.attributes?.map((a) => (
                <div key={a.key}>
                  <label className="block text-sm mb-1">{a.label} Column</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={csvMap[a.key] ?? ''}
                    onChange={(e) =>
                      setCsvMap({ ...csvMap, [a.key]: e.target.value })
                    }
                  >
                    <option value="">Ignore</option>
                    {csvColumns.map((c, idx) => (
                      <option key={idx} value={idx}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddCsvInstances}
                className="btn-primary"
              >
                Add Instances
              </button>
            </div>
          )}
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
      {view === VIEWS.PREVIEW && <RecipePreview />}
    </div>
  );
};

export default AdminRecipeSetup;
