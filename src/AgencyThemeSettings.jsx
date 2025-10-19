import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useAgencyTheme from './useAgencyTheme';
import { uploadLogo } from './uploadLogo';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import OptimizedImage from './components/OptimizedImage.jsx';

const AgencyThemeSettings = ({ agencyId: propAgencyId }) => {
  const locId = new URLSearchParams(useLocation().search).get('agencyId');
  const agencyId = propAgencyId || locId;
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [themeColor, setThemeColor] = useState(DEFAULT_ACCENT_COLOR);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    setLogoUrl(agency.logoUrl || '');
    setThemeColor(agency.themeColor || DEFAULT_ACCENT_COLOR);
    setLogoFile(null);
  }, [agency]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setLogoFile(file || null);
    if (file) {
      setLogoUrl(URL.createObjectURL(file));
    } else {
      setLogoUrl(agency.logoUrl || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agencyId) return;
    setLoading(true);
    setMessage('');
    setMessageType('success');
    try {
      let url = logoUrl;
      if (logoFile) {
        url = await uploadLogo(logoFile);
      }
      await saveAgency({ logoUrl: url, themeColor });
      setLogoFile(null);
      setMessage('Settings saved');
      setMessageType('success');
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage('Failed to save settings');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Branding</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Update the logo and accent color used across the agency dashboard experience.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Upload Logo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
              />
              {logoUrl && (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                  <OptimizedImage
                    pngUrl={logoUrl}
                    alt="Logo preview"
                    loading="eager"
                    className="h-16 w-auto object-contain"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Preview</p>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="h-12 w-20 cursor-pointer overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">Used for buttons and highlights</span>
              </div>
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${
                messageType === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
              role="status"
            >
              {message}
            </p>
          )}
          <div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AgencyThemeSettings;
