import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencies from './useAgencies';
import { generateUniquePublicSlug } from './utils/generatePublicSlug.js';

const driveIdRegex = /^[\w-]{10,}$/;
const isValidDriveId = (id) => driveIdRegex.test(id);

const AdminBrandForm = () => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [offering, setOffering] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { agencies } = useAgencies();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!code.trim()) return;
    const trimmedId = driveFolderId.trim();
    if (trimmedId && !isValidDriveId(trimmedId)) {
      setMessage('Drive folder ID is malformed');
      return;
    }
    setLoading(true);
    try {
      const publicSlug = await generateUniquePublicSlug(db);
      await addDoc(collection(db, 'brands'), {
        code: code.trim(),
        name: name.trim(),
        agencyId: agencyId.trim(),
        toneOfVoice: toneOfVoice.trim(),
        offering: offering.trim(),
        driveFolderId: driveFolderId.trim(),
        archived: false,
        archivedAt: null,
        archivedBy: null,
        createdAt: serverTimestamp(),
        subscriptionPlanId: null,
        credits: 0,
        lastCreditReset: serverTimestamp(),
        stripeCustomerId: null,
        publicDashboardSlug: publicSlug,
      });
      setCode('');
      setName('');
      setAgencyId('');
      setToneOfVoice('');
      setOffering('');
      setDriveFolderId('');
      setMessage('Brand added');
    } catch (err) {
      console.error('Failed to add brand', err);
      setMessage('Failed to add brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
        <h1 className="text-2xl mb-4">Add Brand</h1>
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
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">Select agency</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
        <div>
          <label className="block mb-1 text-sm font-medium">Drive Folder ID</label>
          <input
            type="text"
            value={driveFolderId}
            onChange={(e) => setDriveFolderId(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Optional Google Drive folder ID"
          />
          <p className="text-xs text-gray-600 mt-1">
            Optional. Use the ID from the folder's URL and share the folder with the service account to store uploaded ads.
          </p>
        </div>
        {message && <p className="text-sm text-center">{message}</p>}
          <button
            type="submit"
            className="w-full btn-primary"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Add Brand'}
          </button>
        </form>
      </div>
    );
};

export default AdminBrandForm;
