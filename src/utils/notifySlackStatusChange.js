import { auth } from '../firebase/config';

const ensureReviewUrl = (adGroupId, providedUrl) => {
  if (!adGroupId) {
    return undefined;
  }

  const appendReviewPath = (origin, search = '', hash = '') => {
    if (!origin) return undefined;
    const query = search && search !== '?' ? search : '';
    const fragment = hash && hash !== '#' ? hash : '';
    return `${origin.replace(/\/$/, '')}/review/${adGroupId}${query}${fragment}`;
  };

  if (typeof providedUrl === 'string' && providedUrl.trim()) {
    const trimmed = providedUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.pathname.includes('/review/')) {
          return parsed.toString();
        }
        return appendReviewPath(parsed.origin, parsed.search, parsed.hash) || trimmed;
      } catch (err) {
        console.error('Failed to parse provided Slack review URL', err);
      }
    } else if (trimmed.startsWith('/')) {
      if (typeof window !== 'undefined' && window.location?.origin) {
        if (trimmed.includes('/review/')) {
          return `${window.location.origin}${trimmed}`;
        }
        return appendReviewPath(window.location.origin);
      }
      if (trimmed.includes('/review/')) {
        return trimmed;
      }
      return `/review/${adGroupId}`;
    }
  }

  if (typeof window === 'undefined' || !window.location) {
    return undefined;
  }

  const { origin = '', search = '', hash = '', href = '' } = window.location;
  if (origin) {
    return appendReviewPath(origin, search, hash) || href || undefined;
  }

  return href || undefined;
};

const ensureAdGroupUrl = (adGroupId, providedUrl) => {
  if (!adGroupId) {
    return undefined;
  }

  const buildUrl = (origin) => {
    if (!origin) return undefined;
    return `${origin.replace(/\/$/, '')}/ad-group/${adGroupId}`;
  };

  if (typeof providedUrl === 'string' && providedUrl.trim()) {
    const trimmed = providedUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        if (parsed.pathname.includes('/ad-group/')) {
          return parsed.toString();
        }
        if (parsed.pathname.includes('/review/')) {
          parsed.pathname = parsed.pathname.replace(/\/review\/(.+)$/i, `/ad-group/${adGroupId}`);
          return parsed.toString();
        }
        return buildUrl(parsed.origin) || trimmed;
      } catch (err) {
        console.error('Failed to parse provided Slack ad group URL', err);
      }
    } else if (trimmed.startsWith('/')) {
      if (trimmed.includes('/ad-group/')) {
        if (typeof window !== 'undefined' && window.location?.origin) {
          return `${window.location.origin}${trimmed}`;
        }
        return trimmed;
      }
      if (trimmed.includes('/review/')) {
        const replaced = trimmed.replace(/\/review\/(.+)$/i, `/ad-group/${adGroupId}`);
        if (typeof window !== 'undefined' && window.location?.origin) {
          return `${window.location.origin}${replaced}`;
        }
        return replaced;
      }
      if (typeof window !== 'undefined' && window.location?.origin) {
        return buildUrl(window.location.origin);
      }
      return `/ad-group/${adGroupId}`;
    }
  }

  if (typeof window === 'undefined' || !window.location) {
    return undefined;
  }

  const { origin = '', href = '' } = window.location;
  if (origin) {
    return buildUrl(origin) || href || undefined;
  }

  if (href.includes('/review/')) {
    return href.replace(/\/review\/(.+)$/i, `/ad-group/${adGroupId}`);
  }

  return href || undefined;
};

const notifySlackStatusChange = async ({
  brandCode,
  adGroupId,
  adGroupName = '',
  status,
  url,
  adGroupUrl,
  note,
} = {}) => {
  if (!brandCode || !adGroupId || !status) {
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return;
  }

  try {
    const idToken = await currentUser.getIdToken();
    if (!idToken) return;

    const payload = {
      brandCode,
      adGroupId,
      adGroupName,
      status,
    };

    const reviewUrl = ensureReviewUrl(adGroupId, url);
    if (reviewUrl) {
      payload.url = reviewUrl;
    }

    const resolvedAdGroupUrl = ensureAdGroupUrl(adGroupId, adGroupUrl || url);
    if (resolvedAdGroupUrl) {
      payload.adGroupUrl = resolvedAdGroupUrl;
    }

    if (typeof note === 'string' && note.trim()) {
      payload.note = note.trim();
    }

    const response = await fetch('/api/slack/status-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Failed to notify Slack', response.status, text);
    }
  } catch (error) {
    console.error('Failed to notify Slack', error);
  }
};

export default notifySlackStatusChange;
