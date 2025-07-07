import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { FiEdit2, FiTrash } from 'react-icons/fi';
import TagInput from './TagInput.jsx';
import Table from './common/Table';
import Button from './Button.jsx';
import { splitCsvLine } from '../utils/csv.js';
import { db } from '../firebase/config';
import { uploadInstanceImage } from '../uploadInstanceImage.js';

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
            return { id: d.id, ...data, selectionMode: data.selectionMode || 'dropdown' };
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
      const vals = { ...values };
      for (const a of comp.attributes || []) {
        if (a.inputType === 'image') {
          const val = values[a.key];
          if (val?.file) {
            // eslint-disable-next-line no-await-in-loop
            vals[a.key] = await uploadInstanceImage(val.file, comp.key, name.trim());
          } else if (val?.url) {
            vals[a.key] = val.url;
          } else {
            vals[a.key] = '';
          }
        }
      }

      if (editId) {
        await updateDoc(doc(db, 'componentInstances', editId), {
          componentKey: comp.key,
          name: name.trim(),
          values: vals,
          relationships: brandCode ? { brandCode } : {},
        });
        setInstances((i) =>
          i.map((ins) =>
            ins.id === editId
              ? { ...ins, componentKey: comp.key, name: name.trim(), values: vals, relationships: brandCode ? { brandCode } : {} }
              : ins
          )
        );
      } else {
        const docRef = await addDoc(collection(db, 'componentInstances'), {
          componentKey: comp.key,
          name: name.trim(),
          values: vals,
          relationships: brandCode ? { brandCode } : {},
        });
        setInstances((i) => [
          ...i,
          { id: docRef.id, componentKey: comp.key, name: name.trim(), values: vals, relationships: brandCode ? { brandCode } : {} },
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
    const vals = {};
    if (comp) {
      comp.attributes?.forEach((a) => {
        const raw = inst.values?.[a.key];
        if (a.inputType === 'image') {
          vals[a.key] = raw ? { url: raw, file: null } : { url: '', file: null };
        } else {
          vals[a.key] = raw;
        }
      });
    } else {
      Object.assign(vals, inst.values || {});
    }
    setValues(vals);
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
      const instName = instNameIdx !== undefined && instNameIdx !== '' ? (row[instNameIdx] || '').trim() : '';
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
          { id: docRef.id, componentKey: comp.key, name: instName, values: vals, relationships: brandCode ? { brandCode } : {} },
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
        <input type="text" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="p-1 border rounded" />
      </div>
      {filteredInstances.length === 0 ? (
        <p>No instances found.</p>
      ) : (
        <Table>
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
                      <Button
                        variant="action"
                        onClick={() => startEdit(i)}
                        className="mr-2"
                        aria-label="Edit"
                      >
                        <FiEdit2 />
                        <span className="ml-1">Edit</span>
                      </Button>
                      <Button
                        variant="action"
                        onClick={() => handleDelete(i.id)}
                        className="btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
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
          <select className="w-full p-2 border rounded" value={brandCode} onChange={(e) => setBrandCode(e.target.value)}>
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
                    <textarea className="w-full p-2 border rounded" value={val || ''} onChange={(e) => handleChange(e.target.value)} />
                  ) : a.inputType === 'list' ? (
                    <TagInput id={`attr-${a.key}`} value={toArray(val)} onChange={handleChange} />
                  ) : a.inputType === 'image' ? (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleChange({
                            url: e.target.files[0]
                              ? URL.createObjectURL(e.target.files[0])
                              : val?.url || '',
                            file: e.target.files[0] || null,
                          })
                        }
                        className="w-full p-2 border rounded"
                      />
                      {val?.url && (
                        <img src={val.url} alt={a.label} className="mt-1 max-w-[125px] w-auto h-auto" />
                      )}
                    </div>
                  ) : (
                    <input className="w-full p-2 border rounded" type={a.inputType} value={val || ''} onChange={(e) => handleChange(e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="primary">
            {editId ? 'Save Instance' : 'Add Instance'}
          </Button>
          {editId && (
            <Button type="button" onClick={resetForm} variant="secondary" className="px-2 py-0.5">
              Cancel
            </Button>
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
                <select className="w-full p-2 border rounded" value={brandCode} onChange={(e) => setBrandCode(e.target.value)}>
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
                          <textarea className="w-full p-2 border rounded" value={val || ''} onChange={(e) => handleChange(e.target.value)} />
                        ) : a.inputType === 'list' ? (
                          <TagInput id={`modal-attr-${a.key}`} value={toArray(val)} onChange={handleChange} />
                        ) : a.inputType === 'image' ? (
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                handleChange({
                                  url: e.target.files[0]
                                    ? URL.createObjectURL(e.target.files[0])
                                    : val?.url || '',
                                  file: e.target.files[0] || null,
                                })
                              }
                              className="w-full p-2 border rounded"
                            />
                            {val?.url && (
                              <img src={val.url} alt={a.label} className="mt-1 max-w-[125px] w-auto h-auto" />
                            )}
                          </div>
                        ) : (
                          <input className="w-full p-2 border rounded" type={a.inputType} value={val || ''} onChange={(e) => handleChange(e.target.value)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" variant="primary">Save Instance</Button>
                <Button type="button" onClick={resetForm} variant="secondary" className="px-2 py-0.5">Cancel</Button>
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
                <select className="w-full p-2 border rounded" value={csvMap.name ?? ''} onChange={(e) => setCsvMap({ ...csvMap, name: e.target.value })}>
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
                  <select className="w-full p-2 border rounded" value={csvMap[a.key] ?? ''} onChange={(e) => setCsvMap({ ...csvMap, [a.key]: e.target.value })}>
                    <option value="">Ignore</option>
                    {csvColumns.map((c, idx) => (
                      <option key={idx} value={idx}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button type="button" onClick={handleAddCsvInstances} variant="primary">
                Add Instances
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InstancesView;
