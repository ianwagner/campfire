import React from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from './OptimizedImage.jsx';
import MonthTag from './MonthTag.jsx';
import parseAdFilename from '../utils/parseAdFilename';

const BADGE_VARIANT_CLASSES = {
  info:
    'bg-[var(--accent-color-10)] text-[var(--accent-color)] dark:bg-[var(--accent-color-10)] dark:text-[var(--accent-color)] border-[var(--accent-color-10)] dark:border-[var(--accent-color-10)]',
  warning:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100 border-amber-200 dark:border-amber-500/30',
  neutral:
    'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-200 border-gray-200 dark:border-gray-600/80',
};

const ReviewGroupCard = ({
  group,
  to,
  statusLabel,
  badges = [],
}) => {
  const previewAds = Array.isArray(group.previewAds) ? group.previewAds : [];

  const getAspectRatio = (ad) =>
    ad?.aspectRatio || parseAdFilename(ad?.filename || '').aspectRatio || '';

  const getPreviewUrl = (ad) =>
    ad?.thumbnailUrl || ad?.url || ad?.firebaseUrl || ad?.pngUrl || '';

  const previewCandidates = previewAds.filter((ad) => Boolean(getPreviewUrl(ad)));

  const previewAd =
    previewCandidates.find((ad) => getAspectRatio(ad) === '1x1') ||
    previewCandidates[0] ||
    null;

  const previewUrl = previewAd ? getPreviewUrl(previewAd) : '';

  const hasPreviewImage = Boolean(previewUrl);
  const shouldShowLogo =
    group.showLogo === true || (!hasPreviewImage && Boolean(group.brandLogo));
  const aspect = '1/1';

  const containerClasses = [
    'relative w-full overflow-hidden rounded-t-2xl',
    !hasPreviewImage ? 'bg-gray-200 dark:bg-gray-700' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const totalAds =
    typeof group.totalAds === 'number' && !Number.isNaN(group.totalAds)
      ? group.totalAds
      : previewAds.length;

  const updatedLabel = group.updatedAt
    ? group.updatedAt.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const combinedBadges = [
    ...(statusLabel
      ? [
          {
            label: statusLabel,
            variant: 'info',
          },
        ]
      : []),
    ...badges,
  ];

  const badgeClassFor = (variant = 'neutral') =>
    `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
      BADGE_VARIANT_CLASSES[variant] || BADGE_VARIANT_CLASSES.neutral
    }`;

  return (
    <Link
      to={to || `/review/${group.id}`}
      className="group block rounded-2xl border border-gray-200 bg-white text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]"
    >
      <div className={containerClasses} style={{ aspectRatio: aspect }}>
        {hasPreviewImage ? (
          <OptimizedImage
            key={previewAd?.id || previewUrl}
            pngUrl={previewUrl}
            cacheKey={previewAd?.firebaseUrl || previewUrl}
            alt={group.name || 'Ad preview'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : shouldShowLogo && group.brandLogo ? (
          <OptimizedImage
            pngUrl={group.brandLogo}
            alt={`${group.name || 'Brand'} logo`}
            className="absolute inset-0 h-full w-full object-contain bg-white p-6 dark:bg-[var(--dark-sidebar-bg)]"
          />
        ) : !hasPreviewImage ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-3xl font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-200">
            {(group.name || '?').slice(0, 1).toUpperCase()}
          </div>
        ) : null}
      </div>
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-[var(--dark-text)]">
            {group.name}
          </h3>
          {(combinedBadges.length > 0 || group.month || totalAds) && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              {combinedBadges.map((badge, idx) => (
                <span key={`${badge.label}-${idx}`} className={badgeClassFor(badge.variant)}>
                  {badge.label}
                </span>
              ))}
              {group.month && <MonthTag month={group.month} />}
              {totalAds > 0 && (
                <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200">
                  {totalAds} ads
                </span>
              )}
            </div>
          )}
        </div>
        {updatedLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Updated {updatedLabel}</p>
        )}
      </div>
    </Link>
  );
};

export default ReviewGroupCard;

