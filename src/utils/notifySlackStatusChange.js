import { auth } from '../firebase/config';

const buildFallbackUrl = (adGroupId, providedUrl) => {
  if (providedUrl) return providedUrl;
  if (typeof window === 'undefined') return undefined;

  const { location } = window;
  if (!location) return undefined;

  const origin = location.origin || '';
  if (origin && adGroupId) {
    return `${origin}/ad-groups/${adGroupId}`;
  }

  return location.href || undefined;
};

const notifySlackStatusChange = async ({
  brandCode,
  adGroupId,
  adGroupName = '',
  status,
  url,
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

    const detailUrl = buildFallbackUrl(adGroupId, url);
    if (detailUrl) {
      payload.url = detailUrl;
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
