import React, { useEffect, useMemo, useState } from 'react';
import useAgencyTheme from './useAgencyTheme';
import useSlackChannels, { normalizeSlackChannelIds } from './useSlackChannels';
import useSiteSettings from './useSiteSettings';

const AgencySlackNotifications = ({ agencyId }) => {
  const { agency, saveAgency } = useAgencyTheme(agencyId);
  const { channels: slackChannels, loading: slackChannelsLoading } = useSlackChannels();
  const { settings: siteSettings } = useSiteSettings(false);
  const baselineMode = agency.slackNotificationMode === 'custom' ? 'custom' : 'default';
  const baselineChannelIds = useMemo(
    () => normalizeSlackChannelIds(agency.slackNotificationChannelIds || []),
    [agency.slackNotificationChannelIds],
  );
  const [mode, setMode] = useState(baselineMode);
  const [channelIds, setChannelIds] = useState(baselineChannelIds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const selectedChannelIds = useMemo(
    () => normalizeSlackChannelIds(channelIds),
    [channelIds],
  );

  useEffect(() => {
    setMode(baselineMode);
  }, [baselineMode]);

  useEffect(() => {
    setChannelIds(baselineChannelIds);
  }, [baselineChannelIds]);

  const defaultChannelIds = useMemo(
    () => normalizeSlackChannelIds(siteSettings?.defaultSlackNotificationChannelIds || []),
    [siteSettings?.defaultSlackNotificationChannelIds],
  );

  const defaultChannelDetails = useMemo(() => {
    if (!defaultChannelIds.length) {
      return [];
    }
    return defaultChannelIds.map((id) => {
      const channel = slackChannels.find((entry) => entry.id === id);
      const label = channel?.channelName ? `#${channel.channelName}` : `#${id}`;
      const audience = channel?.audience === 'internal' ? 'internal' : 'external';
      return { id, label, audience };
    });
  }, [defaultChannelIds, slackChannels]);

  const toggleChannel = (id, checked) => {
    setChannelIds((prev) => {
      const normalized = normalizeSlackChannelIds(prev);
      if (checked) {
        if (normalized.includes(id)) {
          return normalized;
        }
        return [...normalized, id];
      }
      return normalized.filter((entry) => entry !== id);
    });
    setMessage('');
    setMessageType('success');
  };

  const handleReset = () => {
    setMode(baselineMode);
    setChannelIds(baselineChannelIds);
    setMessage('');
    setMessageType('success');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageType('success');
    try {
      const payload = {
        slackNotificationMode: mode,
        slackNotificationChannelIds: mode === 'custom' ? selectedChannelIds : [],
      };
      await saveAgency(payload);
      setMessage('Slack notifications updated');
      setMessageType('success');
    } catch (err) {
      console.error('Failed to save agency Slack notifications', err);
      setMessage('Failed to save Slack notifications');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (mode !== baselineMode) {
      return true;
    }
    return (
      JSON.stringify(selectedChannelIds) !== JSON.stringify(baselineChannelIds)
    );
  }, [mode, baselineMode, selectedChannelIds, baselineChannelIds]);

  const messageClassName =
    messageType === 'error'
      ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200'
      : 'border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 text-[var(--accent-color)] dark:border-[var(--accent-color)]/40 dark:bg-[var(--accent-color)]/10 dark:text-[var(--accent-color)]';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Slack notifications
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Control which Slack channels receive ad group status updates for this agency.
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <input
                type="radio"
                name="slack-notification-mode"
                value="default"
                checked={mode === 'default'}
                onChange={() => setMode('default')}
                className="mt-1 h-4 w-4 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                disabled={saving}
              />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Use default notifications</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Brands will receive updates in the default channels:
                </p>
                <ul className="mt-1 list-disc pl-4 text-xs text-gray-600 dark:text-gray-400">
                  {defaultChannelDetails.length ? (
                    defaultChannelDetails.map(({ id, label, audience }) => (
                      <li key={id}>
                        {label}{' '}
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-500">
                          {audience === 'internal' ? 'Internal workspace' : 'Client workspace'}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="list-none pl-0">No default Slack channels configured</li>
                  )}
                </ul>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <input
                type="radio"
                name="slack-notification-mode"
                value="custom"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
                className="mt-1 h-4 w-4 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                disabled={saving}
              />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Use custom notifications</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Select the channels that should receive updates for brands assigned to this agency.
                </p>
              </div>
            </label>
          </div>
          {mode === 'custom' && (
            <div className="space-y-3">
              {slackChannelsLoading ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">Loading Slack channels...</p>
              ) : slackChannels.length ? (
                slackChannels.map((channel) => {
                  const label = channel.channelName || channel.id;
                  const normalizedId = channel.id;
                  const checked = selectedChannelIds.includes(normalizedId);
                  return (
                    <label
                      key={channel.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                        checked={checked}
                        onChange={(event) => toggleChannel(normalizedId, event.target.checked)}
                        disabled={saving}
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Audience: {channel.audience === 'internal' ? 'Internal workspace' : 'Client workspace'}
                        </p>
                        {channel.workspaceId && (
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            Workspace ID: {channel.workspaceId}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  No Slack channels have been connected yet.
                </p>
              )}
            </div>
          )}
          {message && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${messageClassName}`}>
              {message}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !hasChanges}
            >
              {saving ? 'Saving...' : 'Save notifications'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              disabled={saving}
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AgencySlackNotifications;
