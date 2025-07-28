import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { FiEdit2, FiTrash, FiPlus } from 'react-icons/fi';
import TagInput from './TagInput.jsx';
import PromptTextarea from './PromptTextarea.jsx';
import useComponentTypes from '../useComponentTypes';
import Table from './common/Table';
import Button from './Button.jsx';
import IconButton from './IconButton.jsx';
import Modal from './Modal.jsx';
import SortButton from './SortButton.jsx';
import { db } from '../firebase/config';

const RecipeTypes = () => {
  const componentsData = useComponentTypes();
  const [types, setTypes] = useState([]);
  const [filter, setFilter] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [assetPrompt, setAssetPrompt] = useState('');
  const [componentOrder, setComponentOrder] = useState([]);
  const [fields, setFields] = useState([{ label: '', key: '', inputType: 'text' }]);
  const [enableAssetCsv, setEnableAssetCsv] = useState(false);
  const [assetFields, setAssetFields] = useState([]);
  const [defaultColumns, setDefaultColumns] = useState([]);
  const [external, setExternal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);

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
    setComponentOrder([]);
    setFields([{ label: '', key: '', inputType: 'text' }]);
    setEnableAssetCsv(false);
    setAssetFields([]);
    setDefaultColumns([]);
    setExternal(false);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const order = componentOrder.filter(Boolean);
    const defaultCols = defaultColumns.filter(Boolean);
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
          defaultColumns: defaultCols,
          external,
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
              defaultColumns: defaultCols,
              external,
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
          defaultColumns: defaultCols,
          external,
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
            defaultColumns: defaultCols,
            external,
          },
        ]);
      }
      resetForm();
      setShowModal(false);
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
    setComponentOrder(t.components || []);
    setDefaultColumns(t.defaultColumns || []);
    setExternal(!!t.external);
    setFields(
      t.writeInFields && t.writeInFields.length > 0
        ? t.writeInFields
        : [{ label: '', key: '', inputType: 'text' }]
    );
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'recipeTypes', id));
      setTypes((t) => t.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete recipe type', err);
    }
  };

  const placeholders = useMemo(() => {
    const arr = [];
    componentsData.forEach((c) => {
      c.attributes?.forEach((a) => {
        arr.push(`${c.key}.${a.key}`);
      });
    });
    fields.forEach((f) => {
      if (f.key) arr.push(f.key);
    });
    arr.push('review.name', 'review.body', 'review.title', 'review.rating', 'review.product');
    return arr;
  }, [componentsData, fields]);

  const columnOptions = useMemo(() => {
    const cols = [];
    componentsData.forEach((c) => {
      c.attributes?.forEach((a) => {
        cols.push(`${c.key}.${a.key}`);
        if (a.key === 'assetNo' || a.key === 'assetCount') {
          cols.push(`${c.key}.assets`);
        }
      });
    });
    fields.forEach((f) => {
      if (f.key) cols.push(f.key);
    });
    cols.push(
      'review.name',
      'review.body',
      'review.title',
      'review.rating',
      'review.product',
      'recipeNo',
      'copy',
    );
    return Array.from(new Set(cols));
  }, [componentsData, fields]);

  const filteredTypes = useMemo(() => {
    const term = filter.toLowerCase();
    const arr = types.filter((t) => t.name.toLowerCase().includes(term));
    arr.sort((a, b) => a.name.localeCompare(b.name));
    if (!sortAsc) arr.reverse();
    return arr;
  }, [types, filter, sortAsc]);

  return (
    <div>
      <h2 className="text-xl mb-2">Recipe Types</h2>
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="p-1 border rounded"
          />
          <SortButton
            value={sortAsc ? 'asc' : 'desc'}
            onChange={(val) => setSortAsc(val === 'asc')}
            options={[
              { value: 'asc', label: 'Sort A-Z' },
              { value: 'desc', label: 'Sort Z-A' },
            ]}
          />
        </div>
        <IconButton onClick={openCreate} aria-label="Create Recipe Type">
          <FiPlus />
        </IconButton>
      </div>
      {filteredTypes.length === 0 ? (
        <p>No recipe types found.</p>
      ) : (
        <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Components</th>
                <th>Write-In Fields</th>
                <th>Asset Prompt</th>
                <th>Asset Fields</th>
                <th>Default Columns</th>
                <th>External</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTypes.map((t) => (
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
                  <td>{t.external ? 'Yes' : 'No'}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IconButton onClick={() => startEdit(t)} aria-label="Edit">
                        <FiEdit2 />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDelete(t.id)}
                        className="btn-delete"
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </Table>
      )}
      {showModal && (
        <Modal sizeClass="max-w-2xl">
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
            Enable Asset Library
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
          <label className="block text-sm mb-1">Components (in order)</label>
          <TagInput
            id="component-order"
            value={componentOrder}
            onChange={setComponentOrder}
            suggestions={componentsData.map((c) => c.key)}
            onlySuggestions
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Default Visible Columns</label>
          <TagInput
            id="default-columns"
            value={defaultColumns}
            onChange={setDefaultColumns}
            suggestions={columnOptions}
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                className="px-2 py-0.5"
              >
                <FiTrash />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFields([...fields, { label: '', key: '', inputType: 'text' }])}
            className="px-2 py-0.5"
          >
            Add Field
          </Button>
        </div>
        <div>
          <label className="block text-sm">
            <input
              type="checkbox"
              className="mr-1"
              checked={external}
              onChange={(e) => setExternal(e.target.checked)}
            />
            External
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary">
            {editId ? 'Save Type' : 'Add Type'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(false);
            }}
            variant="secondary"
            className="px-2 py-0.5"
          >
            Cancel
          </Button>
        </div>
      </form>
        </Modal>
      )}
    </div>
  );
};

export default RecipeTypes;
