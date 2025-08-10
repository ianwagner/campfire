import React, { useState, useEffect } from 'react';
import ScrollModal from './components/ScrollModal.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { FiInfo, FiChevronDown } from 'react-icons/fi';
import { db, auth } from './firebase/config';
import UrlCheckInput from './components/UrlCheckInput.jsx';
import useUserRole from './useUserRole';
import getMonthString from './utils/getMonthString.js';
import useSiteSettings from './useSiteSettings';
import { DEFAULT_MONTH_COLORS } from './constants.js';

const DescribeProjectModal = ({ onClose, brandCodes = [], request = null }) => {
  const [title, setTitle] = useState('');
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const [dueDate, setDueDate] = useState('');
  const [month, setMonth] = useState('');
  const [numAds, setNumAds] = useState(1);
  const [assetLinks, setAssetLinks] = useState(['']);
  const [details, setDetails] = useState('');

  const { role, agencyId } = useUserRole(auth.currentUser?.uid);
  const isAgency = role === 'agency' || !!agencyId;
  const { settings } = useSiteSettings();
  const monthColors = settings.monthColors || DEFAULT_MONTH_COLORS;
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      value: getMonthString(d),
      label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
    };
  });
  const monthColorEntry = monthColors[month?.slice(-2)] || null;
  const monthLabel =
    month
      ? new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(-2)) - 1,
          1
        ).toLocaleString('default', { month: 'short' })
      : '';

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
      setDetails(request.details || '');
      setMonth(request.month || '');
    }
  }, [request, brandCodes]);

  const addAssetLink = () => {
    setAssetLinks((l) => [...l, '']);
  };

  const handleAssetLinkChange = (idx, val) => {
    setAssetLinks((arr) => {
      const next = [...arr];
      next[idx] = val;
      return next;
    });
  };

  const removeAssetLink = (idx) => {
    setAssetLinks((arr) => {
      const next = arr.filter((_, i) => i !== idx);
      return next.length ? next : [''];
    });
  };

  // URL verification handled by UrlCheckInput component

  const handleSave = async () => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) {
      window.alert('Please enter a title before saving.');
      return;
    }
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
          month: month || null,
        });
        if (projectId) {
          await updateDoc(doc(db, 'projects', projectId), {
            title: title.trim(),
            brandCode,
            status: 'processing',
            month: month || null,
            ...(agencyId ? { agencyId } : {}),
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
          month: month || null,
          agencyId: agencyId || null,
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
          month: month || null,
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
        month: month || null,
      });
    } catch (err) {
      console.error('Failed to create project request', err);
    }
  };

  return (
    <ScrollModal
      sizeClass="max-w-md w-full"
      header={<h2 className="text-xl font-semibold p-2">Describe Project</h2>}
    >
      <div className="space-y-3 p-2">
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
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Due Date:</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="border tag-pill px-2 py-1 text-sm"
            />
          </div>
          {isAgency && (
            <div className="relative">
              <select
                aria-label="Month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div
                className="pointer-events-none text-white tag-pill px-2 py-0.5 pr-3 text-xs flex items-center"
                style={{ backgroundColor: monthColorEntry?.color }}
              >
                {monthLabel}
                <FiChevronDown className="ml-1" />
              </div>
            </div>
          )}
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
            <UrlCheckInput
              key={idx}
              value={link}
              onChange={(val) => handleAssetLinkChange(idx, val)}
              onRemove={() => removeAssetLink(idx)}
              inputClass="p-2"
              className="mb-1"
            />
          ))}
          <button
            type="button"
            onClick={addAssetLink}
            className="text-sm text-[var(--accent-color)] underline mb-2"
          >
            Add another link
          </button>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Details</label>
          <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="w-full p-2 border rounded" />
        </div>
      </div>
      <div className="flex justify-end gap-2 p-2">
        <button className="btn-secondary" onClick={() => onClose(null)}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>Save</button>
      </div>
    </ScrollModal>
  );
};

export default DescribeProjectModal;
