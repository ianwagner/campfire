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
import { FiEdit, FiX, FiGrid, FiCheck, FiType } from 'react-icons/fi';
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
import FeedbackPanel from './components/FeedbackPanel.jsx';
import isVideoUrl from './utils/isVideoUrl';
import parseAdFilename from './utils/parseAdFilename';
import diffWords from './utils/diffWords';
import LoadingOverlay from "./LoadingOverlay";
import debugLog from './utils/debugLog';
import useDebugTrace from './utils/useDebugTrace';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';

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
  const [finalGallery, setFinalGallery] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [copyCards, setCopyCards] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [modalCopies, setModalCopies] = useState([]);
  const [timedOut, setTimedOut] = useState(false);
  const [started, setStarted] = useState(false);
  const [summaryCount, setSummaryCount] = useState(null);
  const [animating, setAnimating] = useState(null); // 'approve' | 'reject'
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
  const [groupStatus, setGroupStatus] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  // refs to track latest values for cleanup on unmount
  const currentIndexRef = useRef(currentIndex);
  const reviewLengthRef = useRef(reviewAds.length);
  const { agency } = useAgencyTheme(agencyId);

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
    const unsub = onSnapshot(doc(db, 'adGroups', groupId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setGroupStatus(data.status || 'pending');
    });
    return () => unsub();
  }, [groupId]);

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
  if (!started || !groupId || reviewAds.length === 0) return;

  updateDoc(doc(db, 'adGroups', groupId), {
    status: 'in review',
    reviewProgress: currentIndex,
  })
    .then(() => setGroupStatus('in review'))
    .catch((err) => console.error('Failed to update group status', err));
}, [started, groupId, reviewAds.length, currentIndex]);


useEffect(() => {
  if (!started || !groupId) return;
  updateDoc(doc(db, 'adGroups', groupId), {
    reviewProgress: currentIndex,
  }).catch((err) => console.error('Failed to save progress', err));
}, [currentIndex, started, groupId]);

  const releaseLock = useCallback(() => {
    if (!started || !groupId) return;
    const idx = currentIndexRef.current;
    const len = reviewLengthRef.current;
    const status = idx >= len ? 'reviewed' : 'review pending';
    const progress = idx >= len ? null : idx;
    updateDoc(doc(db, 'adGroups', groupId), {
      status,
      reviewProgress: progress,
    }).catch(() => {});
  }, [groupId, started]);

  useEffect(() => {
    if (!started || !groupId) return;
    if (currentIndex >= reviewAds.length && reviewAds.length > 0) {
      updateDoc(doc(db, 'adGroups', groupId), {
        status: 'reviewed',
        reviewProgress: null,
      }).catch((err) => console.error('Failed to update status', err));
    }
  }, [currentIndex, reviewAds.length, groupId, started]);

  useEffect(() => {
    if (currentIndex >= reviewAds.length && reviewAds.length > 0) {
      const approvedCount = Object.values(responses).filter(
        (r) => r.response === 'approve'
      ).length;
      setSummaryCount(approvedCount);
      setStarted(false);
    }
  }, [currentIndex, reviewAds.length, responses]);

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
        if (groupId) {
            const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
            if (groupSnap.exists()) {
              const data = groupSnap.data();
              status = data.status || 'pending';
              if (typeof data.reviewProgress === 'number') {
                startIndex = data.reviewProgress;
              }
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', groupId, 'assets')
            );
            list = assetsSnap.docs
              .map((assetDoc) => ({
                ...assetDoc.data(),
                assetId: assetDoc.id,
                adGroupId: groupId,
                groupName: groupSnap.data().name,
                firebaseUrl: assetDoc.data().firebaseUrl,
                ...(groupSnap.data().brandCode
                  ? { brandCode: groupSnap.data().brandCode }
                  : {}),
              }));
          }
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
              return {
                ...data,
                assetId: d.id,
                adGroupId,
                groupName: groupCache[adGroupId],
                firebaseUrl: data.firebaseUrl,
              };
            })
          );
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

        // keep highest version per ad for the review list
        const versionMap = {};
        list.forEach((a) => {
          const root = a.parentAdId || a.assetId;
          if (!versionMap[root] || (versionMap[root].version || 1) < (a.version || 1)) {
            versionMap[root] = a;
          }
        });
        const deduped = Object.values(versionMap);

        const hasPendingAds = deduped.some((a) => a.status === 'pending');
        const nonPending = deduped.filter((a) => a.status !== 'pending');

        // store all non-pending ads (including archived versions) so the
        // version modal can show previous revisions
        const fullNonPending = list.filter((a) => a.status !== 'pending');
        setAllAds(fullNonPending);

        setAds(nonPending);
        setHasPending(hasPendingAds);

        const readyAds = nonPending.filter((a) => a.status === 'ready');
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

        // build hero list from all ready ads so hero assets always appear
        const prefOrder = ['', '9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
        const getRecipe = (a) =>
          a.recipeCode || parseAdFilename(a.filename || '').recipeCode || 'unknown';
        const getAspect = (a) =>
          a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';

        const map = {};
        list.forEach((a) => {
          const r = getRecipe(a);
          if (!map[r]) map[r] = [];
          map[r].push(a);
        });
        const heroList = Object.values(map).map((list) => {
          for (const asp of prefOrder) {
            const found = list.find((x) => getAspect(x) === asp);
            if (found) return found;
          }
          return list[0];
        });
        heroList.sort((a, b) => {
          const rA = getRecipe(a);
          const rB = getRecipe(b);
          return rA.localeCompare(rB);
        });
        setReviewAds(heroList);
        setCurrentIndex(
          status === 'reviewed'
            ? heroList.length
            : startIndex < heroList.length
            ? startIndex
            : 0
        );
        setPendingOnly(
          heroList.length === 0 && nonPending.length === 0 && hasPendingAds
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
  const adUrl =
    currentAd && typeof currentAd === 'object'
      ? currentAd.adUrl || currentAd.firebaseUrl
      : currentAd;
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
  const showSecondView = !!selectedResponse;
  // show next step as soon as a decision is made
  const progress =
    reviewAds.length > 0
      ? ((currentIndex + (animating ? 1 : 0)) / reviewAds.length) * 100
      : 0;


  const openVersionModal = () => {
    if (!currentAd || !currentAd.parentAdId) return;
    const prev = allAds.find((a) => a.assetId === currentAd.parentAdId);
    if (!prev) return;
    setVersionModal({ current: currentAd, previous: prev });
    setVersionView('current');
  };

  const closeVersionModal = () => setVersionModal(null);

  useEffect(() => {
    if (!currentAd?.adGroupId || !currentAd?.assetId) return;
    const assetRef = doc(db, 'adGroups', currentAd.adGroupId, 'assets', currentAd.assetId);
    const unsubDoc = onSnapshot(assetRef, (snap) => {
      if (!snap.exists()) return;
      const data = { assetId: snap.id, ...snap.data() };
      setAds((prev) => prev.map((a) => (a.assetId === data.assetId ? { ...a, ...data } : a)));
      setReviewAds((prev) => prev.map((a) => (a.assetId === data.assetId ? { ...a, ...data } : a)));
    });
    const q = query(collection(assetRef, 'history'), orderBy('updatedAt', 'asc'));
    const unsubHist = onSnapshot(q, (snap) => {
      setHistoryEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubDoc();
      unsubHist();
    };
  }, [currentAd?.adGroupId, currentAd?.assetId]);

  const handleTouchStart = (e) => {
    // allow swiping even while submitting a previous response
    if (showSizes || showEditModal || showNoteInput || showStreakModal)
      return;
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
  const statusMap = {
    approve: 'Approved',
    reject: 'Rejected',
    edit: 'Edit Requested',
  };
  const colorMap = {
    approve: 'text-green-700',
    reject: 'text-gray-700',
    edit: 'text-black',
  };

  const currentInfo = currentAd ? parseAdFilename(currentAd.filename || '') : {};
  const currentRecipe = currentAd?.recipeCode || currentInfo.recipeCode;
  const currentRecipeGroup = recipeGroups.find(
    (g) => g.recipeCode === currentRecipe
  );
  const otherSizes = currentRecipeGroup
    ? currentRecipeGroup.assets.filter(
        (a) => (a.adUrl || a.firebaseUrl) !== adUrl
      )
    : [];

  const currentAspect = (
    currentAd?.aspectRatio ||
    currentInfo.aspectRatio ||
    '9x16'
  ).replace('x', '/');

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

  const openEditRequest = async () => {
    setShowEditModal(true);
    if (!currentAd?.adGroupId) return;
    const recipeId = currentRecipe;
    if (!recipeId) return;
    try {
      const snap = await getDoc(
        doc(db, 'adGroups', currentAd.adGroupId, 'recipes', recipeId)
      );
      const text = snap.exists() ? snap.data().copy || '' : '';
      setEditCopy(text);
      setOrigCopy(text);
      setReviewAds((prev) =>
        prev.map((a, idx) =>
          idx === currentIndex ? { ...a, originalCopy: text } : a
        )
      );
      setAds((prev) =>
        prev.map((a) =>
          a.assetId === currentAd.assetId ? { ...a, originalCopy: text } : a
        )
      );
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

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    advancedRef.current = false;
    setAnimating(responseType);
    setSubmitting(true);

    const recipeAssets = currentRecipeGroup?.assets || [currentAd];
    const updates = [];
    const newStatus =
      responseType === 'approve'
        ? 'approved'
        : responseType === 'reject'
        ? 'rejected'
        : 'edit_requested';

    try {
      for (const asset of recipeAssets) {
        const url = asset.adUrl || asset.firebaseUrl;
        const respObj = {
          adUrl: url,
          response: responseType,
          comment: responseType === 'edit' ? comment : '',
          copyEdit: responseType === 'edit' ? editCopy : '',
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
        if (asset.assetId && asset.adGroupId) {
          const assetRef = doc(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId);
          const updateData = {
            status: newStatus,
            comment: responseType === 'edit' ? comment : '',
            copyEdit: responseType === 'edit' ? editCopy : '',
            lastUpdatedBy: user.uid,
            lastUpdatedAt: serverTimestamp(),
            ...(responseType === 'approve' ? { isResolved: true } : {}),
            ...(responseType === 'edit' ? { isResolved: false } : {}),
          };
          updates.push(updateDoc(assetRef, updateData));

          const name = reviewerName || user.displayName || user.uid || 'unknown';
          updates.push(
            addDoc(
              collection(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId, 'history'),
              {
                status: newStatus,
                updatedBy: name,
                updatedAt: serverTimestamp(),
                ...(responseType === 'edit' && comment ? { comment } : {}),
                ...(responseType === 'edit' && editCopy ? { copyEdit: editCopy } : {}),
              },
            ).catch((err) => {
              if (err?.code === 'already-exists') {
                console.log('History entry already exists, skipping');
              } else {
                throw err;
              }
            }),
          );

          setAds((prev) =>
            prev.map((a) =>
              a.assetId === asset.assetId
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? comment : '',
                    copyEdit: responseType === 'edit' ? editCopy : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : responseType === 'edit'
                      ? { isResolved: false }
                      : {}),
                  }
                : a
            )
          );
          setReviewAds((prev) =>
            prev.map((a) =>
              a.assetId === asset.assetId
                ? {
                    ...a,
                    status: newStatus,
                    comment: responseType === 'edit' ? comment : '',
                    copyEdit: responseType === 'edit' ? editCopy : '',
                    ...(responseType === 'approve'
                      ? { isResolved: true }
                      : responseType === 'edit'
                      ? { isResolved: false }
                      : {}),
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
          const updateObj = {
            ...(incReviewed ? { reviewedCount: increment(incReviewed) } : {}),
            ...(incApproved ? { approvedCount: increment(incApproved) } : {}),
            ...(incRejected ? { rejectedCount: increment(incRejected) } : {}),
            ...(incEdit ? { editCount: increment(incEdit) } : {}),
            lastUpdated: serverTimestamp(),
            ...(gSnap.exists() && !gSnap.data().thumbnailUrl ? { thumbnailUrl: asset.firebaseUrl } : {}),
          };
          // avoid changing the overall ad group status mid-review
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
        setResponses((prev) => ({ ...prev, [url]: respObj }));
      }

      if (recipeAssets.length > 0) {
        const recipeRef = doc(db, 'recipes', currentRecipe);
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
                ...(responseType === 'edit' && comment ? { editComment: comment } : {}),
              }),
            },
            { merge: true }
          )
        );
      }

      await Promise.all(updates);
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
      setSubmitting(false);

      if (!advancedRef.current) {
        setCurrentIndex((i) => {
          const next = i + 1;
          console.log('Index updated:', next);
          return next;
        });
        advancedRef.current = true;
      }
      setAnimating(null);
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

  if (loading || !logoReady || (started && !firstAdLoaded)) {
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
        {summaryCount === null ? (
          <h1 className="text-2xl font-bold">Your ads are ready!</h1>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Thank you for your feedback!</h1>
            <h2 className="text-xl">
              You've approved{' '}
              <span style={{ color: 'var(--approved-color)' }}>{summaryCount}</span>{' '}
              ads.
            </h2>
          </>
        )}
        <div className="flex flex-col items-center space-y-3">
          <button
            onClick={() => {
              setTimedOut(false);
              setShowGallery(false);
              setShowCopyModal(false);
              setSummaryCount(null);
              setCurrentIndex(0);
              setStarted(true);
            }}
            className="btn-primary px-6 py-3 text-lg"
          >
            <FiCheck className="mr-2" /> Review Ads
          </button>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowGallery(true)}
              className="btn-secondary"
            >
              <FiGrid className="mr-1" /> Ad Gallery
            </button>
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
            <div className="bg-white p-4 rounded shadow max-w-[50rem] w-full max-h-[90vh] flex flex-col dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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

  if (!ads || ads.length === 0) {
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
          <div className="bg-white p-4 rounded shadow max-w-sm space-y-4 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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
        <div className="relative w-full max-w-md mb-2.5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              releaseLock();
              setStarted(false);
            }}
            aria-label="Exit Review"
            className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black dark:hover:text-white"
          >
            <FiX />
          </button>
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
        </div>
        {currentRecipeGroup && currentRecipeGroup.assets.length > 1 && (
          <button
            onClick={() => setShowSizes((p) => !p)}
            className="text-xs text-gray-500 mb-2 px-2 py-0.5 rounded-full transition-colors hover:bg-gray-200"
          >
            {currentRecipeGroup.assets.length} sizes
          </button>
        )}
        <div className="flex justify-center relative">
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
      webpUrl={adUrl.replace(/\.png$/, '.webp')}
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
</div>
            {currentAd && (currentAd.version || 1) > 1 && (
              <span onClick={openVersionModal} className="version-badge cursor-pointer">V{currentAd.version || 1}</span>
            )}
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
                    webpUrl={a.firebaseUrl.replace(/\.png$/, '.webp')}
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
        </div>
      </div>

      {!showSizes && (showSecondView ? (
        <div className="flex items-center space-x-4">
          {currentIndex > 0 && (
            <button
              aria-label="Previous"
              onClick={() =>
                setCurrentIndex((i) => Math.max(0, i - 1))
              }
              className="btn-arrow"
            >
              &lt;
            </button>
          )}
          <div className="text-center space-y-2">
            <span
              className={`status-badge text-lg status-${
                selectedResponse === 'edit'
                  ? 'edit_requested'
                  : selectedResponse === 'reject'
                  ? 'rejected'
                  : 'approved'
              }`}
            >
              {statusMap[selectedResponse]}
            </span>
            {selectedResponse === 'edit' && currentAd.comment && (
              <p className="text-sm">{currentAd.comment}</p>
            )}
            {selectedResponse === 'edit' &&
              currentAd.copyEdit &&
              currentAd.originalCopy &&
              currentAd.copyEdit !== currentAd.originalCopy && (
                <p className="text-sm">
                  copy edit:{' '}
                  {diffWords(
                    currentAd.originalCopy,
                    currentAd.copyEdit,
                  ).map((part, idx, arr) => {
                    const space = idx < arr.length - 1 ? ' ' : '';
                    if (part.type === 'same') return part.text + space;
                    if (part.type === 'removed')
                      return (
                        <span key={idx} className="text-red-600 line-through">
                          {part.text}
                          {space}
                        </span>
                      );
                    return (
                      <span key={idx} className="text-green-600 italic">
                        {part.text}
                        {space}
                      </span>
                    );
                  })}
                </p>
              )}
            <div className="flex space-x-4 pt-2">
              <button
                onClick={() => submitResponse('reject')}
                className={`btn-reject ${selectedResponse && selectedResponse !== 'reject' ? 'opacity-50' : ''}`}
                disabled={submitting}
              >
                Reject
              </button>
              <button
                onClick={openEditRequest}
                className={`btn-edit ${selectedResponse && selectedResponse !== 'edit' ? 'opacity-50' : ''}`}
                disabled={submitting}
                aria-label="Request Edit"
              >
                <FiEdit />
              </button>
              <button
                onClick={() => submitResponse('approve')}
                className={`btn-approve ${selectedResponse && selectedResponse !== 'approve' ? 'opacity-50' : ''}`}
                disabled={submitting}
              >
                Approve
              </button>
            </div>
          </div>
          {currentIndex < reviewAds.length - 1 && (
            <button
              aria-label="Next"
              onClick={() =>
                setCurrentIndex((i) => Math.min(reviewAds.length - 1, i + 1))
              }
              className="btn-arrow"
            >
              &gt;
            </button>
          )}
        </div>
      ) : (
        <div className="flex space-x-4">
          <button
            onClick={() => submitResponse('reject')}
            className={`btn-reject ${selectedResponse && selectedResponse !== 'reject' ? 'opacity-50' : ''}`}
            disabled={submitting}
          >
            Reject
          </button>
          <button
            onClick={openEditRequest}
            className={`btn-edit ${selectedResponse && selectedResponse !== 'edit' ? 'opacity-50' : ''}`}
            disabled={submitting}
            aria-label="Request Edit"
          >
            <FiEdit />
          </button>
          <button
            onClick={() => submitResponse('approve')}
            className={`btn-approve ${selectedResponse && selectedResponse !== 'approve' ? 'opacity-50' : ''}`}
            disabled={submitting}
          >
            Approve
          </button>
        </div>
      ))}
      {showEditModal && (
        <EditRequestModal
          comment={comment}
          onCommentChange={setComment}
          editCopy={editCopy}
          onEditCopyChange={setEditCopy}
          origCopy={origCopy}
          canSubmit={canSubmitEdit}
          onCancel={() => setShowEditModal(false)}
          onSubmit={() => submitResponse('edit')}
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
          <div className="bg-white p-4 rounded shadow max-w-[50rem] w-full overflow-auto max-h-[90vh] flex flex-col dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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
      </div>
      <FeedbackPanel
        entries={historyEntries}
        className="mt-4 md:mt-0 w-full md:w-60 max-h-[70vh] overflow-y-auto"
      />
    </div>
    </div>
  );
});

export default Review;
