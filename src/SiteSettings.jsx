import React, { useEffect, useState } from 'react';
import AdminSidebar from './AdminSidebar';
import useSiteSettings from './useSiteSettings';

const SiteSettings = () => {
  const { settings, saveSettings } = useSiteSettings();
  const [logoUrl, setLogoUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#ea580c');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLogoUrl(settings.logoUrl || '');
    setAccentColor(settings.accentColor || '#ea580c');
  }, [settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await saveSettings({ logoUrl, accentColor });
      setMessage('Settings saved');
    } catch (err) {
      console.error('Failed to save settings', err);
      setMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-grow p-4">
        <h1 className="text-2xl mb-4">Site Settings</h1>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div>
            <label className="block mb-1 text-sm font-medium">Logo URL</label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Accent Color</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-full p-2 border rounded h-10"
            />
          </div>
          {message && <p className="text-sm">{message}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SiteSettings;
