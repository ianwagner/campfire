import React, { useEffect, useMemo, useState } from 'react';
import useSiteSettings from './useSiteSettings';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import SubscriptionPlansTab from './SubscriptionPlansTab';
import CreditSettingsTab from './CreditSettingsTab.jsx';
import { uploadLogo } from './uploadLogo';
import { uploadIcon } from './uploadIcon';
import { uploadCampfireLogo } from './uploadCampfireLogo';
import { uploadArtwork } from './uploadArtwork';
import OptimizedImage from './components/OptimizedImage.jsx';
import TabButton from './components/TabButton.jsx';
import { DEFAULT_MONTH_COLORS } from './constants';
import { hexToRgba } from './utils/theme.js';
import slackMessageTypes from '../lib/slackMessageTypes.json';
import slackMessagePlaceholders from '../lib/slackMessagePlaceholders.json';
import defaultSlackMessageTemplates from '../lib/slackMessageTemplates.json';

const TEMPLATE_AUDIENCES = ['internal', 'external'];

const audienceLabels = {
  internal: 'Internal workspace messages',
  external: 'Client workspace messages',
};

const getRelevantMessageTypes = (audience) =>
  (slackMessageTypes || []).filter((type) =>
    Array.isArray(type.audiences) ? type.audiences.includes(audience) : false,
  );

const normalizeTemplateInput = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (entry == null ? '' : String(entry)))
      .join('\n\n')
      .replace(/\r\n/g, '\n');
  }
  if (typeof value === 'string') {
    return value.replace(/\r\n/g, '\n');
  }
  return '';
};

const buildTemplateState = (overrides = {}) => {
  const state = {};
  TEMPLATE_AUDIENCES.forEach((audience) => {
    const defaultAudience = defaultSlackMessageTemplates?.[audience] || {};
    const overrideAudience = overrides?.[audience] || {};
    const types = getRelevantMessageTypes(audience);
    state[audience] = {};
    types.forEach(({ key }) => {
      if (Object.prototype.hasOwnProperty.call(overrideAudience, key)) {
        state[audience][key] = normalizeTemplateInput(overrideAudience[key]);
      } else if (Object.prototype.hasOwnProperty.call(defaultAudience, key)) {
        state[audience][key] = normalizeTemplateInput(defaultAudience[key]);
      } else {
        state[audience][key] = '';
      }
    });
  });
  return state;
};

const normalizeTemplateForSave = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.replace(/\r\n/g, '\n');
  const trimmedLines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n');
  return trimmedLines.trim();
};

const SiteSettings = () => {
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState('general');
  const { settings, saveSettings } = useSiteSettings();
  const baselineTemplates = useMemo(
    () => buildTemplateState(settings?.slackMessageTemplates || {}),
    [settings?.slackMessageTemplates],
  );
  const [messageTemplates, setMessageTemplates] = useState(baselineTemplates);
  const [savingTemplates, setSavingTemplates] = useState(false);
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
  const templateMessageIsError =
    typeof message === 'string' && message.toLowerCase().includes('failed');

  useEffect(() => {
    setMessageTemplates((prev) => {
      const prevJson = JSON.stringify(prev);
      const baselineJson = JSON.stringify(baselineTemplates);
      if (prevJson === baselineJson) {
        return prev;
      }
      return baselineTemplates;
    });
  }, [baselineTemplates]);

  const hasTemplateChanges = useMemo(() => {
    return JSON.stringify(messageTemplates) !== JSON.stringify(baselineTemplates);
  }, [messageTemplates, baselineTemplates]);

  useEffect(() => {
    setMessage('');
  }, [activeTab]);

  const handleTemplateChange = (audience, key, value) => {
    setMessageTemplates((prev) => ({
      ...prev,
      [audience]: {
        ...(prev[audience] || {}),
        [key]: value,
      },
    }));
  };

  const handleResetTemplates = () => {
    setMessageTemplates(buildTemplateState({}));
    setMessage('');
  };

  const handleSaveTemplates = async (event) => {
    event.preventDefault();
    if (!isAdmin) return;

    setSavingTemplates(true);
    setMessage('');
    try {
      const updated = { ...(settings.slackMessageTemplates || {}) };
      TEMPLATE_AUDIENCES.forEach((audience) => {
        const existingAudience = { ...(updated[audience] || {}) };
        const types = getRelevantMessageTypes(audience);
        types.forEach(({ key }) => {
          const normalized = normalizeTemplateForSave(
            messageTemplates?.[audience]?.[key] || '',
          );
          if (normalized) {
            existingAudience[key] = normalized;
          } else {
            delete existingAudience[key];
          }
        });
        updated[audience] = existingAudience;
      });

      await saveSettings({ slackMessageTemplates: updated });
      setMessage('Slack message templates saved');
    } catch (err) {
      console.error('Failed to save Slack message templates', err);
      setMessage('Failed to save Slack message templates');
    } finally {
      setSavingTemplates(false);
    }
  };

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
        {activeTab === 'messages' && isAdmin && (
          <form
            onSubmit={handleSaveTemplates}
            className="space-y-6 max-w-3xl"
          >
            <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Slack message templates
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Customize the Slack messages that are sent for each status. Leave a template empty to fall back to the default message.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetTemplates}
                    disabled={savingTemplates || loading}
                  >
                    Reset to defaults
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!hasTemplateChanges || savingTemplates || loading}
                  >
                    {savingTemplates ? 'Saving...' : 'Save templates'}
                  </button>
                </div>
              </div>
              {message && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    templateMessageIsError
                      ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200'
                      : 'border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 text-[var(--accent-color)] dark:border-[var(--accent-color)]/40 dark:bg-[var(--accent-color)]/10 dark:text-[var(--accent-color)]'
                  }`}
                >
                  {message}
                </div>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Separate sections with a blank line. Place
                {' '}
                <code className="rounded bg-gray-200 px-1 py-px text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-100">[divider]</code>
                {' '}
                on its own line to insert a Slack divider.
              </p>
              {TEMPLATE_AUDIENCES.map((audience) => {
                const types = getRelevantMessageTypes(audience);
                if (!types.length) return null;
                return (
                  <section key={audience} className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {audienceLabels[audience] || audience}
                    </h3>
                    <div className="space-y-6">
                      {types.map((type) => (
                        <div key={type.key} className="space-y-2">
                          <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                            {type.label}
                          </label>
                          {type.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              {type.description}
                            </p>
                          )}
                          <textarea
                            className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm leading-6 text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)] dark:text-gray-100"
                            rows={type.key === 'reviewed' ? 6 : 4}
                            value={messageTemplates?.[audience]?.[type.key] || ''}
                            onChange={(e) =>
                              handleTemplateChange(audience, type.key, e.target.value)
                            }
                            disabled={loading || savingTemplates}
                            placeholder="Enter Slack message template..."
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Available placeholders
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Use these tokens to insert dynamic values into your templates.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {slackMessagePlaceholders.map((placeholder) => (
                  <div
                    key={placeholder.key}
                    className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]"
                  >
                    <code className="rounded bg-gray-200 px-1 py-px text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                      {`{{${placeholder.key}}}`}
                    </code>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {placeholder.description}
                    </p>
                  </div>
                ))}
              </div>
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
