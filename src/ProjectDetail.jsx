import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { FiArrowLeft, FiDownload } from 'react-icons/fi';
import { db } from './firebase/config';
import StatusBadge from './components/StatusBadge.jsx';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import isVideoUrl from './utils/isVideoUrl';
import parseAdFilename from './utils/parseAdFilename';
import pickHeroAsset from './utils/pickHeroAsset';
import LoadingOverlay from './LoadingOverlay.jsx';
import Button from './components/Button.jsx';

const getAssetUrl = (asset) =>
  asset?.firebaseUrl || asset?.cdnUrl || asset?.url || asset?.thumbnailUrl || '';

const formatDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : value.toDate?.() || null;
  return date ? date.toLocaleString() : null;
};

const ProjectDetail = () => {
  const { projectId } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [copyCards, setCopyCards] = useState([]);
  const [briefAssets, setBriefAssets] = useState([]);

  useEffect(() => {
    if (!projectId) return undefined;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'adGroups', projectId));
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          setGroup({
            id: snap.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          });
        } else {
          setGroup(null);
        }
      } catch (err) {
        console.error('Failed to load ad group', err);
        if (active) setGroup(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return undefined;
    const unsubAssets = onSnapshot(
      collection(db, 'adGroups', projectId, 'assets'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAssets(list);
      },
      (err) => {
        console.error('Failed to subscribe to assets', err);
      }
    );
    const unsubCopy = onSnapshot(
      collection(db, 'adGroups', projectId, 'copyCards'),
      (snap) => setCopyCards(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error('Failed to subscribe to copy cards', err);
      }
    );
    const unsubBrief = onSnapshot(
      collection(db, 'adGroups', projectId, 'groupAssets'),
      (snap) => setBriefAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error('Failed to subscribe to brief assets', err);
      }
    );
    return () => {
      unsubAssets();
      unsubCopy();
      unsubBrief();
    };
  }, [projectId]);

  const heroAsset = useMemo(() => pickHeroAsset(assets), [assets]);

  const assetGroups = useMemo(() => {
    const map = new Map();
    assets.forEach((asset) => {
      const info = parseAdFilename(asset.filename || '');
      const key = asset.recipeCode || info.recipeCode || asset.id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(asset);
    });
    return Array.from(map.values()).map((list) => {
      const sorted = [...list].sort((a, b) => (b.version || 0) - (a.version || 0));
      const hero = pickHeroAsset(sorted) || sorted[0];
      return {
        hero,
        assets: sorted,
        info: parseAdFilename(hero?.filename || ''),
      };
    });
  }, [assets]);

  const visibleAssetGroups = useMemo(
    () =>
      assetGroups.filter((group) =>
        group.assets.some((asset) => asset.status !== 'archived')
      ),
    [assetGroups]
  );

  const approvedAssetGroups = useMemo(
    () =>
      visibleAssetGroups.filter((group) =>
        group.assets.some((asset) => asset.status === 'approved')
      ),
    [visibleAssetGroups]
  );

  const renderPreview = (asset, className = 'w-full h-full object-contain') => {
    const url = getAssetUrl(asset);
    if (!url) {
      return (
        <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
          No preview yet
        </div>
      );
    }
    return isVideoUrl(url) ? (
      <VideoPlayer src={url} className={className} autoPlay={false} controls />
    ) : (
      <OptimizedImage
        pngUrl={url}
        webpUrl={asset?.thumbnailUrl || undefined}
        alt={asset?.filename || 'Ad preview'}
        className={className}
      />
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingOverlay />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen p-6 flex flex-col gap-4">
        <div>
          <Button as={Link} to="/projects" variant="arrow" aria-label="Back to ad groups">
            <FiArrowLeft />
          </Button>
        </div>
        <div className="border rounded-xl p-6 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Ad group not found</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The ad group you are looking for may have been removed or you may not have
            access to it anymore.
          </p>
        </div>
      </div>
    );
  }

  const createdAtLabel = formatDateTime(group.createdAt);
  const dueDateLabel = formatDateTime(group.dueDate);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-[60rem] mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button as={Link} to="/projects" variant="arrow" aria-label="Back to ad groups">
            <FiArrowLeft />
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-3">
            {group.name || 'Untitled Ad Group'}
          </h1>
          <StatusBadge status={group.status} />
        </div>

        <section className="border rounded-xl p-4 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-72 aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
              {renderPreview(heroAsset)}
            </div>
            <div className="flex-1 grid gap-4 content-start">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  Brand
                </p>
                <p className="text-lg font-semibold">{group.brandCode || '—'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Ad Units
                  </p>
                  <p className="text-lg font-semibold">{visibleAssetGroups.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Approved
                  </p>
                  <p className="text-lg font-semibold">{approvedAssetGroups.length}</p>
                </div>
                {createdAtLabel && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Created
                    </p>
                    <p className="text-lg font-semibold">{createdAtLabel}</p>
                  </div>
                )}
                {dueDateLabel && (
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Due Date
                    </p>
                    <p className="text-lg font-semibold">{dueDateLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {group.notes && (
          <section className="border rounded-xl p-4 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Brief</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-200">
              {group.notes}
            </p>
          </section>
        )}

        {briefAssets.length > 0 && (
          <section className="border rounded-xl p-4 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Brief Attachments</h2>
            <ul className="space-y-2">
              {briefAssets.map((asset) => {
                const url = getAssetUrl(asset);
                return (
                  <li
                    key={asset.id}
                    className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2"
                  >
                    <span className="text-sm font-medium truncate">{asset.filename}</span>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                      >
                        <FiDownload />
                        Download
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="border rounded-xl p-4 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Ad Units</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {visibleAssetGroups.length} total
            </span>
          </div>
          {visibleAssetGroups.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This ad group doesn't have any deliverables yet. Check back soon!
            </p>
          ) : (
            <div className="space-y-4">
              {visibleAssetGroups.map((unit, idx) => {
                const primary = unit.hero;
                const ratio = unit.info.aspectRatio;
                const recipeCode = unit.info.recipeCode;
                return (
                  <div
                    key={`${primary?.id || idx}`}
                    className="flex flex-col md:flex-row gap-4 border rounded-lg p-4 bg-white dark:bg-[var(--dark-sidebar-bg)]/60"
                  >
                    <div className="w-full md:w-64 aspect-square bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden flex items-center justify-center">
                      {renderPreview(primary)}
                    </div>
                    <div className="flex-1 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">
                            {primary?.filename || recipeCode || 'Ad Unit'}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {ratio ? `Aspect ${ratio}` : 'Version history'}
                          </p>
                        </div>
                        <StatusBadge status={primary?.status} />
                      </div>
                      <div className="space-y-2">
                        {unit.assets.map((asset) => {
                          const url = getAssetUrl(asset);
                          return (
                            <div
                              key={asset.id}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <span className="font-medium truncate max-w-[12rem]">
                                {asset.filename || asset.id}
                              </span>
                              <StatusBadge status={asset.status} />
                              {url && (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs"
                                >
                                  <FiDownload />
                                  Download
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {copyCards.length > 0 && (
          <section className="border rounded-xl p-4 bg-white dark:bg-[var(--dark-sidebar-bg)] shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Copy Deck</h2>
            <div className="grid gap-3">
              {copyCards.map((card) => (
                <div
                  key={card.id}
                  className="border rounded-lg p-3 bg-white dark:bg-[var(--dark-sidebar-bg)]/60"
                >
                  {card.primary && (
                    <p className="text-sm font-semibold mb-1">{card.primary}</p>
                  )}
                  {card.headline && (
                    <p className="text-sm text-gray-700 dark:text-gray-200 mb-1">
                      {card.headline}
                    </p>
                  )}
                  {card.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {card.description}
                    </p>
                  )}
                  {card.product && (
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-2">
                      {card.product}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ProjectDetail;
