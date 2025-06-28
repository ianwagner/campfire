import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';

const AdminBrandDetail = () => {
  const { id } = useParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [offering, setOffering] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'brands', id));
        if (snap.exists()) {
          const data = snap.data();
          setCode(data.code || '');
          setName(data.name || '');
          setAgencyId(data.agencyId || '');
          setToneOfVoice(data.toneOfVoice || '');
          setOffering(data.offering || '');
        }
      } catch (err) {
        console.error('Failed to load brand', err);
      }
    };
    load();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setMessage('');
    try {
      await updateDoc(doc(db, 'brands', id), {
        code: code.trim(),
        name: name.trim(),
        agencyId: agencyId.trim(),
        toneOfVoice: toneOfVoice.trim(),
        offering: offering.trim(),
      });
      setMessage('Brand updated');
    } catch (err) {
      console.error('Failed to update brand', err);
      setMessage('Failed to update brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
      <h1 className="text-2xl mb-4">Edit Brand</h1>
      <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
        <div>
          <label className="block mb-1 text-sm font-medium">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Agency ID</label>
          <input
            type="text"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Tone of Voice</label>
          <input
            type="text"
            value={toneOfVoice}
            onChange={(e) => setToneOfVoice(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Offering</label>
          <input
            type="text"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        {message && <p className="text-sm text-center">{message}</p>}
        <button type="submit" className="w-full btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Brand'}
        </button>
      </form>
    </div>
  );
};

export default AdminBrandDetail;
