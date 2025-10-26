import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';

const normalizeAudience = (value) => {
  if (typeof value !== 'string') {
    return 'external';
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'internal' || trimmed === 'external') {
    return trimmed;
  }
  return 'external';
};

const normalizeChannel = (doc) => {
  if (!doc) return null;
  const data = doc.data() || {};
  const id = doc.id;
  if (!id) return null;

  const channelName = typeof data.channelName === 'string' ? data.channelName.trim() : '';
  const audience = normalizeAudience(data.audience);
  const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId.trim() : '';
  const brandCodes = Array.isArray(data.brandCodes)
    ? data.brandCodes.map((code) => (typeof code === 'string' ? code.trim() : '')).filter(Boolean)
    : Array.isArray(data.brandCodesNormalized)
    ? data.brandCodesNormalized.map((code) => (typeof code === 'string' ? code.trim() : '')).filter(Boolean)
    : [];

  return {
    id,
    channelName,
    audience,
    workspaceId,
    brandCodes,
  };
};

const sortChannels = (a, b) => {
  if (a.audience !== b.audience) {
    return a.audience === 'internal' ? -1 : 1;
  }
  const nameA = a.channelName || a.id;
  const nameB = b.channelName || b.id;
  return nameA.localeCompare(nameB);
};

export const normalizeSlackChannelIds = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean),
    ),
  );
};

const useSlackChannels = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(collection(db, 'slackChannelMappings'));
      const mapped = snap.docs
        .map((doc) => normalizeChannel(doc))
        .filter(Boolean)
        .sort(sortChannels);
      setChannels(mapped);
    } catch (err) {
      console.error('Failed to load Slack channels', err);
      setChannels([]);
      setError('Failed to load Slack channels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    channels,
    loading,
    error,
    refresh: load,
  };
};

export default useSlackChannels;
