import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useAgencyTheme from './useAgencyTheme';
import { uploadLogo } from './uploadLogo';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import OptimizedImage from './components/OptimizedImage.jsx';

const AgencyThemeSettings = () => {
  const agencyId = new URLSearchParams(useLocation().search).get('agencyId');
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [themeColor, setThemeColor] = useState(DEFAULT_ACCENT_COLOR);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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
    try {
      let url = logoUrl;
      if (logoFile) {
        url = await uploadLogo(logoFile);
      }
      await saveAgency({ logoUrl: url, themeColor });
      setLogoFile(null);
      setMessage('Settings saved');
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Agency Theme</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="block mb-1 text-sm font-medium">Logo</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full p-2 border rounded"
          />
          {logoUrl && (
            <OptimizedImage
              pngUrl={logoUrl}
              alt="Logo preview"
              className="mt-2 max-h-16 w-auto"
            />
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Theme Color</label>
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="w-full p-2 border rounded h-10"
          />
        </div>
        {message && <p className="text-sm">{message}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};

export default AgencyThemeSettings;
