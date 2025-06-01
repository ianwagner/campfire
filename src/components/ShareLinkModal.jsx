import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import generatePassword from '../utils/generatePassword';

const ShareLinkModal = ({ groupId, visibility = 'private', password = '', onClose, onUpdate }) => {
  const [currentVisibility, setCurrentVisibility] = useState(visibility);
  const [pw, setPw] = useState(password);

  const url = `${window.location.origin}/review/${groupId}`;

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert('Link copied to clipboard'))
      .catch((err) => console.error('Failed to copy link', err));
  };

  const toggleVisibility = async () => {
    try {
      if (currentVisibility === 'public') {
        await updateDoc(doc(db, 'adGroups', groupId), { visibility: 'private' });
        setCurrentVisibility('private');
        onUpdate && onUpdate({ visibility: 'private' });
      } else {
        let newPw = pw;
        if (!newPw) newPw = generatePassword();
        await updateDoc(doc(db, 'adGroups', groupId), {
          visibility: 'public',
          password: newPw,
        });
        setCurrentVisibility('public');
        setPw(newPw);
        onUpdate && onUpdate({ visibility: 'public', password: newPw });
      }
    } catch (err) {
      console.error('Failed to update visibility', err);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <h3 className="mb-2 font-semibold">Public Review</h3>
        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={currentVisibility === 'public'} onChange={toggleVisibility} />
          Enable Public Review
        </label>
        {currentVisibility === 'public' && (
          <>
            <button onClick={copy} className="btn-primary mb-3 px-3 py-1">Copy Link</button>
            <label className="block mb-3 text-sm">
              Password
              <input
                type="text"
                readOnly
                value={pw}
                className="mt-1 w-full border rounded p-1 text-black dark:text-black"
              />
            </label>
          </>
        )}
        <div className="text-right">
          <button onClick={onClose} className="btn-secondary px-3 py-1">Close</button>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkModal;
