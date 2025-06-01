import React from 'react';

const ShareLinkModal = ({ url, password, onClose }) => {
  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => window.alert('Link copied to clipboard'))
      .catch((err) => console.error('Failed to copy link', err));
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <h3 className="mb-2 font-semibold">Share Link</h3>
        <button onClick={copy} className="btn-primary mb-3 px-3 py-1">Copy Link</button>
        <label className="block mb-3 text-sm">
          Password
          <input
            type="text"
            readOnly
            value={password}
            className="mt-1 w-full border rounded p-1 text-black dark:text-black"
          />
        </label>
        <div className="text-right">
          <button onClick={onClose} className="btn-secondary px-3 py-1">Close</button>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkModal;
