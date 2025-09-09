import React from 'react';
import Button from './Button.jsx';

const FeedbackModal = ({ comment, onCommentChange, onSubmit, onClose, submitting }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
    <div className="bg-white p-4 rounded-xl shadow max-w-sm w-full space-y-2 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <h1 className="text-lg font-semibold">How can we help?</h1>
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        className="w-full p-2 border rounded bg-white dark:bg-[var(--dark-sidebar-bg)] dark:border-[var(--dark-sidebar-hover)] dark:text-[var(--dark-text)]"
        placeholder="leave overall feedback..."
        rows={4}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} variant="secondary" className="px-3 py-1">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="primary"
          className="px-3 py-1"
          disabled={submitting || !comment.trim()}
        >
          Submit
        </Button>
      </div>
    </div>
  </div>
);

export default FeedbackModal;
