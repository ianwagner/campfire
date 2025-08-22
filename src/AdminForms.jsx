import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencies from './useAgencies';
import Table from './components/common/Table';

const blankField = () => ({ id: Date.now().toString(), label: '', type: 'text', required: false });

const AdminForms = () => {
  const [forms, setForms] = useState([]);
  const [editing, setEditing] = useState(null); // {id, name, agencyId, fields}
  const { agencies } = useAgencies();

  const agencyMap = React.useMemo(() => {
    const map = {};
    agencies.forEach((a) => (map[a.id] = a.name || a.id));
    return map;
  }, [agencies]);

  const loadForms = async () => {
    try {
      const snap = await getDocs(collection(db, 'forms'));
      setForms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); 
    } catch (err) {
      console.error('Failed to load forms', err);
      setForms([]);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const startCreate = () => {
    setEditing({ id: null, name: '', agencyId: '', fields: [] });
  };

  const startEdit = (form) => {
    setEditing({
      id: form.id,
      name: form.name || '',
      agencyId: form.agencyId || '',
      fields: form.fields || [],
    });
  };

  const updateField = (index, key, value) => {
    setEditing((prev) => {
      const fields = [...prev.fields];
      fields[index] = { ...fields[index], [key]: value };
      return { ...prev, fields };
    });
  };

  const addField = () => {
    setEditing((prev) => ({ ...prev, fields: [...prev.fields, blankField()] }));
  };

  const removeField = (index) => {
    setEditing((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const saveForm = async () => {
    if (!editing) return;
    const data = {
      name: editing.name,
      agencyId: editing.agencyId || null,
      fields: editing.fields,
    };
    try {
      if (editing.id) {
        await updateDoc(doc(db, 'forms', editing.id), data);
      } else {
        await addDoc(collection(db, 'forms'), data);
      }
      setEditing(null);
      await loadForms();
    } catch (err) {
      console.error('Failed to save form', err);
    }
  };

  const cancelEdit = () => setEditing(null);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Forms</h1>
      {editing ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="font-semibold">Form Name</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="p-1 border rounded"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-semibold">Agency</label>
            <select
              value={editing.agencyId}
              onChange={(e) => setEditing({ ...editing, agencyId: e.target.value })}
              className="p-1 border rounded"
            >
              <option value="">Default</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <h2 className="text-xl mb-2">Fields</h2>
            {editing.fields.map((field, idx) => (
              <div key={field.id} className="flex flex-wrap items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Label"
                  value={field.label}
                  onChange={(e) => updateField(idx, 'label', e.target.value)}
                  className="p-1 border rounded"
                />
                <select
                  value={field.type}
                  onChange={(e) => updateField(idx, 'type', e.target.value)}
                  className="p-1 border rounded"
                >
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(idx, 'required', e.target.checked)}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  className="text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addField}
              className="px-2 py-1 border rounded"
            >
              Add Field
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveForm}
              className="px-4 py-1 bg-blue-600 text-white rounded"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-1 border rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={startCreate}
            className="mb-4 px-4 py-1 bg-green-600 text-white rounded"
          >
            New Form
          </button>
          {forms.length === 0 ? (
            <p>No forms found.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Agency</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>{form.name || form.id}</td>
                    <td>{form.agencyId ? agencyMap[form.agencyId] || form.agencyId : 'Default'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => startEdit(form)}
                        className="text-blue-600 underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminForms;
