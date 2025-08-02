import React, { useState, useEffect } from 'react';
import Modal from './components/Modal.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FiInfo, FiCheckCircle, FiX } from 'react-icons/fi';
import { db, auth, functions } from './firebase/config';

const DescribeProjectModal = ({ onClose, brandCodes = [], request = null }) => {
  const [title, setTitle] = useState('');
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const [dueDate, setDueDate] = useState('');
  const [numAds, setNumAds] = useState(1);
  const [assetLinks, setAssetLinks] = useState(['']);
  const [linkStatus, setLinkStatus] = useState([null]);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (request) {
      setTitle(request.title || '');
      setBrandCode(request.brandCode || brandCodes[0] || '');
      setDueDate(
        request.dueDate
          ? (request.dueDate.toDate
              ? request.dueDate.toDate()
              : new Date(request.dueDate)
            )
              .toISOString()
              .slice(0, 10)
          : ''
      );
      setNumAds(request.numAds || 1);
      setAssetLinks(request.assetLinks && request.assetLinks.length ? request.assetLinks : ['']);
      setLinkStatus(
        request.assetLinks && request.assetLinks.length
          ? request.assetLinks.map(() => null)
          : [null]
      );
      setDetails(request.details || '');
    }
  }, [request, brandCodes]);

  const addAssetLink = () => {
    setAssetLinks((l) => [...l, '']);
    setLinkStatus((s) => [...s, null]);
  };

  const handleAssetLinkChange = (idx, val) => {
    setAssetLinks((arr) => {
      const next = [...arr];
      next[idx] = val;
      return next;
    });
    setLinkStatus((s) => {
      const next = [...s];
      next[idx] = null;
      return next;
    });
  };

  const removeAssetLink = (idx) => {
    setAssetLinks((arr) => {
      const next = arr.filter((_, i) => i !== idx);
      return next.length ? next : [''];
    });
    setLinkStatus((s) => {
      const next = s.filter((_, i) => i !== idx);
      return next.length ? next : [null];
    });
  };

  const verifyLink = async (idx) => {
    const url = assetLinks[idx];
    if (!url) return;
    setLinkStatus((s) => {
      const next = [...s];
      next[idx] = 'loading';
      return next;
    });
    try {
      const callable = httpsCallable(functions, 'verifyDriveAccess', { timeout: 60000 });
      await callable({ url });
      setLinkStatus((s) => {
        const next = [...s];
        next[idx] = true;
        return next;
      });
    } catch (err) {
      setLinkStatus((s) => {
        const next = [...s];
        next[idx] = false;
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    try {
      let projectId = request?.projectId;
      if (request) {
        await updateDoc(doc(db, 'requests', request.id), {
          brandCode,
          title: title.trim(),
          dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
          numAds: Number(numAds) || 0,
          assetLinks: (assetLinks || []).filter((l) => l),
          details,
        });
        if (projectId) {
          await updateDoc(doc(db, 'projects', projectId), {
            title: title.trim(),
            brandCode,
            status: 'processing',
          });
        }
      } else {
        const projRef = await addDoc(collection(db, 'projects'), {
          title: title.trim(),
          recipeTypes: [],
          brandCode,
          status: 'processing',
          createdAt: serverTimestamp(),
          userId: auth.currentUser?.uid || null,
        });
        projectId = projRef.id;
        await addDoc(collection(db, 'requests'), {
          type: 'newAds',
          brandCode,
          title: title.trim(),
          dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
          numAds: Number(numAds) || 0,
          assetLinks: (assetLinks || []).filter((l) => l),
          details,
          status: 'new',
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || null,
          projectId,
        });
      }

      onClose({
        id: projectId,
        title: title.trim(),
        status: 'processing',
        brandCode,
        dueDate: dueDate ? new Date(dueDate) : null,
        numAds: Number(numAds) || 0,
        assetLinks: (assetLinks || []).filter((l) => l),
        details,
      });
    } catch (err) {
      console.error('Failed to create project request', err);
    }
  };

  return (
    <Modal sizeClass="max-w-md w-full max-h-[90vh] overflow-auto">
      <h2 className="text-xl font-semibold mb-4">Describe Project</h2>
      <div className="space-y-3 mb-4">
        {brandCodes.length > 1 && (
          <div>
            <label className="block mb-1 text-sm font-medium">Brand</label>
            <select value={brandCode} onChange={(e) => setBrandCode(e.target.value)} className="w-full p-2 border rounded">
              {brandCodes.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Number of Ads</label>
          <input type="number" min="1" value={numAds} onChange={(e) => setNumAds(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
              <label className="block mb-1 text-sm font-medium flex items-center gap-1">
            Gdrive Link
            <InfoTooltip text="Add a link to new assets you'd like to use." maxWidth={200}>
              <FiInfo className="text-gray-500" />
            </InfoTooltip>
          </label>
          {assetLinks.map((link, idx) => (
            <div key={idx} className="relative flex items-center gap-2 mb-1">
              <input
                type="text"
                value={link}
                onChange={(e) => handleAssetLinkChange(idx, e.target.value)}
                onBlur={() => verifyLink(idx)}
                className={`flex-1 p-2 border rounded ${linkStatus[idx] === false ? 'line-through' : ''}`}
              />
              {linkStatus[idx] === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <div className="loading-ring w-4 h-4" />
                </div>
              )}
              {linkStatus[idx] === true && <FiCheckCircle className="text-green-600" />}
              {linkStatus[idx] === false && (
                <InfoTooltip text="We can’t access this link. Please make sure it’s set to “anyone can view” or the folder may be empty." maxWidth={250}>
                  <FiX className="text-red-600 cursor-pointer" onClick={() => removeAssetLink(idx)} />
                </InfoTooltip>
              )}
            </div>
          ))}
          <button type="button" onClick={addAssetLink} className="text-sm text-blue-600 underline mb-2">
            Add another link
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Details</label>
          <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full p-2 border rounded" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={() => onClose(null)}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>Save</button>
      </div>
    </Modal>
  );
};

export default DescribeProjectModal;
