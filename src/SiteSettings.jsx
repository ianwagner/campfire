import React, { useEffect, useState } from 'react';
import useSiteSettings from './useSiteSettings';
import { uploadLogo } from './uploadLogo';
import { uploadIcon } from './uploadIcon';
import { OptimizedImage } from '@studio-tak/shared-ui';

const SiteSettings = () => {
  const { settings, saveSettings } = useSiteSettings();
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [iconUrl, setIconUrl] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [accentColor, setAccentColor] = useState('#ea580c');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLogoUrl(settings.logoUrl || '');
    setLogoFile(null);
    setIconUrl(settings.iconUrl || '');
    setIconFile(null);
    setAccentColor(settings.accentColor || '#ea580c');
  }, [settings]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setLogoFile(file || null);
    if (file) {
      setLogoUrl(URL.createObjectURL(file));
    } else {
      setLogoUrl(settings.logoUrl || '');
    }
  };

  const handleIconChange = (e) => {
    const file = e.target.files[0];
    setIconFile(file || null);
    if (file) {
      setIconUrl(URL.createObjectURL(file));
    } else {
      setIconUrl(settings.iconUrl || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      let logo = logoUrl;
      if (logoFile) {
        logo = await uploadLogo(logoFile);
      }

      let icon = iconUrl;
      if (iconFile) {
        icon = await uploadIcon(iconFile);
      }

      await saveSettings({ logoUrl: logo, iconUrl: icon, accentColor });
      setLogoUrl(logo);
      setLogoFile(null);
      setIconUrl(icon);
      setIconFile(null);
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
        <h1 className="text-2xl mb-4">Site Settings</h1>
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
                loading="eager"
                className="mt-2 max-h-16 w-auto"
              />
            )}
          </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Site Icon</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleIconChange}
            className="w-full p-2 border rounded"
          />
          {iconUrl && (
            <OptimizedImage
              pngUrl={iconUrl}
              alt="Icon preview"
              loading="eager"
              className="mt-2 max-h-16 w-auto"
            />
          )}
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
  );
};

export default SiteSettings;
