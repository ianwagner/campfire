import React, { useEffect, useState } from 'react';
import useSiteSettings from './useSiteSettings';
import useAdminClaim from './useAdminClaim';
import SubscriptionPlansTab from './SubscriptionPlansTab';
import CreditSettingsTab from './CreditSettingsTab.jsx';
import { uploadLogo } from './uploadLogo';
import { uploadIcon } from './uploadIcon';
import { uploadCampfireLogo } from './uploadCampfireLogo';
import { uploadArtwork } from './uploadArtwork';
import OptimizedImage from './components/OptimizedImage.jsx';
import TabButton from './components/TabButton.jsx';
import { DEFAULT_MONTH_COLORS } from './constants';
import slackMessageConfig from '../lib/slackMessageConfig.json';
import { hexToRgba } from './utils/theme.js';

const MESSAGE_TYPES = slackMessageConfig.types || [];
const TEMPLATE_TYPE_IDS = MESSAGE_TYPES.map((type) => type.id);
const PLACEHOLDERS = slackMessageConfig.placeholders || [];

const normalizeTemplateFormValues = (templates) => {
  const normalized = {};
  TEMPLATE_TYPE_IDS.forEach((typeId) => {
    const entry = templates?.[typeId] || {};
    const internal = entry?.internal;
    const external = entry?.external;
    const toText = (value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value.text === 'string') return value.text;
      return '';
    };
    normalized[typeId] = {
      internal: toText(internal),
      external: toText(external),
    };
  });
  return normalized;
};

const buildTemplateSavePayload = (formState) => {
  const payload = {};
  TEMPLATE_TYPE_IDS.forEach((typeId) => {
    const entry = formState?.[typeId] || { internal: '', external: '' };
    payload[typeId] = {
      internal: { text: entry.internal || '' },
      external: { text: entry.external || '' },
    };
  });
  return payload;
};

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
  const [monthColors, setMonthColors] = useState(DEFAULT_MONTH_COLORS);
  const [tagStrokeWeight, setTagStrokeWeight] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [templateForm, setTemplateForm] = useState(() =>
    normalizeTemplateFormValues(settings.slackMessageTemplates)
  );
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateMessage, setTemplateMessage] = useState('');
  const [templateError, setTemplateError] = useState('');

  const normalizeMonthColors = (colors) => {
    const normalized = {};
    Object.entries(DEFAULT_MONTH_COLORS).forEach(([m, def]) => {
      const val = colors?.[m];
      if (typeof val === 'string') {
        normalized[m] = { color: val, opacity: 1, textColor: def.textColor };
      } else if (val) {
        normalized[m] = {
          color: val.color || def.color,
          opacity: val.opacity != null ? val.opacity : def.opacity,
          textColor: val.textColor || def.textColor,
        };
      } else {
        normalized[m] = { ...def };
      }
    });
    return normalized;
  };

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
    setMonthColors(normalizeMonthColors(settings.monthColors));
    setTagStrokeWeight(settings.tagStrokeWeight || 1);
    setTemplateForm(normalizeTemplateFormValues(settings.slackMessageTemplates));
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

  const handleTemplateChange = (typeId, field) => (e) => {
    const value = e.target.value;
    setTemplateForm((prev) => ({
      ...prev,
      [typeId]: {
        ...(prev?.[typeId] || { internal: '', external: '' }),
        [field]: value,
      },
    }));
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    setTemplateSaving(true);
    setTemplateMessage('');
    setTemplateError('');
    try {
      const payload = buildTemplateSavePayload(templateForm);
      await saveSettings({ slackMessageTemplates: payload });
      setTemplateMessage('Slack message templates saved');
    } catch (err) {
      console.error('Failed to save Slack message templates', err);
      setTemplateError('Failed to save Slack message templates');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleTemplateReset = () => {
    setTemplateForm(normalizeTemplateFormValues(settings.slackMessageTemplates));
    setTemplateMessage('');
    setTemplateError('');
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
        monthColors,
        tagStrokeWeight,
        campfireLogoUrl: campfireLogo,
        artworkUrl: artwork,
      });
      setLogoUrl(logo);
      setLogoFile(null);
      setCampfireLogoUrl(campfireLogo);
      setCampfireLogoFile(null);
      setIconUrl(icon);
      setIconFile(null);
      setArtworkUrl(artwork);
      setArtworkFile(null);
      setMonthColors(monthColors);
      setTagStrokeWeight(tagStrokeWeight);
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
        <div className="flex flex-wrap gap-2 mb-4">
          <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
            General
          </TabButton>
          {isAdmin && (
            <TabButton
              active={activeTab === 'messages'}
              onClick={() => setActiveTab('messages')}
            >
              Slack Messages
            </TabButton>
          )}
          {isAdmin && (
            <TabButton
              active={activeTab === 'credits'}
              onClick={() => setActiveTab('credits')}
            >
              Credit Settings
            </TabButton>
          )}
          {isAdmin && (
            <TabButton
              active={activeTab === 'plans'}
              onClick={() => setActiveTab('plans')}
            >
              Subscription Plans
            </TabButton>
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
          <label className="block mb-1 text-sm font-medium">Accent Color</label>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-full p-2 border rounded h-10"
          />
        </div>
        {isAdmin && (
          <div>
            <label className="block mb-1 text-sm font-medium">Month Colors</label>
            <div className="mb-2 flex items-center gap-2">
              <span className="w-20 text-sm">Stroke</span>
              <input
                type="number"
                min="0"
                value={tagStrokeWeight}
                onChange={(e) => setTagStrokeWeight(Number(e.target.value))}
                className="w-16 p-2 border rounded text-sm"
              />
              <span className="text-sm">px</span>
            </div>
            <div className="space-y-2">
              {Object.entries(monthColors)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([m, { color, opacity, textColor }]) => {
                  const label = new Date(2020, Number(m) - 1).toLocaleString(
                    'default',
                    {
                      month: 'short',
                    }
                  );
                  const previewBg =
                    color && opacity < 1 && color.startsWith('#')
                      ? hexToRgba(color, opacity)
                      : color;
                  return (
                    <div key={m} className="flex items-center gap-2">
                      <span className="w-8 text-sm">{label}</span>
                      <input
                        type="text"
                        value={textColor}
                        onChange={(e) =>
                          setMonthColors((prev) => ({
                            ...prev,
                            [m]: { ...prev[m], textColor: e.target.value },
                          }))
                        }
                        className="w-24 p-2 border rounded text-sm"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) =>
                          setMonthColors((prev) => ({
                            ...prev,
                            [m]: { ...prev[m], color: e.target.value },
                          }))
                        }
                        className="w-24 p-2 border rounded text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={Math.round((opacity ?? 1) * 100)}
                          onChange={(e) =>
                            setMonthColors((prev) => ({
                              ...prev,
                              [m]: {
                                ...prev[m],
                                opacity: Number(e.target.value) / 100,
                              },
                            }))
                          }
                          className="w-16 p-2 border rounded text-sm"
                        />
                        <span className="text-sm">%</span>
                      </div>
                      <span
                        className="tag-pill px-2 py-0.5 text-xs"
                        style={{
                          backgroundColor: previewBg,
                          color: textColor,
                          borderColor: textColor,
                          borderWidth: tagStrokeWeight,
                          borderStyle: 'solid',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
          {message && <p className="text-sm">{message}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
        )}
        {isAdmin && activeTab === 'messages' && (
          <form onSubmit={handleTemplateSubmit} className="space-y-6 max-w-5xl">
            <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Slack message templates</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Customize the Slack notifications sent for each status update. Use the placeholders below to inject live data when messages are sent.
                </p>
              </div>
              {templateMessage && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
                  {templateMessage}
                </div>
              )}
              {templateError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                  {templateError}
                </div>
              )}
              <div className="space-y-5">
                {MESSAGE_TYPES.map((type) => {
                  const values = templateForm?.[type.id] || { internal: '', external: '' };
                  const defaults = slackMessageConfig.defaults?.[type.id] || {};
                  return (
                    <section
                      key={type.id}
                      className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
                    >
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{type.label}</h3>
                        <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{type.id}</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Internal message</label>
                          <textarea
                            rows={6}
                            className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={values.internal}
                            onChange={handleTemplateChange(type.id, 'internal')}
                            placeholder={typeof defaults.internal === 'string' ? defaults.internal : ''}
                            disabled={templateSaving}
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Sent to Campfire internal Slack channels.
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">External message</label>
                          <textarea
                            rows={6}
                            className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-100"
                            value={values.external}
                            onChange={handleTemplateChange(type.id, 'external')}
                            placeholder={typeof defaults.external === 'string' ? defaults.external : ''}
                            disabled={templateSaving}
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Sent to connected client Slack workspaces.
                          </p>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="rounded-xl border border-dashed border-gray-300 bg-white/70 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Available placeholders</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {PLACEHOLDERS.map((placeholder) => (
                    <div
                      key={placeholder.id}
                      className="rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                    >
                      <div className="font-mono text-xs text-gray-800 dark:text-gray-100">{`{{${placeholder.id}}}`}</div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{placeholder.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary" disabled={templateSaving}>
                {templateSaving ? 'Saving...' : 'Save Slack Templates'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleTemplateReset}
                disabled={templateSaving}
              >
                Reset changes
              </button>
            </div>
          </form>
        )}
        {isAdmin && activeTab === 'credits' && (
          <CreditSettingsTab settings={settings} saveSettings={saveSettings} />
        )}
        {isAdmin && activeTab === 'plans' && <SubscriptionPlansTab />}
    </div>
  );
};

export default SiteSettings;
