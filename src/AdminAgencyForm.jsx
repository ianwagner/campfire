import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import { DEFAULT_ACCENT_COLOR } from './themeColors';

const idPattern = /^[a-zA-Z0-9_-]{3,}$/;

const AdminAgencyForm = () => {
  const [agencyId, setAgencyId] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const trimmedId = agencyId.trim();
    if (!trimmedId) {
      setError('Agency ID is required.');
      return;
    }
    if (!idPattern.test(trimmedId)) {
      setError('Agency ID can only include letters, numbers, underscores, or hyphens.');
      return;
    }

    setLoading(true);
    try {
      const ref = doc(db, 'agencies', trimmedId);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        setError('An agency with this ID already exists. Choose a different ID.');
        return;
      }

      await setDoc(ref, {
        name: name.trim() || null,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        logoUrl: '',
        themeColor: DEFAULT_ACCENT_COLOR,
        enableDescribeProject: true,
        enableGenerateBrief: true,
        allowedRecipeTypes: [],
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null,
      });

      setAgencyId('');
      setName('');
      setTagline('');
      setDescription('');
      setMessage('Agency created');
    } catch (err) {
      console.error('Failed to create agency', err);
      setError('Failed to create agency. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/admin/agencies" className="btn-arrow" aria-label="Back to agencies">
              &lt;
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Create Agency</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Define the agency profile so you can assign it to team members and customize settings later.
              </p>
            </div>
          </div>
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="agency-id">
                    Agency ID
                  </label>
                  <input
                    id="agency-id"
                    type="text"
                    value={agencyId}
                    onChange={(e) => setAgencyId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                    placeholder="e.g. northwind-agency"
                    autoComplete="off"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This ID appears in URLs and on user profiles. Use letters, numbers, hyphens, or underscores.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="agency-name">
                    Display name
                  </label>
                  <input
                    id="agency-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                    placeholder="Northwind Agency"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="agency-tagline">
                    Tagline
                  </label>
                  <input
                    id="agency-tagline"
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                    placeholder="Optional short description"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="agency-description">
                    Description
                  </label>
                  <textarea
                    id="agency-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-200"
                    placeholder="What should teammates know about this agency?"
                  />
                </div>
              </div>
              {(error || message) && (
                <p
                  className={`text-sm ${error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                  role="status"
                >
                  {error || message}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Create agency'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate('/admin/agencies')}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminAgencyForm;
