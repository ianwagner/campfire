// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { FiX, FiGrid, FiCheck, FiType, FiMessageSquare } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
  setDoc,
  arrayUnion,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencyTheme from './useAgencyTheme';
import { DEFAULT_LOGO_URL } from './constants';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import GalleryModal from './components/GalleryModal.jsx';
import VersionModal from './components/VersionModal.jsx';
import EditRequestModal from './components/EditRequestModal.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';
import RecipePreview from './RecipePreview.jsx';
import FeedbackModal from './components/FeedbackModal.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import isVideoUrl from './utils/isVideoUrl';
import parseAdFilename from './utils/parseAdFilename';
import diffWords from './utils/diffWords';
import LoadingOverlay from "./LoadingOverlay";
import debugLog from './utils/debugLog';
import useDebugTrace from './utils/useDebugTrace';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';
import useSiteSettings from './useSiteSettings';
import { deductCredits } from './utils/credits';
import computeGroupStatus from './utils/computeGroupStatus';
import getVersion from './utils/getVersion';
import stripVersion from './utils/stripVersion';

const unitKey = (a) => {
  const info = parseAdFilename(a.filename || '');
  const recipe = a.recipeCode || info.recipeCode || '';
  return `${a.adGroupId || ''}|${recipe}`;
};

const isSafari =
  typeof navigator !== 'undefined' &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const BUFFER_COUNT = 3;

const Review = forwardRef(
  (
    {
      user,
      userRole = null,
      brandCodes = [],
      groupId = null,
      reviewerName = '',
      agencyId = null,
    },
    ref,
  ) => {
  const [ads, setAds] = useState([]); // full list of ads
  const [reviewAds, setReviewAds] = useState([]); // ads being reviewed in the current pass
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCopy, setEditCopy] = useState('');
  const [origCopy, setOrigCopy] = useState('');
  const [clientNote, setClientNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [askContinue, setAskContinue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [firstAdLoaded, setFirstAdLoaded] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState({}); // map of adUrl -> response object
  const [allAds, setAllAds] = useState([]); // includes all non-pending versions
  const [versionModal, setVersionModal] = useState(null); // {current, previous}
  const [versionView, setVersionView] = useState('current');
  const [versionIndex, setVersionIndex] = useState(0); // index into versions array
  const [recipes, setRecipes] = useState([]); // ad recipes for brief review
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [groupBrandCode, setGroupBrandCode] = useState('');
  const [finalGallery, setFinalGallery] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [copyCards, setCopyCards] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [modalCopies, setModalCopies] = useState([]);
  const [reviewVersion, setReviewVersion] = useState(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [started, setStarted] = useState(false);
  const [allHeroAds, setAllHeroAds] = useState([]); // hero list for all ads
  const [versionMode, setVersionMode] = useState(false); // reviewing new versions
  const [animating, setAnimating] = useState(null); // 'approve' | 'reject'
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const preloads = useRef([]);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const advancedRef = useRef(false);
  const firstAdUrlRef = useRef(null);
  const logoUrlRef = useRef(null);
  const [initialStatus, setInitialStatus] = useState(null);
  const [expandedRequests, setExpandedRequests] = useState({});
  const [editContext, setEditContext] = useState(null);
  // refs to track latest values for cleanup on unmount
  const currentIndexRef = useRef(currentIndex);
  const reviewLengthRef = useRef(reviewAds.length);
  const { agency } = useAgencyTheme(agencyId);
  const { settings } = useSiteSettings(false);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    reviewLengthRef.current = reviewAds.length;
  }, [reviewAds.length]);



  useImperativeHandle(ref, () => ({
    openGallery: () => setShowGallery(true),
    openCopy: () => setShowCopyModal(true),
  }));
  const canSubmitEdit = useMemo(
    () =>
      comment.trim().length > 0 ||
      (editCopy.trim() && editCopy.trim() !== origCopy.trim()),
    [comment, editCopy, origCopy],
  );

  const copyChanges = useMemo(() => {
    const clean = (arr) =>
      arr.map((c) => ({
        id: c.id || '',
        primary: c.primary || '',
        headline: c.headline || '',
        description: c.description || '',
      }));
    return (
      JSON.stringify(clean(copyCards)) !== JSON.stringify(clean(modalCopies))
    );
  }, [copyCards, modalCopies]);

  const submitFeedback = async () => {
    if (!feedbackComment.trim() || !groupId) return;
    try {
      setFeedbackSubmitting(true);
      await addDoc(collection(db, 'adGroups', groupId, 'feedback'), {
        comment: feedbackComment.trim(),
        updatedBy: reviewerName || user.email || 'anonymous',
        updatedAt: serverTimestamp(),
      });
      setFeedbackComment('');
      setShowFeedbackModal(false);
    } catch (err) {
      console.error('Failed to submit feedback', err);
    } finally {
      setFeedbackSubmitting(false);
    }
  };
  useDebugTrace('Review', {
    groupId,
    agencyId,
    brandCodesLength: brandCodes.length,
    currentIndex,
    reviewAdsLength: reviewAds.length,
    animating,
    loading,
  });
  useEffect(() => {
    return () => {
      if (agencyId && ['admin', 'designer'].includes(userRole)) {
        const siteAccent =
          localStorage.getItem('accentColor') || DEFAULT_ACCENT_COLOR;
        applyAccentColor(siteAccent);
      }
    };
  }, [agencyId, userRole]);
  const navigate = useNavigate();
  const [hasPending, setHasPending] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );

  const buildHeroList = useCallback((list) => {
    const prefOrder = ['', '9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
    const getRecipe = (a) =>
      a.recipeCode || parseAdFilename(a.filename || '').recipeCode || 'unknown';
    const getAspect = (a) =>
      a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
    // Deduplicate by root id while keeping highest version of each asset
    const latestMap = {};
    list.forEach((a) => {
      const root = a.parentAdId || stripVersion(a.filename);
      if (!latestMap[root] || getVersion(latestMap[root]) < getVersion(a)) {
        latestMap[root] = a;
      }
    });

    const map = {};
    Object.values(latestMap).forEach((a) => {
      const r = getRecipe(a);
      if (!map[r]) map[r] = [];
      map[r].push(a);
    });
    const heroes = Object.values(map).map((ls) => {
      // Newer versions first so latest is chosen when aspect ratios match
      ls.sort((a, b) => getVersion(b) - getVersion(a));
      for (const asp of prefOrder) {
        const f = ls.find((x) => getAspect(x) === asp);
        if (f) return f;
      }
      return ls[0];
    });
    heroes.sort((a, b) => {
      const rA = getRecipe(a);
      const rB = getRecipe(b);
      return rA.localeCompare(rB);
    });
    return heroes;
  }, []);

  const getLatestAds = useCallback((list) => {
    const map = {};
    list.forEach((a) => {
      const root = a.parentAdId || stripVersion(a.filename);
      if (!map[root] || getVersion(map[root]) < getVersion(a)) {
        map[root] = a;
      }
    });
    return Object.values(map);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setFadeIn(true);
    const t = setTimeout(() => setFadeIn(false), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(
      collection(db, 'adGroups', groupId, 'copyCards'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCopyCards(list);
      },
    );
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    if (showCopyModal) {
      setModalCopies(copyCards);
    }
  }, [showCopyModal]);

useEffect(() => {
  if (!started || !groupId || initialStatus === 'done') return;
  updateDoc(doc(db, 'adGroups', groupId), {
    reviewProgress: currentIndex,
  }).catch((err) => console.error('Failed to save progress', err));
}, [currentIndex, started, groupId, initialStatus]);

  const releaseLock = useCallback(() => {
    if (!groupId || initialStatus === 'done') return;
    const idx = currentIndexRef.current;
    const len = reviewLengthRef.current;
    const progress = idx >= len ? null : idx;
    updateDoc(doc(db, 'adGroups', groupId), {
      reviewProgress: progress,
    }).catch(() => {});
  }, [groupId, initialStatus]);

  useEffect(() => {
    if (!groupId) return;
    const allReviewed =
      ads.length > 0 &&
      ads.every((a) =>
        ['approved', 'rejected', 'archived'].includes(a.status),
      );
    if (
      allReviewed &&
      (currentIndex >= reviewAds.length || reviewAds.length === 0)
    ) {
      updateDoc(doc(db, 'adGroups', groupId), {
        status: 'done',
        reviewProgress: null,
      }).catch((err) => console.error('Failed to update status', err));
    }
  }, [currentIndex, reviewAds.length, groupId, ads]);

  useEffect(() => {
    if (currentIndex >= reviewAds.length) {
      setStarted(false);
    }
  }, [currentIndex, reviewAds.length]);

  useEffect(() => {
    if (!started) return;
    window.addEventListener('beforeunload', releaseLock);
    return () => {
      window.removeEventListener('beforeunload', releaseLock);
      releaseLock();
    };
  }, [releaseLock, started]);

  useEffect(() => {
    if (!started) return;
    const TIMEOUT = 300000; // 5 minutes
    let timer = setTimeout(() => {
      setTimedOut(true);
      setStarted(false);
      releaseLock();
    }, TIMEOUT);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setTimedOut(true);
        setStarted(false);
        releaseLock();
      }, TIMEOUT);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [started, releaseLock]);

  const recipeGroups = useMemo(() => {
    const map = {};
    ads.forEach((a) => {
      const info = parseAdFilename(a.filename || '');
      const recipe = a.recipeCode || info.recipeCode || 'unknown';
      const aspect = a.aspectRatio || info.aspectRatio || '';
      const item = { ...a, recipeCode: recipe, aspectRatio: aspect };
      if (!map[recipe]) map[recipe] = [];
      map[recipe].push(item);
    });
    const order = { '': 0, '9x16': 1, '3x5': 2, '1x1': 3 };
    return Object.entries(map).map(([recipeCode, list]) => {
      list.sort((a, b) => (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99));
      return { recipeCode, assets: list };
    });
  }, [ads]);


  useEffect(() => {
    setFadeIn(true);
    const t = setTimeout(() => setFadeIn(false), 200);
    return () => clearTimeout(t);
  }, [currentIndex]);

  useEffect(() => {
    setShowSizes(false);
  }, [currentIndex]);


  useEffect(() => {
    const fetchAds = async () => {
      debugLog('Loading ads', { groupId, brandCodes });
      try {
        let list = [];
        let startIndex = 0;
        let status = 'pending';
        let rv = 1;
        if (groupId) {
            const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
            if (groupSnap.exists()) {
              const data = groupSnap.data();
              status = data.status || 'pending';
              rv = data.reviewVersion || 1;
              setGroupBrandCode(data.brandCode || '');
              if (rv === 3) {
                try {
                  const rSnap = await getDocs(
                    collection(db, 'adGroups', groupId, 'recipes')
                  );
                  setRecipes(
                    rSnap.docs.map((d, idx) => ({
                      recipeNo: idx + 1,
                      id: d.id,
                      ...d.data(),
                    }))
                  );
                } finally {
                  setRecipesLoaded(true);
                }
              } else {
                setRecipesLoaded(true);
              }
              if (status === 'reviewed') status = 'done';
              if (status === 'review pending' || status === 'in review') status = 'ready';
              if (typeof data.reviewProgress === 'number') {
                startIndex = data.reviewProgress;
              }
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', groupId, 'assets')
            );
              list = assetsSnap.docs
                .map((assetDoc) => {
                  const data = assetDoc.data();
                  const info = parseAdFilename(data.filename || '');
                  return {
                    ...data,
                    version: data.version ?? info.version ?? 1,
                    assetId: assetDoc.id,
                    adGroupId: groupId,
                    groupName: groupSnap.data().name,
                    firebaseUrl: data.firebaseUrl,
                    ...(groupSnap.data().brandCode
                      ? { brandCode: groupSnap.data().brandCode }
                      : {}),
                  };
                });
          }
          setInitialStatus(status);
          setReviewVersion(rv);
        } else {
          const q = query(
            collectionGroup(db, 'assets'),
            where('brandCode', 'in', brandCodes),
            where('status', '==', 'ready'),
            where('isResolved', '==', false)
          );
          const snap = await getDocs(q);
          const groupCache = {};
          list = await Promise.all(
            snap.docs.map(async (d) => {
              const data = d.data();
              const adGroupId = data.adGroupId || d.ref.parent.parent.id;
              if (!groupCache[adGroupId]) {
                const gSnap = await getDoc(doc(db, 'adGroups', adGroupId));
                groupCache[adGroupId] = gSnap.exists() ? gSnap.data().name : '';
              }
              const info = parseAdFilename(data.filename || '');
              return {
                ...data,
                version: data.version ?? info.version ?? 1,
                assetId: d.id,
                adGroupId,
                groupName: groupCache[adGroupId],
                firebaseUrl: data.firebaseUrl,
              };
            })
          );
        }
        // if we only received the latest revision, fetch older versions
        const rootsToFetch = {};
        list.forEach((a) => {
          if (a.parentAdId) {
            const rootId = a.parentAdId;
            const hasRoot = list.some(
              (b) => b.assetId === rootId || b.parentAdId === rootId,
            );
            if (!hasRoot) {
              rootsToFetch[rootId] = { groupId: a.adGroupId, groupName: a.groupName };
            }
          }
        });

        if (Object.keys(rootsToFetch).length > 0) {
          const extraLists = await Promise.all(
            Object.entries(rootsToFetch).map(async ([rootId, info]) => {
              const { groupId, groupName } = info;
              const parentRef = doc(db, 'adGroups', groupId, 'assets', rootId);
              const [parentSnap, siblingSnap] = await Promise.all([
                getDoc(parentRef),
                getDocs(
                  query(
                    collection(db, 'adGroups', groupId, 'assets'),
                    where('parentAdId', '==', rootId),
                  ),
                ),
              ]);
              const extras = [];
              if (parentSnap.exists()) {
                const data = parentSnap.data();
                const info = parseAdFilename(data.filename || '');
                extras.push({
                  ...data,
                  version: data.version ?? info.version ?? 1,
                  assetId: rootId,
                  adGroupId: groupId,
                  groupName,
                  firebaseUrl: data.firebaseUrl,
                });
              }
              siblingSnap.docs.forEach((d) => {
                if (!list.some((a) => a.assetId === d.id)) {
                  const data = d.data();
                  const info = parseAdFilename(data.filename || '');
                  extras.push({
                    ...data,
                    version: data.version ?? info.version ?? 1,
                    assetId: d.id,
                    adGroupId: groupId,
                    groupName,
                    firebaseUrl: data.firebaseUrl,
                  });
                }
              });
              return extras;
            }),
          );
          list = [...list, ...extraLists.flat()];
        }

        const order = { '': 0, '9x16': 1, '3x5': 2, '1x1': 3 };
        list.sort((a, b) => {
          const infoA = parseAdFilename(a.filename || '');
          const infoB = parseAdFilename(b.filename || '');
          const rA = a.recipeCode || infoA.recipeCode || '';
          const rB = b.recipeCode || infoB.recipeCode || '';
          if (rA < rB) return -1;
          if (rA > rB) return 1;
          const aAsp = a.aspectRatio || infoA.aspectRatio || '';
          const bAsp = b.aspectRatio || infoB.aspectRatio || '';
          return (order[aAsp] ?? 99) - (order[bAsp] ?? 99);
        });

        // determine latest version for each ad unit (recipe + group)
        const unitVersionMap = {};
        const unitKey = (a) => {
          const info = parseAdFilename(a.filename || '');
          const recipe = a.recipeCode || info.recipeCode || '';
          return `${a.adGroupId || ''}|${recipe}`;
        };
        list.forEach((a) => {
          const key = unitKey(a);
          const ver = getVersion(a);
          if (!unitVersionMap[key] || unitVersionMap[key] < ver) {
            unitVersionMap[key] = ver;
          }
        });
        const latestUnits = list.filter(
          (a) => getVersion(a) === unitVersionMap[unitKey(a)]
        );

        // keep highest version per asset for the review list
        const versionMap = {};
        latestUnits.forEach((a) => {
          const root = a.parentAdId || a.assetId || stripVersion(a.filename);
          if (!versionMap[root] || getVersion(versionMap[root]) < getVersion(a)) {
            versionMap[root] = a;
          }
        });
        const deduped = Object.values(versionMap);

        const filteredActive = deduped.filter((a) => a.status !== 'archived');
        const hasPendingAds = filteredActive.some((a) => a.status === 'pending');
        const nonPending = filteredActive.filter((a) => a.status !== 'pending');

        // store all non-archived ads (including previous versions) for version modal
        const fullActive = list.filter((a) => a.status !== 'archived');
        setAllAds(fullActive);

        const baseList = rv === 2 ? filteredActive : nonPending;
        setAds(baseList);
        setHasPending(hasPendingAds);

        const readyAds = nonPending.filter((a) => a.status === 'ready');
        const readyVersions = readyAds.filter((a) => getVersion(a) > 1);
        const reviewSource = rv === 2
          ? filteredActive
          : readyAds.length > 0
          ? readyAds
          : nonPending;
        list = reviewSource;

        const key = groupId ? `lastViewed-${groupId}` : null;
        const stored = key ? localStorage.getItem(key) : null;
        const lastLogin = stored
          ? new Date(stored)
          : user?.metadata?.lastSignInTime
          ? new Date(user.metadata.lastSignInTime)
          : null;

        let filtered = list;
        let newer = [];
        if (lastLogin) {
          newer = list.filter((a) => {
            const updated = a.lastUpdatedAt?.toDate
              ? a.lastUpdatedAt.toDate()
              : a.lastUpdatedAt instanceof Date
              ? a.lastUpdatedAt
              : null;
            return updated && updated > lastLogin;
          });
          if (newer.length > 0) {
            filtered = newer;
          }
        }

        if (newer.length === 0) {
          const initial = {};
          nonPending.forEach((ad) => {
            let resp;
            if (ad.status === 'approved') resp = 'approve';
            else if (ad.status === 'rejected') resp = 'reject';
            else if (ad.status === 'edit_requested') resp = 'edit';
            if (resp) {
              const url = ad.adUrl || ad.firebaseUrl;
              initial[url] = { adUrl: url, response: resp };
            }
          });
          setResponses(initial);
        }

        const allList = buildHeroList(filteredActive);
        const versionList = rv === 2 ? [] : buildHeroList(readyVersions);
        setAllHeroAds(allList);
        const target = rv === 2
          ? buildHeroList(reviewSource)
          : versionList.length > 0
          ? versionList
          : allList;
        setVersionMode(versionList.length > 0);
        setReviewAds(target);
        setCurrentIndex(
          status === 'done'
            ? target.length
            : versionList.length > 0
            ? 0
            : startIndex < target.length
            ? startIndex
            : 0
        );
        setPendingOnly(
          target.length === 0 && nonPending.length === 0 && hasPendingAds
        );
      } catch (err) {
        console.error('Failed to load ads', err);
      } finally {
        setLoading(false);
      }
    };

    if (!user?.uid || (!groupId && brandCodes.length === 0)) {
      setAds([]);
      setReviewAds([]);
      setLoading(false);
      return;
    }

    fetchAds();
  }, [user, brandCodes, groupId]);

  // ensure first ad and agency logo are loaded before removing overlay
  useEffect(() => {
    if (reviewAds.length === 0) {
      setFirstAdLoaded(true);
      firstAdUrlRef.current = null;
      return;
    }
    const first = reviewAds[0];
    const url =
      typeof first === 'object' ? first.adUrl || first.firebaseUrl : first;
    if (!url) {
      setFirstAdLoaded(true);
      firstAdUrlRef.current = null;
      return;
    }
    if (firstAdUrlRef.current === url) {
      return;
    }
    firstAdUrlRef.current = url;
    setFirstAdLoaded(false);
    const img = new Image();
    img.onload = () => setFirstAdLoaded(true);
    img.onerror = () => setFirstAdLoaded(true);
    img.src = url;
  }, [reviewAds]);

  useEffect(() => {
    if (!agencyId) {
      setLogoReady(true);
      logoUrlRef.current = null;
      return;
    }
    const url = agency.logoUrl || DEFAULT_LOGO_URL;
    if (!url) {
      setLogoReady(true);
      logoUrlRef.current = null;
      return;
    }
    if (logoUrlRef.current === url) {
      return;
    }
    logoUrlRef.current = url;
    setLogoReady(false);
    const img = new Image();
    img.onload = () => setLogoReady(true);
    img.onerror = () => setLogoReady(true);
    img.src = url;
  }, [agencyId, agency.logoUrl]);

  const currentAd = reviewAds[currentIndex];
  const versions = useMemo(() => {
    if (!currentAd) return [];
    const key = unitKey(currentAd);
    const related = allAds.filter((a) => unitKey(a) === key);
    const verMap = {};
    related.forEach((a) => {
      const ver = getVersion(a);
      if (!verMap[ver]) verMap[ver] = [];
      verMap[ver].push(a);
    });
    const order = ['', '9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
    const groups = Object.values(verMap).sort(
      (a, b) => getVersion(b[0]) - getVersion(a[0])
    );
    groups.forEach((g) => {
      g.sort((a, b) => {
        const aspA = a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
        const aspB = b.aspectRatio || parseAdFilename(b.filename || '').aspectRatio || '';
        return (order[aspA] ?? 99) - (order[aspB] ?? 99);
      });
    });
    return groups;
  }, [currentAd, allAds]);

  const currentVersionAssets = versions[versionIndex] || [];
  const currentInfo = currentAd ? parseAdFilename(currentAd.filename || '') : {};
  const currentAspectRaw =
    currentAd?.aspectRatio || currentInfo.aspectRatio || '';
  const displayAd =
    currentVersionAssets.find(
      (a) =>
        (a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '') ===
        currentAspectRaw,
    ) || currentVersionAssets[0] || currentAd;

  useEffect(() => {
    setVersionIndex(0);
  }, [currentAd?.assetId]);

  const adUrl =
    displayAd && typeof displayAd === 'object'
      ? displayAd.adUrl || displayAd.firebaseUrl
      : displayAd;
  const brandCode =
    currentAd && typeof currentAd === 'object' ? currentAd.brandCode : undefined;
  const groupName =
    currentAd && typeof currentAd === 'object' ? currentAd.groupName : undefined;
  const statusResponse = useMemo(() => {
    if (!currentAd) return null;
    const { status } = currentAd;
    if (status === 'approved') return 'approve';
    if (status === 'rejected') return 'reject';
    if (status === 'edit_requested') return 'edit';
    return null;
  }, [currentAd]);

  const selectedResponse = responses[adUrl]?.response ?? statusResponse;
  const currentStatusValue =
    responseStatusMap[selectedResponse] || currentAd?.status || 'pending';
  const currentTheme =
    statusThemes[currentStatusValue] || statusThemes.pending;
  // show next step as soon as a decision is made
  const progress =
    reviewAds.length > 0
      ? ((currentIndex + (animating ? 1 : 0)) / reviewAds.length) * 100
      : 0;


  const openVersionModal = (ver, baseAd = displayAd || currentAd) => {
    const base = baseAd;
    if (!base) return;
    const rootId = base.parentAdId || stripVersion(base.filename);
    const siblings = allAds.filter((a) => {
      if (base.parentAdId) {
        return a.parentAdId === rootId || a.assetId === rootId;
      }
      return stripVersion(a.filename) === rootId;
    });
    let prev;
    if (ver) {
      prev = siblings.find((a) => getVersion(a) === ver);
    } else {
      prev = siblings
        .filter((a) => getVersion(a) < getVersion(base))
        .sort((a, b) => getVersion(b) - getVersion(a))[0];
    }
    if (!prev) return;
    setVersionModal({ current: base, previous: prev });
    setVersionView(ver && ver !== getVersion(base) ? 'previous' : 'current');
  };

  const closeVersionModal = () => setVersionModal(null);

  useEffect(() => {
    if (!displayAd?.adGroupId || !displayAd?.assetId) return;
    const assetRef = doc(db, 'adGroups', displayAd.adGroupId, 'assets', displayAd.assetId);
    const unsubDoc = onSnapshot(assetRef, (snap) => {
      if (!snap.exists()) return;
      const data = { assetId: snap.id, ...snap.data() };
      setAds((prev) => prev.map((a) => (a.assetId === data.assetId ? { ...a, ...data } : a)));
      setReviewAds((prev) => prev.map((a) => (a.assetId === data.assetId ? { ...a, ...data } : a)));
    });

    return () => {
      unsubDoc();
    };
  }, [displayAd?.adGroupId, displayAd?.assetId]);

  const handleTouchStart = (e) => {
    // allow swiping even while submitting a previous response
    if (showSizes || showEditModal || showNoteInput || showStreakModal)
      return;
    // don't intercept touches meant for the video controls
    if (e.target.closest('video')) return;
    const touch = e.touches[0];
    debugLog('Touch start', touch);
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
    setDragging(true);
    setSwipeX(0);
  };

  const handleTouchMove = (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
    }
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
    setSwipeX(dx);
  };

  const handleTouchEnd = () => {
    if (!dragging) return;
    debugLog('Touch end');
    const dx = touchEndX.current - touchStartX.current;
    const dy = Math.abs(touchEndY.current - touchStartY.current);
    if (Math.abs(dx) > 100 && dy < 100) {
      if (dx > 0) {
        submitResponse('approve');
      } else {
        submitResponse('reject');
      }
      setSwipeX(0);
    } else {
      setSwipeX(0);
    }
    setDragging(false);
  };

  const handleAnimationEnd = (e) => {
    if (!animating) return;
    if (e.target !== e.currentTarget) return;
    if (!advancedRef.current) {
      setCurrentIndex((i) => {
        const next = i + 1;
        console.log('Index updated:', next);
        return next;
      });
      advancedRef.current = true;
    }
    if (animating === 'reject') {
      const newCount = rejectionCount + 1;
      setRejectionCount(newCount);
      if (newCount === 5) {
        setShowStreakModal(true);
      }
    }
    setAnimating(null);
  };

  const handleStopReview = async () => {
    const remaining = reviewAds.slice(currentIndex);
    // gather all assets from the remaining recipe groups
    const toUpdate = [];
    remaining.forEach((hero) => {
      const info = parseAdFilename(hero.filename || '');
      const recipe = hero.recipeCode || info.recipeCode || 'unknown';
      const group = recipeGroups.find((g) => g.recipeCode === recipe);
      const assets = group ? group.assets : [hero];
      assets.forEach((asset) =>
        toUpdate.push(
          updateDoc(doc(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId), {
            status: 'pending',
            isResolved: false,
          })
        )
      );
    });
    try {
      await Promise.all(toUpdate);
    } catch (err) {
      console.error('Failed to mark remaining ads pending', err);
    } finally {
      setShowStreakModal(false);
      setShowNoteInput(false);
      setAskContinue(false);
      setCurrentIndex(reviewAds.length);
    }
  };
  const statusLabels = {
    pending: 'Pending',
    ready: 'Ready',
    approved: 'Approved',
    edit_requested: 'Edit Requested',
    rejected: 'Rejected',
  };
  const statusThemes = {
    pending: {
      dot: 'bg-gray-400',
      chip:
        'border border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]',
    },
    ready: {
      dot: 'bg-blue-500',
      chip:
        'border border-transparent bg-accent-10 text-accent dark:bg-accent-10 dark:text-accent',
    },
    approved: {
      dot: 'bg-[var(--approve-color)]',
      chip:
        'border border-transparent bg-approve-10 text-approve dark:bg-approve-10 dark:text-approve',
    },
    edit_requested: {
      dot: 'bg-[var(--edit-color)]',
      chip:
        'border border-transparent bg-edit-10 text-edit dark:bg-edit-10 dark:text-edit',
    },
    rejected: {
      dot: 'bg-[var(--reject-color)]',
      chip:
        'border border-transparent bg-reject-10 text-reject dark:bg-reject-10 dark:text-reject',
    },
  };
  const statusOptions = [
    { value: 'pending', label: 'Pending', disabled: true },
    { value: 'ready', label: 'Ready', disabled: true },
    { value: 'approved', label: 'Approved' },
    { value: 'edit_requested', label: 'Edit Requested' },
    { value: 'rejected', label: 'Rejected' },
  ];

  const responseStatusMap = {
    approve: 'approved',
    reject: 'rejected',
    edit: 'edit_requested',
    pending: 'pending',
  };

  const currentRecipe = currentAd?.recipeCode || currentInfo.recipeCode;
  const currentRecipeGroup = useMemo(
    () => ({ recipeCode: currentRecipe, assets: currentVersionAssets }),
    [currentRecipe, currentVersionAssets],
  );
  const otherSizes = currentVersionAssets.filter(
    (a) => (a.adUrl || a.firebaseUrl) !== adUrl,
  );

  const currentAspect = String(currentAspectRaw || '9x16').replace(
    'x',
    '/',
  );

  // Preload upcoming ads to keep transitions smooth
  useEffect(() => {
    // Drop preloaded images that are behind the current index
    preloads.current = preloads.current.filter((p) => p.index > currentIndex);
    for (let i = 1; i <= BUFFER_COUNT; i += 1) {
      const idx = currentIndex + i;
      const next = reviewAds[idx];
      if (!next) break;
      if (preloads.current.find((p) => p.index === idx)) continue;
      const url = next.adUrl || next.firebaseUrl;
      const img = new Image();
      img.src = url;
      preloads.current.push({ index: idx, img });
    }
    preloads.current = preloads.current.slice(-BUFFER_COUNT);
  }, [currentIndex, reviewAds, isMobile]);

  const openEditRequest = async (context = {}) => {
    const {
      baseAd = currentAd,
      recipeCode = currentRecipe,
      assets = currentRecipeGroup?.assets,
      skipAnimation = false,
      skipAdvance = false,
    } = context;
    if (!baseAd) return;
    setEditContext({ baseAd, recipeCode, assets, skipAnimation, skipAdvance });
    setShowEditModal(true);
    if (!baseAd?.adGroupId || !recipeCode) {
      setEditCopy('');
      setOrigCopy('');
      return;
    }
    try {
      const snap = await getDoc(
        doc(db, 'adGroups', baseAd.adGroupId, 'recipes', recipeCode)
      );
      const data = snap.exists() ? snap.data() : null;
      const text = data ? data.latestCopy || data.copy || '' : '';
      setEditCopy(text);
      setOrigCopy(text);
      if (Array.isArray(assets) && assets.length > 0) {
        assets.forEach((asset) => {
          setReviewAds((prev) =>
            prev.map((a) =>
              a.assetId === asset.assetId ? { ...a, originalCopy: text } : a
            )
          );
          setAds((prev) =>
            prev.map((a) =>
              a.assetId === asset.assetId ? { ...a, originalCopy: text } : a
            )
          );
        });
      } else {
        setReviewAds((prev) =>
          prev.map((a) =>
            a.assetId === baseAd.assetId ? { ...a, originalCopy: text } : a
          )
        );
        setAds((prev) =>
          prev.map((a) =>
            a.assetId === baseAd.assetId ? { ...a, originalCopy: text } : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to load copy', err);
      setEditCopy('');
      setOrigCopy('');
    }
  };

  const saveCopyCards = async (list) => {
    if (!groupId || !Array.isArray(list)) return;
    try {
      const existingIds = copyCards.map((c) => c.id);
      const newIds = list.map((c) => c.id).filter(Boolean);
      const deletions = existingIds.filter((id) => !newIds.includes(id));
      await Promise.all(
        deletions.map((cid) =>
          deleteDoc(doc(db, 'adGroups', groupId, 'copyCards', cid)),
        ),
      );
      await Promise.all(
        list.map((c) => {
          const data = {
            primary: c.primary || '',
            headline: c.headline || '',
            description: c.description || '',
            product: c.product || '',
          };
          if (c.id) {
            return setDoc(
              doc(db, 'adGroups', groupId, 'copyCards', c.id),
              data,
              { merge: true },
            );
          }
          return addDoc(
            collection(db, 'adGroups', groupId, 'copyCards'),
            data,
          );
        }),
      );
      setShowCopyModal(false);
    } catch (err) {
      console.error('Failed to save copy cards', err);
    }
  };

  const submitResponse = async (responseType, options = {}) => {
    const {
      assets: targetAssets,
      baseAd: targetAd,
      recipeCode: targetRecipeCode,
      skipAnimation = false,
      skipAdvance = false,
      commentText,
      editCopyText,
      origCopyText,
    } = options;
    const baseAd = targetAd || currentAd;
    if (!baseAd) return;
    const inferredRecipe =
      targetRecipeCode ||
      baseAd.recipeCode ||
      parseAdFilename(baseAd.filename || '').recipeCode ||
      currentRecipe;
    const sourceAssets =
      (Array.isArray(targetAssets) && targetAssets.length > 0
        ? targetAssets
        : currentRecipeGroup?.assets || [baseAd])
        .filter((a) => a.status !== 'archived');
    if (sourceAssets.length === 0) return;

    const commentValue =
      commentText !== undefined ? commentText : comment;
    const editCopyValue =
      editCopyText !== undefined ? editCopyText : editCopy;
    const origCopyValue =
      origCopyText !== undefined ? origCopyText : origCopy;

    const newStatus =
      responseType === 'approve'
        ? 'approved'
        : responseType === 'reject'
        ? 'rejected'
        : responseType === 'edit'
        ? 'edit_requested'
        : responseType === 'pending'
        ? 'pending'
        : 'ready';

    if (!skipAnimation) {
      advancedRef.current = false;
      setAnimating(responseType);
    } else {
      advancedRef.current = true;
    }
    setSubmitting(true);

    const updates = [];

    try {
      for (const asset of sourceAssets) {
        const url = asset.adUrl || asset.firebaseUrl;
        const copyChanged =
          responseType === 'edit' && editCopyValue.trim() !== origCopyValue.trim();

        if (responseType !== 'pending') {
          const respObj = {
            adUrl: url,
            response: responseType,
            comment: responseType === 'edit' ? commentValue : '',
            copyEdit: copyChanged ? editCopyValue : '',
            pass: responses[url] ? 'revisit' : 'initial',
            ...(asset.brandCode ? { brandCode: asset.brandCode } : {}),
            ...(asset.groupName ? { groupName: asset.groupName } : {}),
            ...(reviewerName ? { reviewerName } : {}),
            ...(user?.email ? { userEmail: user.email } : {}),
            ...(user?.uid ? { userId: user.uid } : {}),
            ...(userRole ? { userRole } : {}),
          };
          if (asset.adGroupId) {
            updates.push(
              addDoc(collection(db, 'adGroups', asset.adGroupId, 'responses'), {
                ...respObj,
                timestamp: serverTimestamp(),
              })
            );
          }
          addedResponses[url] = respObj;
          setResponses((prev) => ({ ...prev, [url]: respObj }));
        } else {
          setResponses((prev) => {
            const next = { ...prev };
            delete next[url];
            return next;
          });
        }

        if (asset.assetId && asset.adGroupId) {
          const assetRef = doc(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId);
          const updateData = {
            status: newStatus,
            lastUpdatedBy: user.uid,
            lastUpdatedAt: serverTimestamp(),
          };
          if (responseType === 'edit') {
            updateData.comment = commentValue;
            updateData.copyEdit = copyChanged ? editCopyValue : '';
            updateData.isResolved = false;
          } else if (responseType === 'approve') {
            updateData.comment = '';
            updateData.copyEdit = '';
            updateData.isResolved = true;
          } else if (responseType === 'pending') {
            updateData.comment = '';
            updateData.copyEdit = '';
            updateData.isResolved = false;
          } else {
            updateData.comment = '';
            updateData.copyEdit = '';
            updateData.isResolved = false;
          }
          updates.push(updateDoc(assetRef, updateData));

          const name = reviewerName || user.displayName || user.uid || 'unknown';
          updates.push(
            addDoc(
              collection(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId, 'history'),
              {
                status: newStatus,
                updatedBy: name,
                updatedAt: serverTimestamp(),
                ...(responseType === 'edit' && commentValue
                  ? { comment: commentValue }
                  : {}),
                ...(responseType === 'edit' && copyChanged
                  ? { copyEdit: editCopyValue, origCopy: origCopyValue }
                  : {}),
              },
            ).catch((err) => {
              if (err?.code === 'already-exists') {
                console.log('History entry already exists, skipping');
              } else {
                throw err;
              }
            }),
          );

          let updatedAdsState = [];
          setAds((prev) => {
            const updated = prev.map((a) =>
              a.assetId === asset.assetId
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? commentValue : '',
                    copyEdit: copyChanged ? editCopyValue : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : { isResolved: false }),
                  }
                : a,
            );
            updatedAdsState = updated;
            return updated;
          });
          setReviewAds((prev) =>
            prev.map((a) =>
              a.assetId === asset.assetId
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? commentValue : '',
                    copyEdit: copyChanged ? editCopyValue : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : { isResolved: false }),
                  }
                : a
            )
          );

          const prevStatus = asset.status;
          const newState = newStatus;
          let incReviewed = 0;
          let incApproved = 0;
          let incRejected = 0;
          let incEdit = 0;
          if (prevStatus === 'ready') {
            incReviewed += 1;
          }
          if (prevStatus !== newState) {
            if (prevStatus === 'approved') incApproved -= 1;
            if (prevStatus === 'rejected') incRejected -= 1;
            if (prevStatus === 'edit_requested') incEdit -= 1;
            if (newState === 'approved') incApproved += 1;
            if (newState === 'rejected') incRejected += 1;
            if (newState === 'edit_requested') incEdit += 1;
          }

          const groupRef = doc(db, 'adGroups', asset.adGroupId);
          const gSnap = await getDoc(groupRef);
          const recipeStatusMap = {};
          (updatedAdsState || []).forEach((a) => {
            const info = parseAdFilename(a.filename || '');
            const recipe = a.recipeCode || info.recipeCode || 'unknown';
            if (!recipe) return;
            const priority = {
              approved: 4,
              edit_requested: 3,
              rejected: 2,
              ready: 1,
              pending: 0,
              archived: 2,
            };
            const prev = recipeStatusMap[recipe];
            const curr = a.status;
            if (!prev || (priority[curr] || 0) > (priority[prev] || 0)) {
              recipeStatusMap[recipe] = curr;
            }
          });
          const groupStatus = computeGroupStatus(
            Object.values(recipeStatusMap).map((s) => ({ status: s })),
            false,
            false,
            gSnap.data().status,
          );
          const updateObj = {
            ...(incReviewed ? { reviewedCount: increment(incReviewed) } : {}),
            ...(incApproved ? { approvedCount: increment(incApproved) } : {}),
            ...(incRejected ? { rejectedCount: increment(incRejected) } : {}),
            ...(incEdit ? { editCount: increment(incEdit) } : {}),
            lastUpdated: serverTimestamp(),
            status: groupStatus,
            ...(gSnap.exists() && !gSnap.data().thumbnailUrl
              ? { thumbnailUrl: asset.firebaseUrl }
              : {}),
          };
          updates.push(updateDoc(groupRef, updateObj));

          if (responseType === 'approve' && asset.parentAdId) {
            const relatedQuery = query(
              collection(db, 'adGroups', asset.adGroupId, 'assets'),
              where('parentAdId', '==', asset.parentAdId)
            );
            const relatedSnap = await getDocs(relatedQuery);
            updates.push(
              Promise.all(
                relatedSnap.docs.map((d) =>
                  updateDoc(doc(db, 'adGroups', asset.adGroupId, 'assets', d.id), {
                    isResolved: true,
                  })
                )
              )
            );
            updates.push(
              updateDoc(doc(db, 'adGroups', asset.adGroupId, 'assets', asset.parentAdId), {
                isResolved: true,
              })
            );
          }
        }
      }

      if (sourceAssets.length > 0 && inferredRecipe) {
        const recipeRef = doc(db, 'recipes', inferredRecipe);
        updates.push(
          setDoc(
            recipeRef,
            {
              history: arrayUnion({
                timestamp: Date.now(),
                status: newStatus,
                user:
                  reviewerName ||
                  user?.displayName ||
                  user?.uid ||
                  'unknown',
                ...(responseType === 'edit' && commentValue
                  ? { editComment: commentValue }
                  : {}),
              }),
            },
            { merge: true }
          )
        );
      }

      await Promise.all(updates);
      if (responseType === 'edit' && userRole === 'client') {
        const brandCode =
          baseAd?.brandCode ||
          sourceAssets[0]?.brandCode ||
          brandCodes[0];
        if (brandCode) {
          await deductCredits(brandCode, 'editRequest', settings.creditCosts);
        } else {
          console.warn('submitResponse missing brandCode for edit request');
        }
      }
      if (groupId) {
        localStorage.setItem(`lastViewed-${groupId}`, new Date().toISOString());
      }
    } catch (err) {
      console.error('Failed to submit response', err);
    } finally {
      setComment('');
      setEditCopy('');
      setOrigCopy('');
      setShowEditModal(false);
      setEditContext(null);
      setSubmitting(false);

      if (!skipAdvance) {
        const nextIndex = currentIndex + 1;
        if (!advancedRef.current) {
          setCurrentIndex(nextIndex);
          advancedRef.current = true;
        }
        setAnimating(null);

        if (nextIndex >= reviewAds.length) {
          setStarted(false);
        }
      } else {
        setAnimating(null);
      }
    }
  };

  const handleToggleRequest = (id) => {
    setExpandedRequests((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStatusChange = (hero, group, nextStatus) => {
    if (!hero) return;
    const normalized = nextStatus || 'pending';
    const currentStatus = hero.status || 'pending';
    if (normalized === currentStatus) return;
    const recipeCode =
      group?.recipeCode ||
      hero.recipeCode ||
      parseAdFilename(hero.filename || '').recipeCode ||
      '';
    const assets = (group?.assets || [])
      .filter((a) => a.status !== 'archived');
    const updateAssets = assets.length > 0 ? assets : [hero];
    if (normalized === 'edit_requested') {
      openEditRequest({
        baseAd: hero,
        recipeCode,
        assets: updateAssets,
        skipAnimation: true,
        skipAdvance: true,
      });
      return;
    }
    const responseMap = {
      approved: 'approve',
      rejected: 'reject',
      edit_requested: 'edit',
      pending: 'pending',
      ready: null,
    };
    const responseType = responseMap[normalized];
    if (!responseType) return;
    submitResponse(responseType, {
      baseAd: hero,
      assets: updateAssets,
      recipeCode,
      skipAnimation: true,
      skipAdvance: true,
    });
  };

  const submitNote = async () => {
    if (!currentAd?.adGroupId) {
      setShowNoteInput(false);
      setClientNote('');
      return;
    }
    setNoteSubmitting(true);
    try {
      await updateDoc(doc(db, 'adGroups', currentAd.adGroupId), {
        clientNote: clientNote.trim(),
        clientNoteTimestamp: serverTimestamp(),
        hasClientNote: true,
      });
    } catch (err) {
      console.error('Failed to submit note', err);
    } finally {
      setNoteSubmitting(false);
      setClientNote('');
      setShowNoteInput(false);
      setAskContinue(true);
    }
  };

  if (
    reviewVersion === null ||
    !logoReady ||
    (started && !firstAdLoaded) ||
    (reviewVersion === 3 && !recipesLoaded)
  ) {
    return <LoadingOverlay />;
  }


  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 text-center">
        {timedOut && (
          <p className="text-red-600">Review timed out due to inactivity.</p>
        )}
        {agencyId && (
          <OptimizedImage
            pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
            alt={`${agency.name || 'Agency'} logo`}
            loading="eager"
            cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
            onLoad={() => setLogoReady(true)}
            className="mb-2 max-h-16 w-auto"
          />
        )}
        <h1 className="text-2xl font-bold">
          {reviewVersion === 3 ? 'Your brief is ready!' : 'Your ads are ready!'}
        </h1>
        <div className="flex flex-col items-center space-y-3">
          <button
            onClick={() => {
              setTimedOut(false);
              setShowGallery(false);
              setShowCopyModal(false);
              if (reviewVersion === 3) {
                setStarted(true);
                return;
              }
              if (reviewVersion === 2) {
                const latest = getLatestAds(
                  ads.filter((a) => a.status !== 'archived')
                );
                const heroList = buildHeroList(latest);
                setAllHeroAds(heroList);
                setReviewAds(heroList);
                setVersionMode(false);
                setCurrentIndex(0);
                setStarted(true);
                return;
              }
              const latest = getLatestAds(ads.filter((a) => a.status !== 'pending'));
              const readyList = latest.filter((a) => a.status === 'ready');
              const readyVers = readyList.filter((a) => getVersion(a) > 1);
              const allList = buildHeroList(latest);
              const versionList = buildHeroList(readyVers);
              setAllHeroAds(allList);
              const target = versionList.length > 0 ? versionList : allList;
              setVersionMode(versionList.length > 0);
              setReviewAds(target);
              setCurrentIndex(0);
              setStarted(true);
            }}
            disabled={loading || (reviewVersion !== 3 && ads.length === 0)}
            className={`btn-primary px-6 py-3 text-lg ${
              loading || (reviewVersion !== 3 && ads.length === 0)
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            <FiCheck className="mr-2" />{' '}
            {reviewVersion === 3 ? 'See Brief' : 'Review Ads'}
          </button>
          <div className="flex space-x-2">
            {ads.length > 0 && (
              <button
                onClick={() => setShowGallery(true)}
                className="btn-secondary"
              >
                <FiGrid className="mr-1" /> Ad Gallery
              </button>
            )}
            {copyCards.length > 0 && (
              <button
                onClick={() => setShowCopyModal(true)}
                className="btn-secondary"
              >
                <FiType className="mr-1" /> Platform Copy
              </button>
            )}
          </div>
        </div>
        {showGallery && <GalleryModal ads={ads} onClose={() => setShowGallery(false)} />}
        {showCopyModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
            <div className="bg-white p-4 rounded-xl shadow max-w-[50rem] w-full max-h-[90vh] flex flex-col dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Platform Copy</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveCopyCards(modalCopies)}
                    className={`btn-primary ${copyChanges ? '' : 'opacity-50 cursor-not-allowed'}`}
                    disabled={!copyChanges}
                  >
                    Save
                  </button>
                  <button onClick={() => setShowCopyModal(false)} className="btn-secondary">Close</button>
                </div>
              </div>
              <p className="text-sm mb-2">
                These lines appear as the primary text, headline, and description on your Meta ads. Feel free to tweak or remove any of the options.
              </p>
              <div className="overflow-auto flex-1">
                <CopyRecipePreview
                  onSave={saveCopyCards}
                  initialResults={copyCards}
                  showOnlyResults
                  hideBrandSelect
                  onCopiesChange={setModalCopies}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (reviewVersion === 3 && (!recipes || recipes.length === 0)) {
    return (
      <div className="text-center mt-10">No briefs assigned to your account.</div>
    );
  }

  if (reviewVersion !== 3 && (!ads || ads.length === 0)) {
    return (
      <div className="text-center mt-10">
        {hasPending ? 'ads are pending' : 'No ads assigned to your account.'}
      </div>
    );
  }

  if (pendingOnly) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 text-center">
          {agencyId && (
            <OptimizedImage
              pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
              alt={`${agency.name || 'Agency'} logo`}
              loading="eager"
              cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
              onLoad={() => setLogoReady(true)}
              className="mb-2 max-h-16 w-auto"
            />
          )}
        <h1 className="text-2xl font-bold">Ads Pending Review</h1>
        <p className="text-lg">We'll notify you when your ads are ready.</p>
      </div>
    );
  }


  return (
    <div className="min-h-screen w-full bg-gray-50 py-10 px-4 dark:bg-[var(--dark-bg)]">
      {showStreakModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded-xl shadow max-w-sm space-y-4 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            {!showNoteInput && !askContinue && (
              <>
                <p className="mb-4 text-center text-lg font-medium">You’ve rejected 5 ads so far. Leave a note so we can regroup?</p>
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => setShowNoteInput(true)}
                    className="btn-primary"
                  >
                    Leave Note
                  </button>
                  <button
                    onClick={() => {
                      setShowStreakModal(false);
                      setShowNoteInput(false);
                      setAskContinue(false);
                    }}
                    className="btn-secondary text-white"
                  >
                    Keep reviewing
                  </button>
                </div>
              </>
            )}
            {showNoteInput && !askContinue && (
              <div className="flex flex-col space-y-2">
                <textarea
                  value={clientNote}
                  onChange={(e) => setClientNote(e.target.value)}
                  className="w-full p-2 border rounded"
                  rows={3}
                  placeholder="Leave a note for the designer..."
                />
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={submitNote}
                    disabled={noteSubmitting}
                    className="btn-primary"
                  >
                    Submit Note
                  </button>
                  <button
                    onClick={() => {
                      setShowNoteInput(false);
                      setClientNote('');
                    }}
                    className="btn-secondary text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {askContinue && (
              <>
                <p className="mb-4 text-center text-lg font-medium">Continue Review?</p>
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => {
                      setShowStreakModal(false);
                      setAskContinue(false);
                    }}
                    className="btn-primary"
                  >
                    Yes
                  </button>
                  <button onClick={handleStopReview} className="btn-secondary text-white">
                    No
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8">
        <div className="flex w-full max-w-5xl flex-col items-center gap-6">
          <div className="relative flex w-full max-w-md flex-col items-center">
          {agencyId && (
            <OptimizedImage
              pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
              alt={`${agency.name || 'Agency'} logo`}
              loading="eager"
              cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
              onLoad={() => setLogoReady(true)}
              className="mb-2 max-h-16 w-auto"
            />
          )}
        {/* Gallery view removed */}
        {/* Show exit button even during change review */}
        <div className="relative w-full max-w-md mb-2.5 flex justify-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <InfoTooltip text="exit review" placement="bottom">
              <button
                type="button"
                onClick={() => {
                  releaseLock();
                  setStarted(false);
                }}
                aria-label="exit review"
                className="text-gray-500 hover:text-black dark:hover:text-white"
              >
                <FiX />
              </button>
            </InfoTooltip>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <InfoTooltip text="leave overall feedback" placement="bottom">
              <button
                type="button"
                aria-label="leave overall feedback"
                onClick={() => setShowFeedbackModal(true)}
                className="text-gray-500 hover:text-black dark:hover:text-white"
              >
                <FiMessageSquare />
              </button>
            </InfoTooltip>
          </div>
          {reviewVersion !== 3 && (
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                className="progress-bar-inner"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex justify-center relative">
          {reviewVersion === 3 ? (
            <div className="w-full max-w-5xl">
              <RecipePreview
                initialResults={recipes}
                showOnlyResults
                brandCode={groupBrandCode}
                hideBrandSelect
                showColumnButton={false}
                externalOnly
                hideActions
              />
            </div>
          ) : reviewVersion === 2 ? (
            <div className="w-full max-w-5xl px-3 sm:px-4 md:px-6">
              <div className="flex flex-col gap-8">
                {reviewAds.map((hero) => {
                  const info = parseAdFilename(hero.filename || '');
                  const recipeCode =
                    hero.recipeCode || info.recipeCode || 'unknown';
                  const group = recipeGroups.find(
                    (g) => g.recipeCode === recipeCode,
                  );
                  const groupAssets = (group?.assets || []).filter(
                    (a) => a.status !== 'archived',
                  );
                  const assets = groupAssets.length > 0 ? groupAssets : [hero];
                  const rawStatus = hero.status || assets[0]?.status || 'pending';
                  const cardStatus = statusLabels[rawStatus] ? rawStatus : 'pending';
                  const cardId = `${hero.adGroupId || 'public'}-${recipeCode}`;
                  const editAsset = assets.find(
                    (a) => (a.comment || '').trim().length > 0,
                  );
                  const hasEditRequest = !!editAsset;
                  const isExpanded = !!expandedRequests[cardId];
                  const unitVersions = allAds.filter(
                    (a) => unitKey(a) === unitKey(hero),
                  );
                  const versionCount = new Set(
                    unitVersions.map((a) => getVersion(a)),
                  ).size;
                  const theme = statusThemes[cardStatus] || statusThemes.pending;
                  const unitTitleCandidate =
                    hero.groupName ||
                    hero.group ||
                    hero.recipeName ||
                    hero.product ||
                    '';
                  const unitTitle = unitTitleCandidate
                    ? unitTitleCandidate
                    : recipeCode && recipeCode !== 'unknown'
                    ? `Recipe ${recipeCode}`
                    : 'Ad Unit';
                  const unitMeta = [];
                  if (
                    recipeCode &&
                    recipeCode !== 'unknown' &&
                    unitTitle !== `Recipe ${recipeCode}`
                  ) {
                    unitMeta.push(`Recipe ${recipeCode}`);
                  }
                  if (assets.length > 1) {
                    unitMeta.push(
                      `${assets.length} size${assets.length > 1 ? 's' : ''}`,
                    );
                  }
                  if (versionCount > 1) {
                    unitMeta.push(
                      `${versionCount} version${versionCount > 1 ? 's' : ''}`,
                    );
                  }

                  return (
                    <div
                      key={cardId}
                      className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]"
                    >
                      <div className="p-6 space-y-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Ad Unit
                            </p>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                              {unitTitle}
                            </h3>
                            {unitMeta.length > 0 && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {unitMeta.join(' • ')}
                              </p>
                            )}
                          </div>
                          <div
                            className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                              theme.chip
                            }`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                theme.dot || 'bg-gray-300'
                              }`}
                            />
                            <span>{statusLabels[cardStatus] || 'Pending'}</span>
                            <span className="ml-auto text-xs text-gray-500">▼</span>
                            <select
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              value={cardStatus}
                              onChange={(e) =>
                                handleStatusChange(hero, group, e.target.value)
                              }
                              aria-label="Update ad status"
                            >
                              {statusOptions.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  disabled={opt.disabled}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="relative">
                          {(versionCount > 1 || getVersion(hero) > 1) && (
                            <button
                              type="button"
                              onClick={() => openVersionModal(null, hero)}
                              className="version-badge absolute left-4 top-4"
                            >
                              V{getVersion(hero)}
                            </button>
                          )}
                          <div className="grid gap-4 sm:grid-cols-2">
                            {assets.map((asset, idx) => {
                              const url = asset.adUrl || asset.firebaseUrl;
                              const aspect = String(asset.aspectRatio || '')
                                .replace('x', '/')
                                || undefined;
                              return (
                                <div key={asset.assetId || idx} className="flex justify-center">
                                  {isVideoUrl(url) ? (
                                    <VideoPlayer
                                      src={url}
                                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-black"
                                      style={{ aspectRatio: aspect }}
                                    />
                                  ) : (
                                    <OptimizedImage
                                      pngUrl={url}
                                      webpUrl={
                                        url ? url.replace(/\.png$/, '.webp') : undefined
                                      }
                                      alt={asset.filename || 'Ad'}
                                      cacheKey={url}
                                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white"
                                      style={{ aspectRatio: aspect }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {hasEditRequest && (
                          <button
                            type="button"
                            onClick={() => handleToggleRequest(cardId)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-accent transition-opacity hover:opacity-80 dark:text-accent"
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? 'Hide edit request' : 'View edit request'}
                          </button>
                        )}
                      </div>
                      {hasEditRequest && isExpanded && (
                        <div className="border-t border-gray-200 bg-white/80 px-6 py-4 text-sm space-y-3 dark:border-gray-700 dark:bg-[var(--dark-sidebar-hover)]">
                          <p className="font-medium text-gray-900 dark:text-[var(--dark-text)]">
                            Requested changes
                          </p>
                          {editAsset?.comment && (
                            <p className="text-gray-700 dark:text-[var(--dark-text)] whitespace-pre-wrap">
                              {editAsset.comment}
                            </p>
                          )}
                          {editAsset?.copyEdit && editAsset.copyEdit.trim() && (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-1 dark:border-gray-600 dark:bg-[var(--dark-sidebar-bg)]">
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Suggested copy
                              </p>
                              <p className="text-gray-800 dark:text-[var(--dark-text)] whitespace-pre-wrap">
                                {editAsset.copyEdit}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          <div
            onTouchStart={!isSafari ? handleTouchStart : undefined}
            onTouchMove={!isSafari ? handleTouchMove : undefined}
            onTouchEnd={!isSafari ? handleTouchEnd : undefined}
            onAnimationEnd={handleAnimationEnd}
            className={`relative z-10 ${
              isMobile && showSizes
                ? 'flex flex-col items-center overflow-y-auto h-[72vh]'
                : 'size-container'
            } ${
              animating ? 'simple-fade-out' : fadeIn ? 'simple-fade-in' : ''
            }`}
            style={
  isMobile && showSizes
    ? {}
    : animating
    ? {}
    : {
        transform: showSizes
          ? `translateX(-${otherSizes.length * 55}%)`
          : `translateX(${swipeX}px)`,
        transition: dragging ? 'none' : undefined,
      }
}
>
<div
  className={`relative ad-aspect max-w-[90%] mx-auto rounded shadow ${
    isMobile && showSizes ? 'mb-2' : 'max-h-[72vh]'
  }`}
  style={{ aspectRatio: currentAspect }}
>
  {isVideoUrl(adUrl) ? (
    <VideoPlayer
      src={adUrl}
      onLoadedData={() => setFirstAdLoaded(true)}
      style={
        isMobile && showSizes
          ? { maxHeight: `${72 / (otherSizes.length + 1)}vh` }
          : {}
      }
      className="w-full h-full object-contain"
    />
  ) : (
    <OptimizedImage
      pngUrl={adUrl}
      webpUrl={adUrl ? adUrl.replace(/\.png$/, '.webp') : undefined}
      alt="Ad"
      loading="eager"
      cacheKey={adUrl}
      onLoad={() => setFirstAdLoaded(true)}
      style={
        isMobile && showSizes
          ? { maxHeight: `${72 / (otherSizes.length + 1)}vh` }
          : {}
      }
      className="w-full h-full object-contain"
    />
  )}
  {(getVersion(displayAd) > 1 || versions.length > 1) && (
    versions.length > 1 ? (
      versions.length === 2 ? (
        <span
          onClick={() =>
            setVersionIndex((i) => (i + 1) % versions.length)
          }
          className="version-badge cursor-pointer"
        >
          V{getVersion(displayAd)}
        </span>
      ) : (
        <div className="absolute top-0 left-0">
          <span
            onClick={() => setShowVersionMenu((o) => !o)}
            className="version-badge cursor-pointer select-none"
          >
            V{getVersion(displayAd)}
          </span>
          {showVersionMenu && (
            <div className="absolute left-0 top-full mt-1 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm">
              {versions.map((v, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setVersionIndex(idx);
                    setShowVersionMenu(false);
                  }}
                  className="block w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
                >
                  V{getVersion(v[0])}
                </button>
              ))}
            </div>
          )}
        </div>
      )
    ) : (
      <span className="version-badge">V{getVersion(displayAd)}</span>
    )
  )}
</div>
              {otherSizes.map((a, idx) => (
                isVideoUrl(a.firebaseUrl) ? (
                  <VideoPlayer
                    key={idx}
                    src={a.firebaseUrl}
                    style={
                      isMobile && showSizes
                        ? { maxHeight: `${72 / (otherSizes.length + 1)}vh` }
                        : {
                            transform: showSizes
                              ? `translateX(${(idx + 1) * 110}%)`
                              : 'translateX(0)',
                            opacity: showSizes ? 1 : 0,
                          }
                    }
                    className={`max-w-[90%] mx-auto rounded shadow ${
                      isMobile && showSizes ? 'mb-2 relative' : 'size-thumb max-h-[72vh]'
                    }`}
                  />
                ) : (
                  <OptimizedImage
                    key={idx}
                    pngUrl={a.firebaseUrl}
                    webpUrl={a.firebaseUrl ? a.firebaseUrl.replace(/\.png$/, '.webp') : undefined}
                    alt={a.filename}
                    cacheKey={a.firebaseUrl}
                    style={
                      isMobile && showSizes
                        ? { maxHeight: `${72 / (otherSizes.length + 1)}vh` }
                        : {
                            transform: showSizes
                              ? `translateX(${(idx + 1) * 110}%)`
                              : 'translateX(0)',
                            opacity: showSizes ? 1 : 0,
                          }
                    }
                    className={`max-w-[90%] mx-auto rounded shadow ${
                      isMobile && showSizes ? 'mb-2 relative' : 'size-thumb max-h-[72vh]'
                    }`}
                  />
                )
              ))}
            </div>
          )}
        </div>
      </div>

        {!showSizes && reviewVersion === 1 && (
          <div className="mt-6 flex w-full max-w-xl flex-col items-center gap-4">
            <div className="flex w-full items-center justify-between gap-3">
              {currentIndex > 0 ? (
                <button
                  aria-label="Previous"
                  onClick={() =>
                    setCurrentIndex((i) => Math.max(0, i - 1))
                  }
                  className="btn-arrow"
                >
                  &lt;
                </button>
              ) : (
                <span className="w-12" />
              )}
              <div
                className={`relative inline-flex min-w-[12rem] items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${currentTheme.chip}`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    currentTheme.dot || 'bg-gray-300'
                  }`}
                />
                <span>{statusLabels[currentStatusValue] || 'Pending'}</span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  ▼
                </span>
                <select
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  value={currentStatusValue}
                  onChange={(e) =>
                    handleStatusChange(
                      currentAd,
                      currentRecipeGroup,
                      e.target.value,
                    )
                  }
                  aria-label="Update ad status"
                >
                  {statusOptions.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.disabled}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {currentIndex < reviewAds.length - 1 ? (
                <button
                  aria-label="Next"
                  onClick={() =>
                    setCurrentIndex((i) =>
                      Math.min(reviewAds.length - 1, i + 1),
                    )
                  }
                  className="btn-arrow"
                >
                  &gt;
                </button>
              ) : (
                <button
                  aria-label="End Review"
                  onClick={() => setCurrentIndex(reviewAds.length)}
                  className="btn-arrow"
                >
                  End
                </button>
              )}
            </div>
          </div>
        )}
      {showEditModal && (
        <EditRequestModal
          comment={comment}
          onCommentChange={setComment}
          editCopy={editCopy}
          onEditCopyChange={setEditCopy}
          origCopy={origCopy}
          canSubmit={canSubmitEdit}
          onCancel={() => setShowEditModal(false)}
          onSubmit={() =>
            submitResponse('edit', editContext ? { ...editContext } : {})
          }
          submitting={submitting}
        />
      )}
      {versionModal && (
        <VersionModal
          data={versionModal}
          view={versionView}
          onViewChange={setVersionView}
          onClose={closeVersionModal}
        />
      )}
      {showGallery && <GalleryModal ads={ads} onClose={() => setShowGallery(false)} />}
      {showCopyModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 overflow-auto p-4">
          <div className="bg-white p-4 rounded-xl shadow max-w-[50rem] w-full overflow-auto max-h-[90vh] flex flex-col dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Platform Copy</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => saveCopyCards(modalCopies)}
                  className={`btn-primary ${copyChanges ? '' : 'opacity-50 cursor-not-allowed'}`}
                  disabled={!copyChanges}
                >
                  Save
                </button>
                <button onClick={() => setShowCopyModal(false)} className="btn-secondary">Close</button>
              </div>
            </div>
            <p className="text-sm mb-2">
              These lines appear as the primary text, headline, and description on your Meta ads. Feel free to tweak or remove any of the options.
            </p>
            <CopyRecipePreview
              onSave={saveCopyCards}
              initialResults={copyCards}
              showOnlyResults
              hideBrandSelect
              onCopiesChange={setModalCopies}
            />
          </div>
        </div>
      )}
      {showFeedbackModal && (
        <FeedbackModal
          comment={feedbackComment}
          onCommentChange={setFeedbackComment}
          onSubmit={submitFeedback}
          onClose={() => setShowFeedbackModal(false)}
          submitting={feedbackSubmitting}
        />
      )}
      </div>
    </div>
  );
});

export default Review;
