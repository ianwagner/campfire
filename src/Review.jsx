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
import {
  FiX,
  FiGrid,
  FiCheck,
  FiType,
  FiMessageSquare,
  FiPlus,
  FiEdit3,
} from 'react-icons/fi';
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
  orderBy,
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
import getVersion from './utils/getVersion';
import stripVersion from './utils/stripVersion';
import { isRealtimeReviewerEligible } from './utils/realtimeEligibility';

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
};

const getAssetDocumentId = (asset) =>
  normalizeKeyPart(
    asset?.assetId ||
      asset?.id ||
      asset?.documentId ||
      asset?.docId ||
      asset?.originalAssetId ||
      asset?.originalId,
  );

const getAssetParentId = (asset) =>
  normalizeKeyPart(asset?.parentAdId || asset?.parentId || asset?.originalParentId);

const getAssetUnitId = (asset) =>
  normalizeKeyPart(
    asset?.adUnitId ||
      asset?.unitId ||
      asset?.rootAdId ||
      asset?.rootAssetId ||
      asset?.assetFamilyId ||
      asset?.recipeAssetId ||
      asset?.creativeId,
  );

const getAssetUrlKey = (asset) =>
  normalizeKeyPart(asset?.adUrl || asset?.firebaseUrl || asset?.assetUrl);

const assetsReferToSameDoc = (first, second) => {
  if (!first || !second) return false;
  const firstId = getAssetDocumentId(first);
  const secondId = getAssetDocumentId(second);
  if (firstId && secondId && firstId === secondId) {
    return true;
  }
  const firstUrl = getAssetUrlKey(first);
  const secondUrl = getAssetUrlKey(second);
  return Boolean(firstUrl && secondUrl && firstUrl === secondUrl);
};

const assetMatchesReference = (asset, referenceId) => {
  const normalized = normalizeKeyPart(referenceId);
  if (!asset || !normalized) return false;
  return (
    getAssetDocumentId(asset) === normalized ||
    getAssetParentId(asset) === normalized ||
    getAssetUnitId(asset) === normalized
  );
};

const getAdUnitKey = (asset) => {
  if (!asset) return '';
  const info = parseAdFilename(asset.filename || '');
  const recipe =
    normalizeKeyPart(
      asset.recipeCode ||
        asset.recipeId ||
        asset.recipe ||
        info.recipeCode,
    ) || '';
  const adGroupId =
    normalizeKeyPart(
      asset.adGroupId || asset.groupId || asset.groupCode || info.adGroupCode,
    ) || '';
  const aspect = normalizeKeyPart(asset.aspectRatio || info.aspectRatio || '');

  let rootId = getAssetUnitId(asset) || getAssetParentId(asset);

  if (!rootId) {
    const stripped = stripVersion(asset.filename || '');
    if (stripped) {
      rootId = normalizeKeyPart(stripped);
    }
  }

  if (!rootId) {
    rootId = getAssetDocumentId(asset);
  }

  if (!rootId) {
    rootId = getAssetUrlKey(asset);
  }

  if (rootId && aspect) {
    const suffix = `_${aspect.toLowerCase()}`;
    const lowerRoot = rootId.toLowerCase();
    if (lowerRoot.endsWith(suffix)) {
      rootId = rootId.slice(0, -suffix.length);
    }
  }

  if (!rootId) {
    const fallback = getAssetDocumentId(asset);
    if (fallback) {
      rootId = `asset:${fallback}`;
    }
  }

  const parts = [];
  if (adGroupId) parts.push(adGroupId);
  if (recipe) parts.push(recipe);
  if (rootId) parts.push(rootId);

  return parts.join('|');
};

const isSameAdUnit = (first, second) => {
  if (!first || !second) return false;
  if (assetsReferToSameDoc(first, second)) {
    return true;
  }

  const firstParent = getAssetParentId(first);
  const secondParent = getAssetParentId(second);
  const firstUnit = getAssetUnitId(first);
  const secondUnit = getAssetUnitId(second);
  const firstId = getAssetDocumentId(first);
  const secondId = getAssetDocumentId(second);

  if (firstParent) {
    if (secondParent && secondParent === firstParent) return true;
    if (secondId && secondId === firstParent) return true;
    if (secondUnit && secondUnit === firstParent) return true;
  }

  if (secondParent) {
    if (firstParent && firstParent === secondParent) return true;
    if (firstId && firstId === secondParent) return true;
    if (firstUnit && firstUnit === secondParent) return true;
  }

  if (firstUnit) {
    if (secondUnit && secondUnit === firstUnit) return true;
    if (secondParent && secondParent === firstUnit) return true;
    if (secondId && secondId === firstUnit) return true;
  }

  if (secondUnit) {
    if (firstParent && firstParent === secondUnit) return true;
    if (firstId && firstId === secondUnit) return true;
  }

  const firstUrl = getAssetUrlKey(first);
  const secondUrl = getAssetUrlKey(second);
  if (firstUrl && secondUrl && firstUrl === secondUrl) {
    return true;
  }

  const firstKey = getAdUnitKey(first);
  const secondKey = getAdUnitKey(second);
  if (firstKey && secondKey) {
    return firstKey === secondKey;
  }
  return false;
};

const getAdKey = (ad, index = 0) => {
  if (!ad) return `ad-${index}`;
  return (
    ad.assetId ||
    ad.id ||
    ad.firebaseUrl ||
    ad.adUrl ||
    ad.filename ||
    `${ad.recipeCode || 'ad'}-${index}`
  );
};

const dedupeByAdUnit = (list = []) => {
  const seen = new Set();
  return list.filter((item) => {
    if (!item) return false;
    const key =
      getAdUnitKey(item) ||
      getAssetUnitId(item) ||
      getAssetParentId(item) ||
      getAssetDocumentId(item) ||
      getAssetUrlKey(item) ||
      item.assetId ||
      item.id;
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const isSafari =
  typeof navigator !== 'undefined' &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const BUFFER_COUNT = 3;

const REVIEW_V2_ASPECT_ORDER = [
  '9x16',
  '',
  '1x1',
  '3x5',
  '4x5',
  'Pinterest',
  'Snapchat',
];

const getReviewAspectPriority = (aspect) => {
  const normalized = normalizeKeyPart(aspect);
  const idx = REVIEW_V2_ASPECT_ORDER.indexOf(normalized);
  return idx === -1 ? REVIEW_V2_ASPECT_ORDER.length : idx;
};

const compareRecipeCodes = (first, second) => {
  const a = normalizeKeyPart(first);
  const b = normalizeKeyPart(second);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const Review = forwardRef(
  (
    {
      user,
      userRole = null,
      brandCodes = [],
      groupId = null,
      reviewerName = '',
      agencyId = null,
      allowPublicListeners = true,
      isPublicReviewer = false,
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
  const [editModalMode, setEditModalMode] = useState('all');
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
  const [expandedRequests, setExpandedRequests] = useState({});
  const [pendingResponseContext, setPendingResponseContext] = useState(null);
  const [manualStatus, setManualStatus] = useState({});
  const statusBarSentinelRef = useRef(null);
  const [statusBarPinned, setStatusBarPinned] = useState(false);
  const preloads = useRef([]);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const reviewerIdentifier = useMemo(() => {
    if (reviewerName) return reviewerName;
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email;
    if (user?.uid) return user.uid;
    return 'anonymous';
  }, [reviewerName, user]);

  const canUpdateGroupDoc = !isPublicReviewer;
  const reviewerNameValue = typeof reviewerName === 'string' ? reviewerName : '';
  const userUid = user?.uid || null;
  const realtimeEnabled = useMemo(
    () => {
      return isRealtimeReviewerEligible({
        allowPublicListeners,
        isPublicReviewer,
        isAuthenticated: Boolean(userUid),
        reviewerName: reviewerNameValue,
      });
    },
    [allowPublicListeners, isPublicReviewer, userUid, reviewerNameValue],
  );

  const performGroupUpdate = useCallback(
    async (
      targetGroupId,
      update,
      { type = 'generic', publicUpdate = update } = {},
    ) => {
      if (!targetGroupId || !update) return;
      if (canUpdateGroupDoc) {
        await updateDoc(doc(db, 'adGroups', targetGroupId), update);
        return;
      }
      if (!publicUpdate || Object.keys(publicUpdate).length === 0) return;
      await addDoc(collection(db, 'adGroups', targetGroupId, 'publicUpdates'), {
        type,
        update: publicUpdate,
        createdAt: serverTimestamp(),
        reviewer: reviewerIdentifier,
        source: 'public-review',
      });
    },
    [canUpdateGroupDoc, reviewerIdentifier],
  );
  const advancedRef = useRef(false);
  const firstAdUrlRef = useRef(null);
  const logoUrlRef = useRef(null);
  const [initialStatus, setInitialStatus] = useState(null);
  const [historyEntries, setHistoryEntries] = useState({});
  const [recipeCopyMap, setRecipeCopyMap] = useState({});
  // refs to track latest values for cleanup on unmount
  const currentIndexRef = useRef(currentIndex);
  const reviewLengthRef = useRef(reviewAds.length);
  const publicHistoryKeyRef = useRef(null);
  const publicRealtimeRef = useRef({
    key: null,
    assetUnsub: null,
    historyUnsubs: new Map(),
  });
  const cleanupPublicRealtime = useCallback(() => {
    const state = publicRealtimeRef.current;
    if (!state) {
      return;
    }
    const hadAssetListener = Boolean(state.assetUnsub);
    const hadHistoryListeners = Boolean(
      state.historyUnsubs && state.historyUnsubs.size > 0,
    );
    const hadKey = state.key !== null || publicHistoryKeyRef.current !== null;
    if (state.assetUnsub) {
      state.assetUnsub();
      state.assetUnsub = null;
    }
    if (state.historyUnsubs && state.historyUnsubs.size > 0) {
      state.historyUnsubs.forEach((entry) => {
        try {
          entry.unsub();
        } catch (err) {
          console.error('Failed to clean up public history listener', err);
        }
      });
      state.historyUnsubs.clear();
    }
    state.key = null;
    publicHistoryKeyRef.current = null;
    if (hadAssetListener || hadHistoryListeners || hadKey) {
      setHistoryEntries({});
    }
  }, []);
  const { agency } = useAgencyTheme(agencyId);
  const { settings } = useSiteSettings(false);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    reviewLengthRef.current = reviewAds.length;
  }, [reviewAds.length]);

  useEffect(() => {
    if (reviewVersion !== 2) {
      setStatusBarPinned(false);
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver !== 'function') {
      setStatusBarPinned(false);
      return;
    }
    const sentinel = statusBarSentinelRef.current;
    if (!sentinel) {
      setStatusBarPinned(false);
      return;
    }
    // Add some hysteresis so the pinned state is stable even as the bar
    // changes height when it condenses.
    const releaseOffset = 24;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
        const sentinelTop = entry.boundingClientRect.top;
        if (!Number.isFinite(sentinelTop)) {
          return;
        }
        setStatusBarPinned((prevPinned) => {
          if (prevPinned) {
            if (sentinelTop > rootTop + releaseOffset) {
              return false;
            }
            return true;
          }
          if (sentinelTop <= rootTop) {
            return true;
          }
          return prevPinned;
        });
      },
      { threshold: [0, 1] },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [reviewVersion, reviewAds.length]);



  useImperativeHandle(ref, () => ({
    openGallery: () => setShowGallery(true),
    openCopy: () => setShowCopyModal(true),
  }));
  const canSubmitEdit = useMemo(() => {
    const trimmedComment = comment.trim();
    const trimmedCopy = editCopy.trim();
    const trimmedOrig = (origCopy || '').trim();
    if (editModalMode === 'note') {
      return trimmedComment.length > 0;
    }
    if (editModalMode === 'copy') {
      return Boolean(trimmedCopy) && trimmedCopy !== trimmedOrig;
    }
    return (
      trimmedComment.length > 0 ||
      (Boolean(trimmedCopy) && trimmedCopy !== trimmedOrig)
    );
  }, [comment, editCopy, origCopy, editModalMode]);

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
    const prefOrder = REVIEW_V2_ASPECT_ORDER;
    const getRecipe = (a) =>
      a.recipeCode || parseAdFilename(a.filename || '').recipeCode || 'unknown';
    const getAspect = (a) =>
      a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
    // Deduplicate by root id while keeping highest version of each asset
    const latestMap = {};
    list.forEach((a) => {
      const root =
        getAssetUnitId(a) ||
        getAssetParentId(a) ||
        stripVersion(a.filename) ||
        getAssetDocumentId(a);
      if (!root) return;
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
    heroes.sort((a, b) => compareRecipeCodes(getRecipe(a), getRecipe(b)));
    return heroes;
  }, []);

  const getLatestAds = useCallback((list) => {
    const map = {};
    list.forEach((a) => {
      const root =
        getAssetUnitId(a) ||
        getAssetParentId(a) ||
        stripVersion(a.filename) ||
        getAssetDocumentId(a);
      if (!root) return;
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
    if (!allowPublicListeners || !groupId) {
      setCopyCards([]);
      return undefined;
    }

    publicHistoryKeyRef.current = null;

    let cancelled = false;
    let unsubscribe = null;
    let pollTimer = null;
    const collectionRef = collection(db, 'adGroups', groupId, 'copyCards');

    const applySnapshot = (snap) => {
      if (cancelled) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCopyCards(list);
    };

    const fetchOnce = async () => {
      try {
        const snap = await getDocs(collectionRef);
        applySnapshot(snap);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load copy cards via polling', err);
        }
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (err) {
          console.warn('Failed to clean up copy card listener', err);
        }
        unsubscribe = null;
      }
      fetchOnce();
      pollTimer = setInterval(fetchOnce, 10000);
    };

    if (!realtimeEnabled) {
      startPolling();
    } else {
      try {
        unsubscribe = onSnapshot(
          collectionRef,
          (snap) => {
            applySnapshot(snap);
          },
          (error) => {
            console.error('Failed to subscribe to copy cards', error);
            startPolling();
          },
        );
      } catch (err) {
        console.error('Realtime copy card listener setup failed', err);
        startPolling();
      }
    }

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [allowPublicListeners, groupId, realtimeEnabled]);

  useEffect(() => {
    if (showCopyModal) {
      setModalCopies(copyCards);
    }
  }, [showCopyModal]);

useEffect(() => {
  if (!started || !groupId || initialStatus === 'done') return;
  performGroupUpdate(
    groupId,
    {
      reviewProgress: currentIndex,
    },
    {
      type: 'progress',
      publicUpdate: { reviewProgress: currentIndex },
    },
  ).catch((err) => console.error('Failed to save progress', err));
}, [
  currentIndex,
  started,
  groupId,
  initialStatus,
  performGroupUpdate,
]);

  const releaseLock = useCallback(() => {
    if (!groupId || initialStatus === 'done') return;
    const idx = currentIndexRef.current;
    const len = reviewLengthRef.current;
    const progress = idx >= len ? null : idx;
    performGroupUpdate(
      groupId,
      {
        reviewProgress: progress,
      },
      {
        type: 'progress',
        publicUpdate: { reviewProgress: progress },
      },
    ).catch(() => {});
  }, [groupId, initialStatus, performGroupUpdate]);

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
      performGroupUpdate(
        groupId,
        {
          reviewProgress: null,
        },
        {
          type: 'progress',
          publicUpdate: {
            reviewProgress: null,
            completedAt: new Date().toISOString(),
          },
        },
      ).catch((err) => console.error('Failed to update review progress', err));
    }
  }, [
    currentIndex,
    reviewAds.length,
    groupId,
    ads,
    performGroupUpdate,
  ]);

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
    return Object.entries(map).map(([recipeCode, list]) => {
      list.sort(
        (a, b) =>
          getReviewAspectPriority(a.aspectRatio) - getReviewAspectPriority(b.aspectRatio),
      );
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
    if (!allowPublicListeners) {
      return;
    }
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
          const normalizedBrandCodes = Array.from(
            new Set(
              brandCodes
                .map((code) =>
                  typeof code === 'string' ? code.trim() : ''
                )
                .filter((code) => code)
            )
          );

          if (normalizedBrandCodes.length === 0) {
            debugLog('No valid brand codes provided for review fetch', { brandCodes });
            list = [];
          } else {
            const batches = [];
            for (let i = 0; i < normalizedBrandCodes.length; i += 10) {
              batches.push(normalizedBrandCodes.slice(i, i + 10));
            }

            const snapshots = await Promise.all(
              batches.map((codes) =>
                getDocs(
                  query(
                    collectionGroup(db, 'assets'),
                    where('brandCode', 'in', codes),
                    where('status', '==', 'ready'),
                    where('isResolved', '==', false)
                  )
                )
              )
            );

            const seenPaths = new Set();
            const docs = [];
            snapshots.forEach((snap) => {
              snap.docs.forEach((docSnap) => {
                const refPath = docSnap.ref.path;
                if (!seenPaths.has(refPath)) {
                  seenPaths.add(refPath);
                  docs.push(docSnap);
                }
              });
            });

            const groupCache = {};
            list = await Promise.all(
              docs.map(async (d) => {
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
        }
        // if we only received the latest revision, fetch older versions
        const rootsToFetch = {};
        list.forEach((a) => {
          if (a.parentAdId) {
            const rootId = a.parentAdId;
            const hasRoot = list.some((b) => assetMatchesReference(b, rootId));
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
                const data = d.data();
                const dedupeTarget = { assetId: d.id, ...data };
                const relatedRefs = [
                  d.id,
                  data.parentAdId,
                  data.parentId,
                  data.rootAdId,
                  data.rootAssetId,
                  data.assetFamilyId,
                  data.recipeAssetId,
                ];
                const alreadyIncluded = list.some((a) => {
                  if (assetsReferToSameDoc(a, dedupeTarget)) return true;
                  return relatedRefs.some((ref) => assetMatchesReference(a, ref));
                });
                if (!alreadyIncluded) {
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

        list.sort((a, b) => {
          const infoA = parseAdFilename(a.filename || '');
          const infoB = parseAdFilename(b.filename || '');
          const rA = a.recipeCode || infoA.recipeCode || '';
          const rB = b.recipeCode || infoB.recipeCode || '';
          const recipeComparison = compareRecipeCodes(rA, rB);
          if (recipeComparison !== 0) return recipeComparison;
          const aAsp = a.aspectRatio || infoA.aspectRatio || '';
          const bAsp = b.aspectRatio || infoB.aspectRatio || '';
          return (
            getReviewAspectPriority(aAsp) - getReviewAspectPriority(bAsp)
          );
        });

        // determine latest version for each ad unit (recipe + group)
        const unitVersionMap = {};
        list.forEach((a) => {
          const key = getAdUnitKey(a);
          const ver = getVersion(a);
          if (!key) return;
          if (!unitVersionMap[key] || unitVersionMap[key] < ver) {
            unitVersionMap[key] = ver;
          }
        });
        const latestUnits = list.filter((a) => {
          const key = getAdUnitKey(a);
          if (!key) return true;
          return getVersion(a) === unitVersionMap[key];
        });

        // keep highest version per asset for the review list
        const versionMap = {};
        latestUnits.forEach((a) => {
          const root =
            getAssetUnitId(a) ||
            getAssetParentId(a) ||
            getAssetDocumentId(a) ||
            stripVersion(a.filename);
          if (!root) return;
          if (!versionMap[root] || getVersion(versionMap[root]) < getVersion(a)) {
            versionMap[root] = a;
          }
        });
        const deduped = Object.values(versionMap);

        const visibleAssets = list.filter((a) => a.status !== 'archived');
        const visibleDeduped = deduped.filter((a) => a.status !== 'archived');

        if (rv === 2) {
          const uniqueVisibleDeduped = dedupeByAdUnit(visibleDeduped);
          setAllAds(visibleAssets);
          setAds(uniqueVisibleDeduped);
          setAllHeroAds(uniqueVisibleDeduped);
          setReviewAds(uniqueVisibleDeduped);
          setVersionMode(false);
          setHasPending(
            uniqueVisibleDeduped.some((a) =>
              ['pending', 'ready', 'in review'].includes(a.status),
            ),
          );
          setPendingOnly(false);
          const initialStatuses = {};
          uniqueVisibleDeduped.forEach((ad) => {
            let resp;
            if (ad.status === 'approved') resp = 'approve';
            else if (ad.status === 'rejected') resp = 'reject';
            else if (ad.status === 'edit_requested') resp = 'edit';
            if (resp) {
              const url = ad.adUrl || ad.firebaseUrl;
              if (url) {
                initialStatuses[url] = { adUrl: url, response: resp };
              }
            }
          });
          setResponses(initialStatuses);
          setCurrentIndex(0);
          return;
        }

        const hasPendingAds = deduped.some((a) => a.status === 'pending');
        const nonPending = deduped.filter((a) => a.status !== 'pending');

        // store all non-pending ads (including archived versions) so the
        // version modal can show previous revisions
        const fullNonPending = list.filter((a) => a.status !== 'pending');
        setAllAds(fullNonPending);

        setAds(nonPending);
        setHasPending(hasPendingAds);

        const readyAds = nonPending.filter((a) => a.status === 'ready');
        const readyVersions = readyAds.filter((a) => getVersion(a) > 1);
        const reviewSource = readyAds.length > 0 ? readyAds : nonPending;
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

        const allList = buildHeroList(nonPending);
        const versionList = buildHeroList(readyVersions);
        setAllHeroAds(allList);
        const target = versionList.length > 0 ? versionList : allList;
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
  }, [allowPublicListeners, user, brandCodes, groupId]);

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
  const currentAssetId = getAssetDocumentId(currentAd);
  const versions = useMemo(() => {
    if (!currentAd) return [];
    const related = allAds.filter((a) => isSameAdUnit(a, currentAd));
    const verMap = {};
    related.forEach((a) => {
      const ver = getVersion(a);
      if (!verMap[ver]) verMap[ver] = [];
      verMap[ver].push(a);
    });
    const groups = Object.values(verMap).sort(
      (a, b) => getVersion(b[0]) - getVersion(a[0])
    );
    groups.forEach((g) => {
      g.sort((a, b) => {
        const aspA = a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';
        const aspB = b.aspectRatio || parseAdFilename(b.filename || '').aspectRatio || '';
        return (
          getReviewAspectPriority(aspA) - getReviewAspectPriority(aspB)
        );
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
  const displayAssetId = getAssetDocumentId(displayAd);
  const displayParentId = getAssetParentId(displayAd);
  const displayUnitId = getAssetUnitId(displayAd);

  useEffect(() => {
    setVersionIndex(0);
  }, [currentAssetId]);

  const adUrl =
    displayAd && typeof displayAd === 'object'
      ? displayAd.adUrl || displayAd.firebaseUrl
      : displayAd;
  const brandCode =
    currentAd && typeof currentAd === 'object' ? currentAd.brandCode : undefined;
  const groupName =
    currentAd && typeof currentAd === 'object' ? currentAd.groupName : undefined;
  const adGroupDisplayName = useMemo(() => {
    if (groupName) return groupName;
    const withName = reviewAds.find((adItem) => adItem && adItem.groupName);
    return withName?.groupName ?? '';
  }, [groupName, reviewAds]);
  const statusResponse = useMemo(() => {
    if (!currentAd) return null;
    const { status } = currentAd;
    if (status === 'approved') return 'approve';
    if (status === 'rejected') return 'reject';
    if (status === 'edit_requested') return 'edit';
    return null;
  }, [currentAd]);

  const selectedResponse = responses[adUrl]?.response ?? statusResponse;
  const showSecondView = !!selectedResponse;
  // show next step as soon as a decision is made
  const openVersionModal = (ver) => {
    const base = displayAd || currentAd;
    if (!base) return;
    const rootId =
      getAssetParentId(base) ||
      getAssetUnitId(base) ||
      stripVersion(base.filename);
    const siblings = allAds.filter((a) => {
      if (getAssetParentId(base) || getAssetUnitId(base)) {
        return assetMatchesReference(a, rootId);
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
    if (!isPublicReviewer) {
      cleanupPublicRealtime();
      return;
    }

    if (!allowPublicListeners) {
      cleanupPublicRealtime();
      return;
    }

    if (!displayAd?.adGroupId || !displayAssetId) {
      cleanupPublicRealtime();
      return;
    }

    const historyKey = [
      displayAd.adGroupId,
      displayAssetId,
      displayParentId || '',
      displayUnitId || '',
    ].join('|');

    const state = publicRealtimeRef.current;
    if (state.key !== historyKey) {
      cleanupPublicRealtime();
      state.key = historyKey;
    }

    publicHistoryKeyRef.current = historyKey;

    if (!state.assetUnsub) {
      const assetRef = doc(
        db,
        'adGroups',
        displayAd.adGroupId,
        'assets',
        displayAssetId,
      );
      state.assetUnsub = onSnapshot(
        assetRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = { assetId: snap.id, ...snap.data() };
          setAds((prev) =>
            prev.map((a) => (assetsReferToSameDoc(a, data) ? { ...a, ...data } : a)),
          );
          setReviewAds((prev) =>
            prev.map((a) => (assetsReferToSameDoc(a, data) ? { ...a, ...data } : a)),
          );
          setAllAds((prev) =>
            prev.map((a) =>
              assetsReferToSameDoc(a, data)
                ? {
                    ...a,
                    ...data,
                    adGroupId: data.adGroupId || a.adGroupId,
                    groupName: data.groupName || a.groupName,
                    firebaseUrl: data.firebaseUrl || a.firebaseUrl,
                  }
                : a,
            ),
          );
        },
        (error) => {
          console.error('Failed to subscribe to asset updates', error);
        },
      );
    }

    const rootId =
      displayParentId || displayUnitId || stripVersion(displayAd.filename);
    const related = allAds.filter((a) => {
      if (displayParentId || displayUnitId) {
        return assetMatchesReference(a, rootId);
      }
      return stripVersion(a.filename) === rootId;
    });
    const versionEntries = new Map();
    [...related, displayAd].forEach((a) => {
      const key = getAssetDocumentId(a);
      if (key && !versionEntries.has(key)) {
        versionEntries.set(key, { ad: a, version: getVersion(a) });
      }
    });

    versionEntries.forEach((info, docId) => {
      if (state.historyUnsubs.has(docId)) {
        const entry = state.historyUnsubs.get(docId);
        entry.version = info.version;
        return;
      }
      const historyQuery = query(
        collection(
          doc(db, 'adGroups', info.ad.adGroupId, 'assets', docId),
          'history',
        ),
        orderBy('updatedAt', 'asc'),
      );
      const unsubscribe = onSnapshot(
        historyQuery,
        (snap) => {
          setHistoryEntries((prev) => ({
            ...prev,
            [info.version]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
          }));
        },
        (error) => {
          console.error('Failed to subscribe to asset history', error);
        },
      );
      state.historyUnsubs.set(docId, { unsub: unsubscribe, version: info.version });
    });

    const staleDocs = [];
    state.historyUnsubs.forEach((entry, docId) => {
      if (!versionEntries.has(docId)) {
        staleDocs.push({ docId, entry });
      }
    });
    staleDocs.forEach(({ docId, entry }) => {
      try {
        entry.unsub();
      } catch (error) {
        console.error('Failed to remove history listener', error);
      }
      state.historyUnsubs.delete(docId);
      if (typeof entry.version !== 'undefined') {
        setHistoryEntries((prev) => {
          const next = { ...prev };
          delete next[entry.version];
          return next;
        });
      }
    });
  }, [
    allowPublicListeners,
    allAds,
    cleanupPublicRealtime,
    displayAd?.adGroupId,
    displayAd?.filename,
    displayAssetId,
    displayParentId,
    displayUnitId,
    isPublicReviewer,
  ]);

  useEffect(() => {
    return () => cleanupPublicRealtime();
  }, [cleanupPublicRealtime]);

  useEffect(() => {
    if (isPublicReviewer) {
      return;
    }

    setHistoryEntries({});
    if (!allowPublicListeners) {
      return;
    }
    if (!displayAd?.adGroupId || !displayAssetId) return;

    publicHistoryKeyRef.current = null;

    let cancelled = false;
    let assetUnsubscribe = null;
    let assetPollTimer = null;
    const historyCleanupFns = [];

    const mergeAssetUpdate = (data) => {
      if (cancelled) return;
      setAds((prev) =>
        prev.map((a) => (assetsReferToSameDoc(a, data) ? { ...a, ...data } : a)),
      );
      setReviewAds((prev) =>
        prev.map((a) => (assetsReferToSameDoc(a, data) ? { ...a, ...data } : a)),
      );
      setAllAds((prev) =>
        prev.map((a) =>
          assetsReferToSameDoc(a, data)
            ? {
                ...a,
                ...data,
                adGroupId: data.adGroupId || a.adGroupId,
                groupName: data.groupName || a.groupName,
                firebaseUrl: data.firebaseUrl || a.firebaseUrl,
              }
            : a,
        ),
      );
    };

    const assetRef = doc(db, 'adGroups', displayAd.adGroupId, 'assets', displayAssetId);

    const fetchAssetOnce = async () => {
      try {
        const snap = await getDoc(assetRef);
        if (!snap.exists()) return;
        mergeAssetUpdate({ assetId: snap.id, ...snap.data() });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load asset via polling', err);
        }
      }
    };

    const startAssetPolling = () => {
      if (assetPollTimer) return;
      if (assetUnsubscribe) {
        try {
          assetUnsubscribe();
        } catch (err) {
          console.warn('Failed to clean up asset listener', err);
        }
        assetUnsubscribe = null;
      }
      fetchAssetOnce();
      assetPollTimer = setInterval(fetchAssetOnce, 5000);
    };

    if (!realtimeEnabled) {
      startAssetPolling();
    } else {
      try {
        assetUnsubscribe = onSnapshot(
          assetRef,
          (snap) => {
            if (!snap.exists()) return;
            mergeAssetUpdate({ assetId: snap.id, ...snap.data() });
          },
          (error) => {
            console.error('Failed to subscribe to asset updates', error);
            startAssetPolling();
          },
        );
      } catch (err) {
        console.error('Realtime asset listener setup failed', err);
        startAssetPolling();
      }
    }

    const rootId = displayParentId || displayUnitId || stripVersion(displayAd.filename);
    const related = allAds.filter((a) => {
      if (displayParentId || displayUnitId) {
        return assetMatchesReference(a, rootId);
      }
      return stripVersion(a.filename) === rootId;
    });
    const versionMap = {};
    [...related, displayAd].forEach((a) => {
      const key = getAssetDocumentId(a);
      if (key) {
        versionMap[key] = a;
      }
    });

    Object.values(versionMap).forEach((ad) => {
      const docId = getAssetDocumentId(ad);
      if (!docId) return;

      const historyQuery = query(
        collection(doc(db, 'adGroups', ad.adGroupId, 'assets', docId), 'history'),
        orderBy('updatedAt', 'asc'),
      );

      let realtimeUnsub = null;
      let historyPollTimer = null;

      const applyHistorySnapshot = (snap) => {
        if (cancelled) return;
        setHistoryEntries((prev) => ({
          ...prev,
          [getVersion(ad)]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        }));
      };

      const fetchHistoryOnce = async () => {
        try {
          const snap = await getDocs(historyQuery);
          applyHistorySnapshot(snap);
        } catch (err) {
          if (!cancelled) {
            console.error('Failed to load asset history via polling', err);
          }
        }
      };

      const startHistoryPolling = () => {
        if (historyPollTimer) return;
        if (realtimeUnsub) {
          try {
            realtimeUnsub();
          } catch (err) {
            console.warn('Failed to clean up history listener', err);
          }
          realtimeUnsub = null;
        }
        fetchHistoryOnce();
        historyPollTimer = setInterval(fetchHistoryOnce, 10000);
      };

      if (!realtimeEnabled) {
        startHistoryPolling();
      } else {
        try {
          realtimeUnsub = onSnapshot(
            historyQuery,
            (snap) => applyHistorySnapshot(snap),
            (error) => {
              console.error('Failed to subscribe to asset history', error);
              startHistoryPolling();
            },
          );
        } catch (err) {
          console.error('Realtime asset history listener setup failed', err);
          startHistoryPolling();
        }
      }

      historyCleanupFns.push(() => {
        if (realtimeUnsub) {
          realtimeUnsub();
        }
        if (historyPollTimer) {
          clearInterval(historyPollTimer);
        }
      });
    });

    return () => {
      cancelled = true;
      if (assetUnsubscribe) {
        assetUnsubscribe();
      }
      if (assetPollTimer) {
        clearInterval(assetPollTimer);
      }
      historyCleanupFns.forEach((fn) => fn());
      setHistoryEntries({});
    };
  }, [
    allowPublicListeners,
    displayAd?.adGroupId,
    displayAssetId,
    displayParentId,
    displayUnitId,
    allAds,
    isPublicReviewer,
    realtimeEnabled,
  ]);


  useEffect(() => {
    if (!allowPublicListeners) {
      return;
    }
    const recipeCode =
      displayAd?.recipeCode ||
      parseAdFilename(displayAd?.filename || '').recipeCode ||
      '';
    if (!displayAd?.adGroupId || !recipeCode) return;
    if (recipeCopyMap[recipeCode]) return;
    let cancelled = false;
    getDoc(doc(db, 'adGroups', displayAd.adGroupId, 'recipes', recipeCode))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : null;
        const text = data ? data.latestCopy || data.copy || '' : '';
        setRecipeCopyMap((prev) => ({ ...prev, [recipeCode]: text }));
      })
      .catch((err) => console.error('Failed to load recipe copy', err));
    return () => {
      cancelled = true;
    };
  }, [allowPublicListeners, displayAd?.adGroupId, displayAd?.recipeCode, displayAd?.filename]);

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
      assets.forEach((asset) => {
        const assetDocId = getAssetDocumentId(asset);
        if (!asset.adGroupId || !assetDocId) return;
        toUpdate.push(
          updateDoc(
            doc(db, 'adGroups', asset.adGroupId, 'assets', assetDocId),
            {
              status: 'pending',
              isResolved: false,
            },
          ),
        );
      });
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
  const statusLabelMap = {
    pending: 'Pending',
    approve: 'Approved',
    reject: 'Rejected',
    edit: 'Edit Requested',
  };
  const statusOptions = [
    { value: 'pending', label: statusLabelMap.pending },
    { value: 'approve', label: statusLabelMap.approve },
    { value: 'reject', label: statusLabelMap.reject },
    { value: 'edit', label: statusLabelMap.edit },
  ];
  const statusDotStyles = {
    pending: { backgroundColor: 'var(--pending-color)' },
    approve: { backgroundColor: 'var(--approve-color)' },
    reject: { backgroundColor: 'var(--reject-color)' },
    edit: { backgroundColor: 'var(--edit-color)' },
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

  const versionGroupsByAd = useMemo(() => {
    if (!reviewAds || reviewAds.length === 0) return {};
    const map = {};
    reviewAds.forEach((ad, idx) => {
      if (!ad) return;
      const cardKey = getAdKey(ad, idx);
      const related = allAds.filter(
        (asset) => asset.status !== 'archived' && isSameAdUnit(asset, ad),
      );
      if (related.length === 0) {
        map[cardKey] = [[ad]];
        return;
      }
      const verMap = {};
      related.forEach((asset) => {
        const ver = getVersion(asset);
        if (!verMap[ver]) verMap[ver] = [];
        verMap[ver].push(asset);
      });
      const groups = Object.values(verMap)
        .map((group) =>
          group
            .filter((asset) => asset.status !== 'archived')
            .sort((a, b) => {
              const aspectA =
                a.aspectRatio ||
                parseAdFilename(a.filename || '').aspectRatio ||
                '';
              const aspectB =
                b.aspectRatio ||
                parseAdFilename(b.filename || '').aspectRatio ||
                '';
              return (
                getReviewAspectPriority(aspectA) - getReviewAspectPriority(aspectB)
              );
            }),
        )
        .filter((group) => group.length > 0)
        .sort((a, b) => getVersion(b[0]) - getVersion(a[0]));
      map[cardKey] = groups.length > 0 ? groups : [[ad]];
    });
    return map;
  }, [reviewAds, allAds]);

  const buildStatusMeta = useCallback(
    (ad, index) => {
      const fallback = {
        cardKey: getAdKey(ad, index),
        groups: [],
        latestAssets: [],
        statusAssets: [],
        statusValue: 'pending',
      };
      if (!ad) return fallback;

      const cardKey = getAdKey(ad, index);
      const groups = versionGroupsByAd[cardKey] || [[ad]];
      const latestAssets = groups[0] || [ad];
      const statusAssetsFiltered = latestAssets.filter((asset) =>
        isSameAdUnit(asset, ad),
      );
      const statusAssets =
        statusAssetsFiltered.length > 0 ? statusAssetsFiltered : [ad];
      const assetResponses = statusAssets
        .map((asset) => responses[asset.adUrl || asset.firebaseUrl])
        .filter(Boolean);
      const responseValue = assetResponses[0]?.response;
      const statusFromAssets = statusAssets.some(
        (asset) => asset.status === 'approved',
      )
        ? 'approve'
        : statusAssets.some((asset) => asset.status === 'rejected')
        ? 'reject'
        : statusAssets.some((asset) => asset.status === 'edit_requested')
        ? 'edit'
        : null;
      const defaultStatus =
        ad.status === 'approved'
          ? 'approve'
          : ad.status === 'rejected'
          ? 'reject'
          : ad.status === 'edit_requested'
          ? 'edit'
          : 'pending';
      const combinedStatus =
        manualStatus[cardKey] ||
        responseValue ||
        statusFromAssets ||
        defaultStatus;
      const normalizedStatus = ['approve', 'reject', 'edit', 'pending'].includes(
        combinedStatus,
      )
        ? combinedStatus
        : 'pending';

      return {
        cardKey,
        groups,
        latestAssets,
        statusAssets,
        statusValue: normalizedStatus,
      };
    },
    [versionGroupsByAd, responses, manualStatus],
  );

  const reviewStatusCounts = useMemo(() => {
    const counts = { pending: 0, approve: 0, edit: 0, reject: 0 };
    if (!reviewAds || reviewAds.length === 0) {
      return counts;
    }
    reviewAds.forEach((ad, index) => {
      const { statusValue } = buildStatusMeta(ad, index);
      const key = ['approve', 'reject', 'edit', 'pending'].includes(statusValue)
        ? statusValue
        : 'pending';
      counts[key] += 1;
    });
    return counts;
  }, [reviewAds, buildStatusMeta]);

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

  const openEditRequest = async (
    targetAd = currentAd,
    index = currentIndex,
    { mode = 'all', initialComment = '', initialCopy } = {},
  ) => {
    setCurrentIndex(index);
    setEditModalMode(mode);
    setComment(initialComment);
    setShowEditModal(true);
    if (!targetAd?.adGroupId) {
      if (typeof initialCopy === 'string') {
        setEditCopy(initialCopy);
      }
      setOrigCopy('');
      return;
    }
    const recipeId =
      targetAd.recipeCode ||
      parseAdFilename(targetAd.filename || '').recipeCode ||
      currentRecipe;
    if (!recipeId) {
      if (typeof initialCopy === 'string') {
        setEditCopy(initialCopy);
      }
      setOrigCopy('');
      return;
    }
    try {
      const snap = await getDoc(
        doc(db, 'adGroups', targetAd.adGroupId, 'recipes', recipeId)
      );
      const data = snap.exists() ? snap.data() : null;
      const text = data ? data.latestCopy || data.copy || '' : '';
      const resolvedCopy =
        typeof initialCopy === 'string' ? initialCopy : text;
      setEditCopy(resolvedCopy);
      setOrigCopy(text);
      setReviewAds((prev) =>
        prev.map((a) =>
          assetsReferToSameDoc(a, targetAd)
            ? { ...a, originalCopy: text }
            : a,
        ),
      );
      setAds((prev) =>
        prev.map((a) =>
          assetsReferToSameDoc(a, targetAd)
            ? { ...a, originalCopy: text }
            : a,
        ),
      );
      setAllAds((prev) =>
        prev.map((a) =>
          assetsReferToSameDoc(a, targetAd)
            ? { ...a, originalCopy: text }
            : a,
        ),
      );
    } catch (err) {
      console.error('Failed to load copy', err);
      setEditCopy(typeof initialCopy === 'string' ? initialCopy : '');
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

  const submitResponse = async (
    responseType,
    {
      targetAd = currentAd,
      targetAssets = currentRecipeGroup?.assets || [],
      targetIndex = currentIndex,
      skipAdvance = false,
    } = {},
  ) => {
    if (!targetAd) return;
    advancedRef.current = false;
    if (!skipAdvance) {
      setAnimating(responseType);
    } else {
      setAnimating(null);
    }
    setSubmitting(true);

    const matchesTargetAsset = (asset) =>
      !!asset &&
      asset.status !== 'archived' &&
      !!targetAd &&
      isSameAdUnit(asset, targetAd);
    const filteredAssets = (targetAssets || []).filter(matchesTargetAsset);
    const recipeAssets = filteredAssets.length > 0 ? filteredAssets : [targetAd];
    const updates = [];
    const addedResponses = {};
    const newStatus =
      responseType === 'approve'
        ? 'approved'
        : responseType === 'reject'
        ? 'rejected'
        : 'edit_requested';
    const recipeCode =
      targetAd.recipeCode ||
      parseAdFilename(targetAd.filename || '').recipeCode ||
      '';
    const targetKey = getAdKey(targetAd, targetIndex);
    const existingComment =
      (pendingResponseContext && pendingResponseContext.existingComment) || '';
    const trimmedInputComment = comment.trim();
    const formatComment = (note) => {
      const trimmed = (note || '').trim();
      if (!trimmed) return '';
      const name =
        reviewerName ||
        user?.displayName ||
        user?.email ||
        user?.uid ||
        'unknown';
      const formatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const timestamp = formatter.format(new Date());
      return `${trimmed}\n\n— ${name} · ${timestamp}`;
    };
    let finalComment = existingComment;
    if (responseType === 'edit') {
      if (trimmedInputComment) {
        const formatted = formatComment(trimmedInputComment);
        if (editModalMode === 'note' && existingComment) {
          finalComment = `${existingComment}\n\n${formatted}`;
        } else {
          finalComment = formatted;
        }
      }
    } else {
      finalComment = '';
    }

    try {
      for (const asset of recipeAssets) {
        const url = asset.adUrl || asset.firebaseUrl;
        const copyChanged =
          responseType === 'edit' && editCopy.trim() !== origCopy.trim();
        const respObj = {
          adUrl: url,
          response: responseType,
          comment: responseType === 'edit' ? finalComment : '',
          copyEdit: copyChanged ? editCopy : '',
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
        const assetDocId = getAssetDocumentId(asset);
        if (assetDocId && asset.adGroupId) {
          const assetRef = doc(
            db,
            'adGroups',
            asset.adGroupId,
            'assets',
            assetDocId,
          );
          const updateData = {
            status: newStatus,
            comment: responseType === 'edit' ? finalComment : '',
            copyEdit: copyChanged ? editCopy : '',
            lastUpdatedBy: user.uid,
            lastUpdatedAt: serverTimestamp(),
            ...(responseType === 'approve' ? { isResolved: true } : {}),
            ...(responseType === 'edit' ? { isResolved: false } : {}),
          };
          updates.push(updateDoc(assetRef, updateData));

          const name = reviewerName || user.displayName || user.uid || 'unknown';
          updates.push(
            addDoc(
              collection(
                db,
                'adGroups',
                asset.adGroupId,
                'assets',
                assetDocId,
                'history',
              ),
              {
                status: newStatus,
                updatedBy: name,
                updatedAt: serverTimestamp(),
                ...(responseType === 'edit' && finalComment
                  ? { comment: finalComment }
                  : {}),
                ...(responseType === 'edit' && copyChanged
                  ? { copyEdit: editCopy, origCopy }
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
              assetsReferToSameDoc(a, asset)
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? finalComment : '',
                    copyEdit: copyChanged ? editCopy : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : responseType === 'edit'
                      ? { isResolved: false }
                      : {}),
                  }
                : a,
            );
            updatedAdsState = updated;
            return updated;
          });
          setReviewAds((prev) =>
            prev.map((a) =>
              assetsReferToSameDoc(a, asset)
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? finalComment : '',
                    copyEdit: copyChanged ? editCopy : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : responseType === 'edit'
                      ? { isResolved: false }
                      : {}),
                  }
                : a,
            ),
          );
          setAllAds((prev) =>
            prev.map((a) =>
              assetsReferToSameDoc(a, asset)
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? finalComment : '',
                    copyEdit: copyChanged ? editCopy : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : responseType === 'edit'
                      ? { isResolved: false }
                      : {}),
                  }
                : a,
            ),
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
          const updateObj = {
            ...(incReviewed ? { reviewedCount: increment(incReviewed) } : {}),
            ...(incApproved ? { approvedCount: increment(incApproved) } : {}),
            ...(incRejected ? { rejectedCount: increment(incRejected) } : {}),
            ...(incEdit ? { editCount: increment(incEdit) } : {}),
            lastUpdated: serverTimestamp(),
            ...(gSnap.exists() && !gSnap.data().thumbnailUrl
              ? { thumbnailUrl: asset.firebaseUrl }
              : {}),
          };
          const publicGroupUpdate = {
            reviewedCountDelta: incReviewed,
            approvedCountDelta: incApproved,
            rejectedCountDelta: incRejected,
            editCountDelta: incEdit,
            lastUpdated: new Date().toISOString(),
            assetId: assetDocId,
            assetStatus: newStatus,
            ...(recipeCode ? { recipeCode } : {}),
            ...(asset.brandCode ? { brandCode: asset.brandCode } : {}),
            ...(gSnap.exists() && !gSnap.data().thumbnailUrl && asset.firebaseUrl
              ? { thumbnailUrl: asset.firebaseUrl }
              : {}),
          };
          updates.push(
            performGroupUpdate(asset.adGroupId, updateObj, {
              type: 'status',
              publicUpdate: publicGroupUpdate,
            }),
          );

          const parentId = getAssetParentId(asset);
          if (responseType === 'approve' && parentId) {
            const relatedQuery = query(
              collection(db, 'adGroups', asset.adGroupId, 'assets'),
              where('parentAdId', '==', parentId)
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
              updateDoc(doc(db, 'adGroups', asset.adGroupId, 'assets', parentId), {
                isResolved: true,
              })
            );
          }
        }
        addedResponses[url] = respObj;
        setResponses((prev) => ({ ...prev, [url]: respObj }));
      }

      if (recipeAssets.length > 0 && recipeCode) {
        const recipeRef = doc(db, 'recipes', recipeCode);
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
                ...(responseType === 'edit' && finalComment
                  ? { editComment: finalComment }
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
          targetAd?.brandCode || recipeAssets[0]?.brandCode || brandCodes[0];
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
      setEditModalMode('all');
      setSubmitting(false);
      setPendingResponseContext((prev) => {
        if (!prev) return prev;
        if (prev?.key && prev.key === targetKey) return null;
        if (!prev?.key && prev?.ad) {
          const prevKey = getAdKey(prev.ad, prev.index ?? 0);
          if (prevKey === targetKey) return null;
        }
        return prev;
      });
      setManualStatus((prev) => {
        if (!targetKey) return prev;
        const next = { ...prev };
        delete next[targetKey];
        return next;
      });

      if (!skipAdvance) {
        const nextIndex = targetIndex + 1;
        if (!advancedRef.current) {
          setCurrentIndex(nextIndex);
          advancedRef.current = true;
        }
        setAnimating(null);
        if (nextIndex >= reviewAds.length) {
          setStarted(false);
        }
      } else {
        setCurrentIndex(targetIndex);
        setAnimating(null);
      }
    }
  };

  const submitNote = async () => {
    if (!currentAd?.adGroupId) {
      setShowNoteInput(false);
      setClientNote('');
      return;
    }
    setNoteSubmitting(true);
    try {
      const trimmedNote = clientNote.trim();
      await performGroupUpdate(
        currentAd.adGroupId,
        {
          clientNote: trimmedNote,
          clientNoteTimestamp: serverTimestamp(),
          hasClientNote: true,
        },
        {
          type: 'note',
          publicUpdate: {
            clientNote: trimmedNote,
            hasClientNote: true,
            clientNoteTimestamp: new Date().toISOString(),
          },
        },
      );
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


  if (!started && reviewVersion !== 2) {
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
    <div className="relative flex flex-col items-center justify-center min-h-screen space-y-4">
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
      <div className="flex flex-col items-center md:flex-row md:items-start md:justify-center md:gap-4 w-full">
        <div className="flex flex-col items-center">
          <div className="relative flex flex-col items-center w-fit mx-auto">
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
        <div className="w-full max-w-md mb-2.5 flex items-center justify-between px-1">
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
            <div className="w-full max-w-5xl space-y-6 px-2 pt-2 sm:px-0">
              <div
                ref={statusBarSentinelRef}
                aria-hidden="true"
                className="-mt-px h-px w-full opacity-0"
                style={{ pointerEvents: 'none' }}
              />
              <div className="sticky top-0 z-20">
                <div
                  className={`rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] ${statusBarPinned ? 'px-3 py-2' : 'px-4 py-3'}`}
                >
                  <div
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between ${statusBarPinned ? 'gap-3' : 'gap-4'}`}
                  >
                    <div className={`flex-1 ${statusBarPinned ? 'sm:flex sm:items-center sm:gap-4' : ''}`}>
                      {adGroupDisplayName && !statusBarPinned && (
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {adGroupDisplayName}
                        </div>
                      )}
                      <div
                        className={`grid grid-cols-2 sm:grid-cols-4 ${statusBarPinned ? 'mt-0 gap-2 sm:gap-3' : 'mt-3 gap-4'}`}
                      >
                        {['pending', 'approve', 'edit', 'reject'].map((statusKey) => {
                          const statusLabel = (statusLabelMap[statusKey] || statusKey).toLowerCase();
                          return (
                            <div
                              key={statusKey}
                              className={`flex flex-col items-center text-center ${statusBarPinned ? 'gap-0.5' : 'gap-1'}`}
                            >
                              <span
                                className={`${statusBarPinned ? 'text-lg' : 'text-xl'} font-semibold text-gray-900 dark:text-[var(--dark-text)]`}
                              >
                                {reviewStatusCounts[statusKey] ?? 0}
                              </span>
                              <span
                                className={`${statusBarPinned ? 'text-[11px]' : 'text-xs'} font-medium text-gray-500 dark:text-gray-300`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn-primary whitespace-nowrap font-semibold sm:self-center ${statusBarPinned ? 'px-3 py-1.5 text-xs' : 'text-sm'}`}
                    >
                      finalize review
                    </button>
                  </div>
                </div>
              </div>
              {reviewAds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-[var(--border-color-default)] bg-white dark:bg-[var(--dark-sidebar-bg)] p-8 text-center text-gray-500 dark:text-gray-300">
                  No ads to review yet.
                </div>
              ) : (
                reviewAds.map((ad, index) => {
                  const {
                    cardKey,
                    groups,
                    latestAssets,
                    statusAssets,
                    statusValue,
                  } = buildStatusMeta(ad, index);
                  const primaryAssets =
                    latestAssets && latestAssets.length > 0
                      ? latestAssets
                      : ad
                      ? [ad]
                      : [];
                  const getAssetAspect = (asset) =>
                    asset?.aspectRatio ||
                    parseAdFilename(asset?.filename || '').aspectRatio ||
                    '';
                  const sortedAssets = primaryAssets
                    .map((asset, originalIndex) => ({ asset, originalIndex }))
                    .sort((a, b) => {
                      const priorityA = getReviewAspectPriority(
                        getAssetAspect(a.asset),
                      );
                      const priorityB = getReviewAspectPriority(
                        getAssetAspect(b.asset),
                      );
                      if (priorityA !== priorityB) {
                        return priorityA - priorityB;
                      }
                      return a.originalIndex - b.originalIndex;
                    })
                    .map(({ asset }) => asset);
                  const hasEditInfo = statusAssets.find(
                    (asset) => asset.comment || asset.copyEdit,
                  );
                  const existingComment = hasEditInfo?.comment || '';
                  const existingCopyEdit = hasEditInfo?.copyEdit || '';
                  const resolvedExistingCopy =
                    existingCopyEdit && existingCopyEdit.length > 0
                      ? existingCopyEdit
                      : undefined;
                  const noteEntries = (() => {
                    const rawComment = hasEditInfo?.comment;
                    if (!rawComment) return [];
                    const matches = Array.from(
                      rawComment.matchAll(/(.*?)\n\n— ([^\n]+)(?:\n\n|$)/gs),
                    );
                    const sanitizeBody = (text) =>
                      (text || '').replace(/\n+$/, '');
                    if (matches.length === 0) {
                      return [{ body: sanitizeBody(rawComment), meta: '' }];
                    }
                    return matches.map((match) => ({
                      body: sanitizeBody(match[1] || ''),
                      meta: match[2] ? `— ${match[2]}` : '',
                    }));
                  })();
                  const showEditButton = !!hasEditInfo || statusValue === 'edit';
                  const isExpanded = !!expandedRequests[cardKey];
                  const recipeLabel =
                    ad.recipeCode ||
                    parseAdFilename(ad.filename || '').recipeCode ||
                    'Ad Unit';
                  const selectId = `ad-status-${cardKey}`;
                  const handleSelectChange = async (event) => {
                    const value = event.target.value;
                    if (value === 'pending') {
                      setManualStatus((prev) => {
                        const next = { ...prev };
                        delete next[cardKey];
                        return next;
                      });
                      return;
                    }
                    if (value === 'edit') {
                      setManualStatus((prev) => ({ ...prev, [cardKey]: 'edit' }));
                      setPendingResponseContext({
                        ad,
                        assets: statusAssets,
                        index,
                        key: cardKey,
                        existingComment,
                        existingCopy: existingCopyEdit,
                      });
                      openEditRequest(ad, index, {
                        mode: 'all',
                        initialComment: '',
                        initialCopy: resolvedExistingCopy,
                      });
                      return;
                    }
                    setManualStatus((prev) => {
                      const next = { ...prev };
                      delete next[cardKey];
                      return next;
                    });
                    try {
                      await submitResponse(value, {
                        targetAd: ad,
                        targetAssets: statusAssets,
                        targetIndex: index,
                        skipAdvance: true,
                      });
                    } catch (err) {
                      console.error('Failed to update status', err);
                    }
                  };

                  return (
                    <div
                      key={cardKey}
                      className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
                    >
                      <div className="flex flex-col gap-4 p-4">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="mb-0 text-lg font-semibold leading-tight text-gray-900 dark:text-[var(--dark-text)]">
                              {recipeLabel}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {groups.length > 1 && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                                V{getVersion(groups[0][0])}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div
                            className={`grid gap-3 items-start ${
                              sortedAssets.length > 1 ? 'sm:grid-cols-2' : ''
                            }`}
                          >
                            {sortedAssets.map((asset, assetIdx) => {
                              const assetUrl = asset.firebaseUrl || asset.adUrl || '';
                              const assetAspect = getAssetAspect(asset);
                              const assetStyle = assetAspect
                                ? { aspectRatio: assetAspect.replace('x', '/') }
                                : {};
                              return (
                                <div
                                  key={
                                    getAssetDocumentId(asset) || assetUrl || assetIdx
                                  }
                                  className="mx-auto w-full max-w-[350px] self-start overflow-hidden rounded-lg sm:mx-0"
                                >
                                  <div className="relative w-full" style={assetStyle}>
                                    {isVideoUrl(assetUrl) ? (
                                      <VideoPlayer
                                        src={assetUrl}
                                        className="h-full w-full object-contain"
                                        style={assetStyle}
                                      />
                                    ) : (
                                      <OptimizedImage
                                        pngUrl={assetUrl}
                                        webpUrl={
                                          assetUrl ? assetUrl.replace(/\.png$/, '.webp') : undefined
                                        }
                                        alt={asset.filename || 'Ad'}
                                        cacheKey={assetUrl}
                                        className="h-full w-full object-contain"
                                        style={assetStyle}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-[var(--border-color-default)] sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={statusDotStyles[statusValue] || statusDotStyles.pending}
                            />
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                              <label
                                className="text-sm font-medium text-gray-600 dark:text-gray-300"
                                htmlFor={selectId}
                              >
                                Status
                              </label>
                              <select
                                id={selectId}
                                className="min-w-[160px]"
                                value={statusValue}
                                onChange={handleSelectChange}
                                disabled={submitting}
                              >
                                {statusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {showEditButton && (
                            <button
                              type="button"
                              className="btn-action text-sm font-medium"
                              onClick={() =>
                                setExpandedRequests((prev) => ({
                                  ...prev,
                                  [cardKey]: !prev[cardKey],
                                }))
                              }
                            >
                              {isExpanded ? 'Hide edit request' : 'View edit request'}
                            </button>
                          )}
                        </div>
                        {showEditButton && isExpanded && (
                          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-[var(--border-color-default)] dark:bg-transparent dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-bg)]"
                                onClick={() => {
                                  setManualStatus((prev) => ({
                                    ...prev,
                                    [cardKey]: 'edit',
                                  }));
                                  setPendingResponseContext({
                                    ad,
                                    assets: statusAssets,
                                    index,
                                    key: cardKey,
                                    existingComment,
                                    existingCopy: existingCopyEdit,
                                  });
                                  openEditRequest(ad, index, {
                                    mode: 'note',
                                    initialComment: '',
                                    initialCopy: resolvedExistingCopy,
                                  });
                                }}
                              >
                                <FiPlus className="h-4 w-4" aria-hidden="true" />
                                <span>Add note</span>
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-[var(--border-color-default)] dark:bg-transparent dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-bg)]"
                                onClick={() => {
                                  setManualStatus((prev) => ({
                                    ...prev,
                                    [cardKey]: 'edit',
                                  }));
                                  setPendingResponseContext({
                                    ad,
                                    assets: statusAssets,
                                    index,
                                    key: cardKey,
                                    existingComment,
                                    existingCopy: existingCopyEdit,
                                  });
                                  openEditRequest(ad, index, {
                                    mode: 'copy',
                                    initialComment: '',
                                    initialCopy: resolvedExistingCopy,
                                  });
                                }}
                              >
                                <FiEdit3 className="h-4 w-4" aria-hidden="true" />
                                <span>Edit Copy</span>
                              </button>
                            </div>
                            {hasEditInfo?.comment && (
                              <div className="mb-3">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                  Notes
                                </h4>
                                {noteEntries.map((entry, noteIdx) => (
                                  <div key={noteIdx} className="mb-2 last:mb-0">
                                    <p className="whitespace-pre-wrap leading-relaxed">
                                      {entry.body}
                                    </p>
                                    {entry.meta && (
                                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        {entry.meta}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasEditInfo?.copyEdit && (
                              <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                  Requested Copy
                                </h4>
                                <pre className="whitespace-pre-wrap leading-relaxed">
                                  {hasEditInfo.copyEdit}
                                </pre>
                              </div>
                            )}
                            {!hasEditInfo?.comment && !hasEditInfo?.copyEdit && (
                              <p className="text-sm text-gray-500 dark:text-gray-300">
                                No edit details provided.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
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

      {showEditModal && (
        <EditRequestModal
          mode={editModalMode}
          comment={comment}
          onCommentChange={setComment}
          editCopy={editCopy}
          onEditCopyChange={setEditCopy}
          origCopy={origCopy}
          canSubmit={canSubmitEdit}
          onCancel={() => {
            setShowEditModal(false);
            setEditModalMode('all');
            if (pendingResponseContext?.key) {
              setManualStatus((prev) => {
                const next = { ...prev };
                delete next[pendingResponseContext.key];
                return next;
              });
            }
            setPendingResponseContext(null);
          }}
          onSubmit={() =>
            submitResponse('edit', {
              targetAd: pendingResponseContext?.ad,
              targetAssets: pendingResponseContext?.assets,
              targetIndex: pendingResponseContext?.index ?? currentIndex,
              skipAdvance: reviewVersion === 2,
            })
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
    </div>
  );
});

export default Review;
