import React from 'react';
import Button from './Button.jsx';
import diffWords from '../utils/diffWords';

const EditRequestModal = ({
  mode = 'all',
  comment,
  onCommentChange,
  editCopy,
  onEditCopyChange,
  origCopy,
  canSubmit,
  onCancel,
  onSubmit,
  submitting,
}) => {
  const showCommentField = mode !== 'copy';
  const showCopyField = mode !== 'note';
  const notePlaceholder =
    mode === 'note' ? 'Add a note for the designer...' : 'Add comments...';
  const copyLabel = mode === 'copy' ? 'Copy edit' : 'Change copy';

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded-xl shadow max-w-sm w-full space-y-3 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        {showCommentField && (
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder={notePlaceholder}
            rows={4}
          />
        )}
        {showCopyField && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{copyLabel}</p>
            <textarea
              value={editCopy}
              onChange={(e) => onEditCopyChange(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Edit copy..."
              rows={4}
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
          </div>
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
};

export default EditRequestModal;
