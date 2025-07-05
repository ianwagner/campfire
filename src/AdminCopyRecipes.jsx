import React, { useState } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { FiList, FiEye, FiEdit2, FiTrash } from 'react-icons/fi';
import { db } from './firebase/config';
import PromptTextarea from './components/PromptTextarea.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';

const VIEWS = {
  TYPES: 'types',
  PREVIEW: 'preview',
  RULES: 'rules',
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
        view === VIEWS.PREVIEW ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.PREVIEW)}
    >
      <FiEye /> <span>Preview</span>
    </button>
    <button
      className={`px-3 py-1 rounded flex items-center gap-1 ${
        view === VIEWS.RULES ? 'bg-accent-10 text-accent' : 'border'
      }`}
      onClick={() => setView(VIEWS.RULES)}
    >
      <FiEye /> <span>Rules</span>
    </button>
  </div>
);

const CopyRecipeTypes = () => {
  const [types, setTypes] = React.useState([]);
  const [name, setName] = React.useState('');
  const [primaryPrompt, setPrimaryPrompt] = React.useState('');
  const [headlinePrompt, setHeadlinePrompt] = React.useState('');
  const [descriptionPrompt, setDescriptionPrompt] = React.useState('');
  const [editId, setEditId] = React.useState(null);

  React.useEffect(() => {
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

  const resetForm = () => {
    setEditId(null);
    setName('');
    setPrimaryPrompt('');
    setHeadlinePrompt('');
    setDescriptionPrompt('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const data = {
      name: name.trim(),
      primaryPrompt,
      headlinePrompt,
      descriptionPrompt,
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
      {types.length === 0 ? (
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
              {types.map((t) => (
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
                      <button
                        onClick={() => startEdit(t)}
                        className="btn-secondary px-1.5 py-0.5 text-xs flex items-center gap-1"
                        aria-label="Edit"
                      >
                        <FiEdit2 />
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
          <PromptTextarea value={primaryPrompt} onChange={setPrimaryPrompt} />
        </div>
        <div>
          <label className="block text-sm mb-1">Headline Prompt</label>
          <PromptTextarea value={headlinePrompt} onChange={setHeadlinePrompt} />
        </div>
        <div>
          <label className="block text-sm mb-1">Description Prompt</label>
          <PromptTextarea value={descriptionPrompt} onChange={setDescriptionPrompt} />
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

