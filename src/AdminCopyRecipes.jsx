import React, { useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { FiList, FiEye, FiEdit2, FiTrash, FiPlus, FiCheckSquare } from 'react-icons/fi';
import { db } from './firebase/config';
import PromptTextarea from './components/PromptTextarea.jsx';
import TagInput from './components/TagInput.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';
import TabButton from './components/TabButton.jsx';
import Modal from './components/Modal.jsx';
import IconButton from './components/IconButton.jsx';
import SortButton from './components/SortButton.jsx';
import Button from './components/Button.jsx';

const VIEWS = {
  TYPES: 'types',
  PREVIEW: 'preview',
  RULES: 'rules',
};

const Tabs = ({ view, setView }) => (
  <div className="flex flex-wrap gap-2 mb-4">
    <TabButton active={view === VIEWS.TYPES} onClick={() => setView(VIEWS.TYPES)}>
      <FiList /> <span>Recipe Types</span>
    </TabButton>
    <TabButton active={view === VIEWS.PREVIEW} onClick={() => setView(VIEWS.PREVIEW)}>
      <FiEye /> <span>Preview</span>
    </TabButton>
    <TabButton active={view === VIEWS.RULES} onClick={() => setView(VIEWS.RULES)}>
      <FiCheckSquare /> <span>Rules</span>
    </TabButton>
  </div>
);

const CopyRecipeTypes = () => {
  const [types, setTypes] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [name, setName] = React.useState('');
  const [primaryPrompt, setPrimaryPrompt] = React.useState('');
  const [headlinePrompt, setHeadlinePrompt] = React.useState('');
  const [descriptionPrompt, setDescriptionPrompt] = React.useState('');
  const [writeFields, setWriteFields] = React.useState([{ label: '', key: '', inputType: 'text' }]);

  const placeholders = useMemo(() => {
    const arr = [
      'brand.name',
      'brand.toneOfVoice',
      'brand.offering',
      'product.name',
      'product.description',
      'product.benefits',
    ];
    writeFields.forEach((f) => {
      if (f.key) arr.push(f.key);
    });
    return arr;
  }, [writeFields]);
  const [editId, setEditId] = React.useState(null);
  const [filter, setFilter] = React.useState('');
  const [sortAsc, setSortAsc] = React.useState(true);
  const filteredTypes = React.useMemo(() => {
    const term = filter.toLowerCase();
    const arr = types.filter((t) => t.name.toLowerCase().includes(term));
    arr.sort((a, b) => a.name.localeCompare(b.name));
    if (!sortAsc) arr.reverse();
    return arr;
  }, [types, filter, sortAsc]);

  React.useEffect(() => {
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

const resetForm = () => {
  setEditId(null);
  setName('');
  setPrimaryPrompt('');
  setHeadlinePrompt('');
  setDescriptionPrompt('');
  setWriteFields([{ label: '', key: '', inputType: 'text' }]);
};

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const data = {
      name: name.trim(),
      primaryPrompt,
      headlinePrompt,
      descriptionPrompt,
      writeInFields: writeFields,
    };
    try {
      if (editId) {
        await updateDoc(doc(db, 'copyRecipeTypes', editId), data);
        setTypes((t) => t.map((r) => (r.id === editId ? { ...r, ...data } : r)));
      } else {
        const ref = await addDoc(collection(db, 'copyRecipeTypes'), data);
        setTypes((t) => [...t, { id: ref.id, ...data }]);
      }
      resetForm();
      setShowModal(false);
    } catch (err) {
      console.error('Failed to save type', err);
    }
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setName(t.name);
    setPrimaryPrompt(t.primaryPrompt || '');
    setHeadlinePrompt(t.headlinePrompt || '');
    setDescriptionPrompt(t.descriptionPrompt || '');
    setWriteFields(
      t.writeInFields && t.writeInFields.length > 0
        ? t.writeInFields
        : [{ label: '', key: '', inputType: 'text' }]
    );
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'copyRecipeTypes', id));
      setTypes((t) => t.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete type', err);
    }
  };

  return (
    <div>
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
        <div className="overflow-x-auto table-container mb-4">
          <table className="ad-table min-w-max text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Primary Prompt</th>
                <th>Headline Prompt</th>
                <th>Description Prompt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTypes.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="whitespace-pre-wrap break-words max-w-xs">
                    {t.primaryPrompt || '-'}
                  </td>
                  <td className="whitespace-pre-wrap break-words max-w-xs">
                    {t.headlinePrompt || '-'}
                  </td>
                  <td className="whitespace-pre-wrap break-words max-w-xs">
                    {t.descriptionPrompt || '-'}
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IconButton onClick={() => startEdit(t)} aria-label="Edit">
                        <FiEdit2 />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDelete(t.id)}
                        aria-label="Delete"
                      >
                        <FiTrash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <Modal sizeClass="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-2 max-w-xl">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input
                className="w-full p-2 border rounded"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
        <div>
          <label className="block text-sm mb-1">Primary Prompt</label>
          <PromptTextarea
            value={primaryPrompt}
            onChange={setPrimaryPrompt}
            placeholders={placeholders}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Headline Prompt</label>
          <PromptTextarea
            value={headlinePrompt}
            onChange={setHeadlinePrompt}
            placeholders={placeholders}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Description Prompt</label>
          <PromptTextarea
            value={descriptionPrompt}
            onChange={setDescriptionPrompt}
            placeholders={placeholders}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Write-In Fields</label>
          {writeFields.map((f, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                className="p-2 border rounded flex-1"
                placeholder="Label"
                value={f.label}
                onChange={(e) => {
                  const arr = [...writeFields];
                  arr[idx].label = e.target.value;
                  setWriteFields(arr);
                }}
              />
              <input
                className="p-2 border rounded flex-1"
                placeholder="Key"
                value={f.key}
                onChange={(e) => {
                  const arr = [...writeFields];
                  arr[idx].key = e.target.value;
                  setWriteFields(arr);
                }}
              />
              <select
                className="p-2 border rounded"
                value={f.inputType}
                onChange={(e) => {
                  const arr = [...writeFields];
                  arr[idx].inputType = e.target.value;
                  setWriteFields(arr);
                }}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="textarea">Textarea</option>
                <option value="image">Image</option>
                <option value="list">List</option>
              </select>
              {f.inputType === 'list' && (
                <TagInput
                  id={`list-${idx}`}
                  value={Array.isArray(f.options) ? f.options : []}
                  onChange={(arr) => {
                    const copy = [...writeFields];
                    copy[idx].options = arr;
                    setWriteFields(copy);
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => setWriteFields(writeFields.filter((_, i) => i !== idx))}
                className="btn-secondary px-2 py-0.5"
              >
                <FiTrash />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWriteFields([...writeFields, { label: '', key: '', inputType: 'text' }])}
            className="btn-secondary px-2 py-0.5"
          >
            Add Field
          </button>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            {editId ? 'Save Type' : 'Add Type'}
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(false);
            }}
            className="btn-secondary px-2 py-0.5"
          >
            Cancel
          </button>
        </div>
      </form>
        </Modal>
      )}
    </div>
  );
};

const AdminCopyRecipes = () => {
  const [view, setView] = useState(VIEWS.TYPES);
  return (
    <div className="min-h-screen p-4 space-y-4">
      <h1 className="text-2xl mb-2">Copy Recipes</h1>
      <Tabs view={view} setView={setView} />
      {view === VIEWS.TYPES && <CopyRecipeTypes />}
      {view === VIEWS.PREVIEW && <CopyRecipePreview />}
      {view === VIEWS.RULES && <p>Guidelines coming soon.</p>}
    </div>
  );
};

export default AdminCopyRecipes;

