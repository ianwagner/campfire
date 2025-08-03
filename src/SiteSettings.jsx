import React, { useEffect, useState } from 'react';
import useSiteSettings from './useSiteSettings';
import useAdminClaim from './useAdminClaim';
import SubscriptionPlansTab from './SubscriptionPlansTab';
import { uploadLogo } from './uploadLogo';
import { uploadIcon } from './uploadIcon';
import { uploadCampfireLogo } from './uploadCampfireLogo';
import { uploadArtwork } from './uploadArtwork';
import OptimizedImage from './components/OptimizedImage.jsx';

const SiteSettings = () => {
  const { isAdmin } = useAdminClaim();
  const [activeTab, setActiveTab] = useState('general');
  const { settings, saveSettings } = useSiteSettings();
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [campfireLogoUrl, setCampfireLogoUrl] = useState('');
  const [campfireLogoFile, setCampfireLogoFile] = useState(null);
  const [iconUrl, setIconUrl] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [artworkFile, setArtworkFile] = useState(null);
  const [accentColor, setAccentColor] = useState('#ea580c');
  const [projectCreationCost, setProjectCreationCost] = useState('1');
  const [editRequestCost, setEditRequestCost] = useState('1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLogoUrl(settings.logoUrl || '');
    setLogoFile(null);
    setCampfireLogoUrl(settings.campfireLogoUrl || '');
    setCampfireLogoFile(null);
    setIconUrl(settings.iconUrl || '');
    setIconFile(null);
    setArtworkUrl(settings.artworkUrl || '');
    setArtworkFile(null);
    setAccentColor(settings.accentColor || '#ea580c');
    setProjectCreationCost(
      String(settings.creditCosts?.projectCreation ?? 1)
    );
    setEditRequestCost(
      String(settings.creditCosts?.editRequest ?? 1)
    );
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

  const handleCampfireLogoChange = (e) => {
    const file = e.target.files[0];
    setCampfireLogoFile(file || null);
    if (file) {
      setCampfireLogoUrl(URL.createObjectURL(file));
    } else {
      setCampfireLogoUrl(settings.campfireLogoUrl || '');
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

  const handleArtworkChange = (e) => {
    const file = e.target.files[0];
    setArtworkFile(file || null);
    if (file) {
      setArtworkUrl(URL.createObjectURL(file));
    } else {
      setArtworkUrl(settings.artworkUrl || '');
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

      let campfireLogo = campfireLogoUrl;
      if (campfireLogoFile) {
        campfireLogo = await uploadCampfireLogo(campfireLogoFile);
      }

      let icon = iconUrl;
      if (iconFile) {
        icon = await uploadIcon(iconFile);
      }

      let artwork = artworkUrl;
      if (artworkFile) {
        artwork = await uploadArtwork(artworkFile);
      }

      await saveSettings({
        logoUrl: logo,
        iconUrl: icon,
        accentColor,
        campfireLogoUrl: campfireLogo,
        artworkUrl: artwork,
        creditCosts: {
          projectCreation: Number(projectCreationCost) || 0,
          editRequest: Number(editRequestCost) || 0,
        },
      });
      setLogoUrl(logo);
      setLogoFile(null);
      setCampfireLogoUrl(campfireLogo);
      setCampfireLogoFile(null);
      setIconUrl(icon);
      setIconFile(null);
      setArtworkUrl(artwork);
      setArtworkFile(null);
      setProjectCreationCost(String(Number(projectCreationCost) || 0));
      setEditRequestCost(String(Number(editRequestCost) || 0));
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
        <div className="mb-4 flex space-x-4 border-b">
          <button
            type="button"
            className={`pb-2 ${activeTab === 'general' ? 'border-b-2 border-black' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`pb-2 ${activeTab === 'plans' ? 'border-b-2 border-black' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              Subscription Plans
            </button>
          )}
        </div>
        {activeTab === 'general' && (
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
            <label className="block mb-1 text-sm font-medium">Campfire Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleCampfireLogoChange}
              className="w-full p-2 border rounded"
            />
            {campfireLogoUrl && (
              <OptimizedImage
                pngUrl={campfireLogoUrl}
                alt="Campfire logo preview"
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
          <label className="block mb-1 text-sm font-medium">Artwork</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleArtworkChange}
            className="w-full p-2 border rounded"
          />
          {artworkUrl && (
            <OptimizedImage
              pngUrl={artworkUrl}
              alt="Artwork preview"
              loading="eager"
              className="mt-2 max-h-16 w-auto"
            />
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Project Creation Cost</label>
          <input
            type="number"
            min="0"
            value={projectCreationCost}
            onChange={(e) => setProjectCreationCost(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium">Edit Request Cost</label>
          <input
            type="number"
            min="0"
            value={editRequestCost}
            onChange={(e) => setEditRequestCost(e.target.value)}
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
        )}
        {isAdmin && activeTab === 'plans' && <SubscriptionPlansTab />}
    </div>
  );
};

export default SiteSettings;
