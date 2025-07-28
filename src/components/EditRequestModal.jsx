import React from 'react';
import Button from './Button.jsx';
import diffWords from '../utils/diffWords';

const EditRequestModal = ({ comment, onCommentChange, editCopy, onEditCopyChange, origCopy, canSubmit, onCancel, onSubmit, submitting }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
    <div className="bg-white p-4 rounded shadow max-w-sm w-full space-y-2 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        className="w-full p-2 border rounded"
        placeholder="Add comments..."
        rows={3}
      />
      <p className="text-sm font-medium">Change copy</p>
      <textarea
        value={editCopy}
        onChange={(e) => onEditCopyChange(e.target.value)}
        className="w-full p-2 border rounded"
        placeholder="Edit copy..."
        rows={3}
      />
      {origCopy && editCopy && editCopy !== origCopy && (
        <p className="text-sm mt-1">
          {diffWords(origCopy, editCopy).map((part, idx, arr) => {
            const text = part.text ?? part.value ?? '';
            const type = part.type ?? 'same';
            const space = idx < arr.length - 1 ? ' ' : '';
            if (type === 'same') return text + space;
            if (type === 'removed')
              return (
                <span key={idx} className="text-red-600 line-through">
                  {text}
                  {space}
                </span>
              );
            return (
              <span key={idx} className="text-green-600 italic">
                {text}
                {space}
              </span>
            );
          })}
        </p>
      )}
      <div className="flex justify-end space-x-2">
        <Button onClick={onCancel} variant="secondary" className="px-3 py-1">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="primary"
          className={`px-3 py-1 ${canSubmit ? '' : 'opacity-50 cursor-not-allowed'}`}
          disabled={submitting || !canSubmit}
        >
          Submit
        </Button>
      </div>
    </div>
  </div>
);

export default EditRequestModal;
