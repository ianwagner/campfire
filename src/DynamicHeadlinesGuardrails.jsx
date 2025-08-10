import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import SaveButton from './components/SaveButton.jsx';
import useHeadlineGuardrails from './useHeadlineGuardrails.js';

const DynamicHeadlinesGuardrails = () => {
  const { guardrails, saveGuardrails } = useHeadlineGuardrails();
  const [form, setForm] = useState({
    maxLength: 60,
    noExclamation: false,
    noPrice: false,
    blocklistText: '',
    avoidRepeatGreeting: false,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activity, setActivity] = useState([]);
  const [typeNames, setTypeNames] = useState({});

  useEffect(() => {
    setForm({
      maxLength: guardrails.maxLength || 60,
      noExclamation: !!guardrails.noExclamation,
      noPrice: !!guardrails.noPrice,
      blocklistText: Array.isArray(guardrails.blocklist)
        ? guardrails.blocklist.join('\n')
        : '',
      avoidRepeatGreeting: !!guardrails.avoidRepeatGreeting,
    });
    setDirty(false);
  }, [guardrails]);

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const q = query(
          collection(db, 'headlineActivity'),
          orderBy('timestamp', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setActivity(items);
        const ids = [...new Set(items.map((i) => i.typeId))];
        const typeSnaps = await Promise.all(
          ids.map((id) => getDoc(doc(db, 'headlineTypes', id)))
        );
        const map = {};
        typeSnaps.forEach((s, idx) => {
          if (s.exists()) {
            const data = s.data();
            map[ids[idx]] = data.title || data.name || ids[idx];
          }
        });
        setTypeNames(map);
      } catch (err) {
        console.error('Failed to load headline activity', err);
        setActivity([]);
      }
    };
    loadActivity();
  }, []);

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGuardrails({
        maxLength: Number(form.maxLength),
        noExclamation: form.noExclamation,
        noPrice: form.noPrice,
        blocklist: form.blocklistText
          .split(/\n+/)
          .map((w) => w.trim())
          .filter(Boolean),
        avoidRepeatGreeting: form.avoidRepeatGreeting,
      });
      setDirty(false);
    } catch (err) {
      console.error('Failed to save guardrails', err);
    } finally {
      setSaving(false);
    }
  };

  const handleHide = async (typeId, templateId, id) => {
    try {
      const snap = await getDoc(doc(db, 'headlineTypes', typeId));
      if (snap.exists()) {
        const data = snap.data();
        const templates = Array.isArray(data.templates) ? data.templates : [];
        const updated = templates.map((t) =>
          t.id === templateId ? { ...t, enabled: false } : t
        );
        await setDoc(doc(db, 'headlineTypes', typeId), { templates: updated }, { merge: true });
        setActivity((arr) => arr.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Failed to disable template', err);
    }
  };

  return (
    <PageWrapper title="Dynamic Headlines Guardrails">
      <PageToolbar
        right={
          <SaveButton onClick={handleSave} canSave={dirty && !saving} loading={saving} />
        }
      />
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block mb-1 text-sm font-medium">Max Length</label>
          <input
            type="number"
            name="maxLength"
            value={form.maxLength}
            onChange={handleChange}
            className="w-full p-1 border rounded"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="noExclamation"
            checked={form.noExclamation}
            onChange={handleChange}
          />
          <label>No exclamation marks</label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="noPrice"
            checked={form.noPrice}
            onChange={handleChange}
          />
          <label>No price/discount language</label>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Blocklist Words</label>
          <textarea
            name="blocklistText"
            value={form.blocklistText}
            onChange={handleChange}
            className="w-full p-1 border rounded h-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="avoidRepeatGreeting"
            checked={form.avoidRepeatGreeting}
            onChange={handleChange}
          />
          <label>Avoid repeating the same greeting twice in a row</label>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Recent Activity</h2>
        {activity.length === 0 ? (
          <p>No activity.</p>
        ) : (
          <ul className="space-y-4">
            {activity.map((a) => (
              <li key={a.id} className="border p-2 rounded">
                <div className="text-sm text-gray-500 mb-1">
                  {a.timestamp?.toDate
                    ? a.timestamp.toDate().toLocaleString()
                    : ''}{' '}
                  - {a.audience} - {typeNames[a.typeId] || a.typeId}
                </div>
                <div className="mb-2">{a.hydratedText}</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="btn-secondary"
                    onClick={() => handleHide(a.typeId, a.templateId, a.id)}
                  >
                    Hide going forward
                  </button>
                  <Link
                    className="btn-secondary"
                    to={`/admin/dynamic-headlines/${a.typeId}?template=${a.templateId}`}
                  >
                    Edit source template
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageWrapper>
  );
};

export default DynamicHeadlinesGuardrails;
