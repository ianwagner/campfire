// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FiEdit, FiX } from 'react-icons/fi';
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
} from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencyTheme from './useAgencyTheme';
import { DEFAULT_LOGO_URL } from './constants';
import OptimizedImage from './components/OptimizedImage.jsx';
import ReviewAd from './components/ReviewAd.jsx';
import parseAdFilename from './utils/parseAdFilename';
import computeGroupStatus from './utils/computeGroupStatus';
import recordRecipeStatus from './utils/recordRecipeStatus';

const Review = ({
  user,
  userRole = null,
  brandCodes = [],
  groupId = null,
  reviewerName = '',
  agencyId = null,
}) => {
  const [ads, setAds] = useState([]); // full list of ads
  const [reviewAds, setReviewAds] = useState([]); // ads being reviewed in the current pass
  // start offscreen until ads load
  const [currentIndex, setCurrentIndex] = useState(-1);
  // track last data fetch to avoid duplicate loads
  const lastFetchKeyRef = useRef(null);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [clientNote, setClientNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [askContinue, setAskContinue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState({}); // map of adUrl -> response object
  const [editing, setEditing] = useState(false);
  const [allAds, setAllAds] = useState([]); // includes all non-pending versions
  const [versionModal, setVersionModal] = useState(null); // {current, previous}
  const [versionView, setVersionView] = useState('current');
  const [finalGallery, setFinalGallery] = useState(false);
  const [secondPass, setSecondPass] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [animating, setAnimating] = useState(null); // 'approve' | 'reject'
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const [groupStatus, setGroupStatus] = useState(null);
  const { agency } = useAgencyTheme(agencyId);
  const navigate = useNavigate();
  const [hasPending, setHasPending] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  const brandKey = useMemo(
    () => brandCodes.slice().sort().join(','),
    [brandCodes]
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const order = { '9x16': 0, '3x5': 1, '1x1': 2 };
    return Object.entries(map).map(([recipeCode, list]) => {
      list.sort((a, b) => (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99));
      return { recipeCode, assets: list };
    });
  }, [ads]);

  useEffect(() => {
    setEditing(false);
  }, [currentIndex]);

  // initialize once ads are ready
  useEffect(() => {
    if (currentIndex === -1 && reviewAds.length > 0) {
      const first = reviewAds[0];
      if (first && (first.adUrl || first.firebaseUrl)) {
        setCurrentIndex(0);
      }
    }
  }, [reviewAds, currentIndex]);

  useEffect(() => {
    setShowSizes(false);
  }, [currentIndex]);

useEffect(() => {
  if (animating) setAnimating(null);
}, [currentIndex]);



  useEffect(() => {
    const fetchAds = async () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Fetching ads...');
      }
      try {
        let list = [];
        if (groupId) {
          const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
          if (groupSnap.exists()) {
            setGroupStatus(groupSnap.data().status || 'pending');
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

        const order = { '9x16': 0, '3x5': 1, '1x1': 2 };
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
        list = readyAds;

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

        // prefer 9x16 or 3x5 for hero selection
        const prefOrder = ['9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
        const getRecipe = (a) =>
          a.recipeCode || parseAdFilename(a.filename || '').recipeCode || 'unknown';
        const getAspect = (a) =>
          a.aspectRatio || parseAdFilename(a.filename || '').aspectRatio || '';

        const map = {};
        filtered.forEach((a) => {
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
        heroList.slice(0, 3).forEach((ad) => {
          const url = ad.adUrl || ad.firebaseUrl;
          if (url) new Image().src = url;
        });
        setPendingOnly(
          heroList.length === 0 && nonPending.length === 0 && hasPendingAds
        );
        setSecondPass(heroList.length === 0 && nonPending.length > 0);
        if (process.env.NODE_ENV !== 'production') {
          console.log('Finished fetching', heroList.length, 'ads');
        }
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
      lastFetchKeyRef.current = null;
      return;
    }

    const key = groupId || brandKey;
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;
    setLoading(true);
    fetchAds();
  }, [user?.uid, groupId, brandKey]);

  const currentAd = currentIndex >= 0 ? reviewAds[currentIndex] : null;
  const adUrl =
    currentAd && typeof currentAd === 'object'
      ? currentAd.adUrl || currentAd.firebaseUrl
      : currentAd;
  const brandCode =
    currentAd && typeof currentAd === 'object' ? currentAd.brandCode : undefined;
  const groupName =
    currentAd && typeof currentAd === 'object' ? currentAd.groupName : undefined;
  const selectedResponse = responses[adUrl]?.response;
  const showSecondView = secondPass && selectedResponse && !editing;
  // show next step as soon as a decision is made
  const progress =
    reviewAds.length > 0 && currentIndex >= 0
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

  const handleTouchStart = (e) => {
    // allow swiping even while submitting a previous response
    if (showSizes || editing || showComment || showNoteInput || showStreakModal)
      return;
    const touch = e.touches[0];
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
        toUpdate.push(
          updateDoc(doc(db, 'adGroups', asset.adGroupId, 'assets', asset.assetId), {
            status: 'pending',
            isResolved: false,
          })
        );
        const infoA = parseAdFilename(asset.filename || '');
        const rCode = asset.recipeCode || infoA.recipeCode || 'unknown';
        toUpdate.push(recordRecipeStatus(asset.adGroupId, rCode, 'pending', user.uid));
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

  // Preload up to 5 upcoming ads to keep swipes smooth
  useEffect(() => {
    for (let i = 1; i <= 5; i += 1) {
      const next = reviewAds[currentIndex + i];
      if (!next) break;
      const img = new Image();
      img.src = next.adUrl || next.firebaseUrl;
    }
  }, [currentIndex, reviewAds, isMobile]);

  const submitResponse = async (responseType) => {
    if (!currentAd) return;
    setAnimating(responseType);
    setSubmitting(true);

    const recipeAssets = currentRecipeGroup?.assets || [currentAd];
    const updates = [];
    for (const asset of recipeAssets) {
      const url = asset.adUrl || asset.firebaseUrl;
      const respObj = {
        adUrl: url,
        response: responseType,
        comment: responseType === 'edit' ? comment : '',
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
        const newStatus =
          responseType === 'approve'
            ? 'approved'
            : responseType === 'reject'
            ? 'rejected'
            : 'edit_requested';

        const updateData = {
          status: newStatus,
          comment: responseType === 'edit' ? comment : '',
          lastUpdatedBy: user.uid,
          lastUpdatedAt: serverTimestamp(),
          ...(responseType === 'approve' ? { isResolved: true } : {}),
          ...(responseType === 'edit' ? { isResolved: false } : {}),
        };

        const info = parseAdFilename(asset.filename || '');
        const recipeCode = asset.recipeCode || info.recipeCode || 'unknown';
        updates.push(
          recordRecipeStatus(asset.adGroupId, recipeCode, newStatus, user.uid)
        );

        updates.push(updateDoc(assetRef, updateData));

        setAds((prev) =>
          prev.map((a) =>
            a.assetId === asset.assetId
              ? {
                  ...a,
                  status: newStatus,
                  comment: responseType === 'edit' ? comment : '',
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
          ...(gSnap.exists() && !gSnap.data().thumbnailUrl
            ? { thumbnailUrl: asset.firebaseUrl }
            : {}),
        };
        const newGroupStatus = computeGroupStatus(
          ads.map((a) =>
            a.assetId === asset.assetId ? { ...a, status: newStatus } : a
          ),
          gSnap.exists() ? gSnap.data().status : 'pending'
        );
        if (newGroupStatus !== gSnap.data().status) {
          updateObj.status = newGroupStatus;
          setGroupStatus(newGroupStatus);
        }
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
            updateDoc(
              doc(db, 'adGroups', asset.adGroupId, 'assets', asset.parentAdId),
              { isResolved: true }
            )
          );
        }
      }
      setResponses((prev) => ({ ...prev, [url]: respObj }));
    }

    const updatePromise = Promise.all(updates)
      .then(() => {
        if (groupId) {
          localStorage.setItem(
            `lastViewed-${groupId}`,
            new Date().toISOString()
          );
        }
      })
      .catch((err) => {
        console.error('Failed to submit response', err);
      });

    setComment('');
    setShowComment(false);
    setTimeout(() => {
      setCurrentIndex((i) => i + 1);
      if (responseType === 'reject') {
        const newCount = rejectionCount + 1;
        setRejectionCount(newCount);
        if (newCount === 5) {
          setShowStreakModal(true);
        }
      }
    }, 400);
    // free UI interactions while waiting for Firestore updates
    setSubmitting(false);
    setEditing(false);

    await updatePromise;
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

  if (!ads.length || !ads[0]) {
    return loading ? <div className="text-center mt-10">Loading...</div> : null;
  }

  if (groupStatus === 'locked') {
    return <div className="text-center mt-10">This ad group is locked.</div>;
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
              className="mb-2 max-h-16 w-auto"
            />
          )}
        <h1 className="text-2xl font-bold">Ads Pending Review</h1>
        <p className="text-lg">We'll notify you when your ads are ready.</p>
      </div>
    );
  }

  if (currentIndex >= reviewAds.length) {
    if (groupId) {
      localStorage.setItem(
        `lastViewed-${groupId}`,
        new Date().toISOString()
      );
    }
    const allResponses = Object.values(responses);
    const approvedCount = allResponses.filter((r) => r.response === 'approve').length;
    const approvedAds = ads.filter((a) => {
      const url = a.adUrl || a.firebaseUrl;
      return responses[url]?.response === 'approve';
    });
    const approvedMap = {};
    const order = { '9x16': 0, '3x5': 1, '1x1': 2 };
    approvedAds.forEach((a) => {
      const info = parseAdFilename(a.filename || '');
      const recipe = a.recipeCode || info.recipeCode || 'unknown';
      const aspect = a.aspectRatio || info.aspectRatio || '';
      const item = { ...a, recipeCode: recipe, aspectRatio: aspect };
      if (!approvedMap[recipe]) approvedMap[recipe] = [];
      approvedMap[recipe].push(item);
    });
    const approvedGroups = Object.entries(approvedMap).map(([recipeCode, list]) => {
      list.sort((a, b) => (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99));
      return { recipeCode, assets: list };
    });
    const heroGroups = approvedGroups.map((g) => {
      const hero =
        g.assets.find((a) => a.aspectRatio === '9x16') ||
        g.assets.find((a) => a.aspectRatio === '3x5') ||
        g.assets[0];
      return { recipeCode: g.recipeCode, hero, assets: g.assets };
    });

    const handleReviewAll = () => {
      const heroMap = {};
      ads.forEach((a) => {
        const info = parseAdFilename(a.filename || '');
        const recipe = a.recipeCode || info.recipeCode || 'unknown';
        if (!heroMap[recipe]) heroMap[recipe] = [];
        heroMap[recipe].push(a);
      });
      const prefOrder = ['9x16', '3x5', '1x1', '4x5', 'Pinterest', 'Snapchat'];
      const heroList = Object.values(heroMap).map((list) => {
        for (const asp of prefOrder) {
          const f = list.find((x) =>
            (x.aspectRatio || parseAdFilename(x.filename || '').aspectRatio || '') === asp
          );
          if (f) return f;
        }
        return list[0];
      });
      heroList.sort((a, b) => {
        const rA = a.recipeCode || parseAdFilename(a.filename || '').recipeCode || '';
        const rB = b.recipeCode || parseAdFilename(b.filename || '').recipeCode || '';
        return rA.localeCompare(rB);
      });
      setReviewAds(heroList);
      setCurrentIndex(0);
      setSecondPass(true);
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 text-center">
          {agencyId && (
            <OptimizedImage
              pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
              alt={`${agency.name || 'Agency'} logo`}
              loading="eager"
              cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
              className="mb-2 max-h-16 w-auto"
            />
          )}
        <h1 className="text-2xl font-bold">Thank you for your feedback!</h1>
        <h2 className="text-xl">
          You've approved{' '}
          <span style={{ color: 'var(--approved-color)' }}>{approvedCount}</span>{' '}
          ads.
        </h2>
        <div className="flex flex-wrap justify-center gap-2 w-full max-w-6xl mx-auto">
          {(finalGallery ? heroGroups : heroGroups.slice(0, 3)).map((g) => {
            const showSet = finalGallery ? g.assets : [g.hero];
            return showSet.map((a) => (
              <OptimizedImage
                key={a.assetId || a.firebaseUrl}
                pngUrl={a.firebaseUrl}
                webpUrl={a.firebaseUrl.replace(/\.png$/, '.webp')}
                alt={a.filename}
                className="w-24 h-24 object-contain"
              />
            ));
          })}
        </div>
        {/* table and rejected button removed */}
        <button
          onClick={handleReviewAll}
          className="btn-secondary"
        >
          Change Feedback
        </button>
        <button
          onClick={() => setFinalGallery((p) => !p)}
          className="btn-secondary"
        >
          {finalGallery ? 'Close Gallery' : 'View Gallery'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
      {showStreakModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-sm space-y-4 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
            {!showNoteInput && !askContinue && (
              <>
                <p className="mb-4 text-center text-lg font-medium">You’ve rejected 5 ads so far. Leave a note so we can regroup?</p>
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => setShowNoteInput(true)}
                    className="btn-primary px-3 py-1"
                  >
                    Leave Note
                  </button>
                  <button
                    onClick={() => {
                      setShowStreakModal(false);
                      setShowNoteInput(false);
                      setAskContinue(false);
                    }}
                    className="btn-secondary px-3 py-1 text-white"
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
                    className="btn-primary px-3 py-1"
                  >
                    Submit Note
                  </button>
                  <button
                    onClick={() => {
                      setShowNoteInput(false);
                      setClientNote('');
                    }}
                    className="btn-secondary px-3 py-1 text-white"
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
                    className="btn-primary px-3 py-1"
                  >
                    Yes
                  </button>
                  <button onClick={handleStopReview} className="btn-secondary px-3 py-1 text-white">
                    No
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
        <div className="relative flex flex-col items-center w-fit mx-auto">
          {agencyId && (
            <OptimizedImage
              pngUrl={agency.logoUrl || DEFAULT_LOGO_URL}
              alt={`${agency.name || 'Agency'} logo`}
              loading="eager"
              cacheKey={agency.logoUrl || DEFAULT_LOGO_URL}
              className="mb-2 max-h-16 w-auto"
            />
          )}
        {/* Gallery view removed */}
        {!secondPass && (
          <div className="relative w-full max-w-md mb-2.5 flex justify-center">
            <button
              type="button"
              onClick={() => navigate(-1)}
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
        )}
        {currentRecipeGroup && currentRecipeGroup.assets.length > 1 && (
          <button
            onClick={() => setShowSizes((p) => !p)}
            className="text-xs text-gray-500 mb-2 px-2 py-0.5 rounded-full transition-colors hover:bg-gray-200"
          >
            {currentRecipeGroup.assets.length} sizes
          </button>
        )}
        <div className="flex justify-center relative">
          {currentAd && (
          <div
            key={currentAd.assetId || adUrl}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`relative z-10 ${
              isMobile && showSizes
                ? 'flex flex-col items-center overflow-y-auto h-[72vh]'
                : 'size-container'
            } ${animating === 'approve' ? 'approve-slide' : ''} ${
              animating === 'reject' ? 'reject-slide' : ''
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
            {adUrl && (
              <ReviewAd
                key={adUrl}
                pngUrl={adUrl}
                webpUrl={adUrl.replace(/\.png$/, '.webp')}
                alt="Ad"
                loading="eager"
              style={
                isMobile && showSizes
                  ? { maxHeight: `${72 / (otherSizes.length + 1)}vh` }
                  : {}
              }
              className={`relative max-w-[90%] mx-auto rounded shadow ${
                isMobile && showSizes ? 'mb-2' : 'max-h-[72vh]'
              }`}
              />
            )}
            {currentAd && (currentAd.version || 1) > 1 && (
              <span onClick={openVersionModal} className="version-badge cursor-pointer">V{currentAd.version || 1}</span>
            )}
            {otherSizes.map((a) => (
              <OptimizedImage
                key={a.assetId || a.firebaseUrl}
                pngUrl={a.firebaseUrl}
                webpUrl={a.firebaseUrl.replace(/\.png$/, '.webp')}
                alt={a.filename}
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
            ))}
          </div>
          )}
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
            <button
              onClick={() => setEditing(true)}
              className="btn-secondary"
            >
              Change
            </button>
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
        <>
          <div className="flex space-x-4">
            <button
              onClick={() => submitResponse('reject')}
              className={`btn-reject ${selectedResponse && selectedResponse !== 'reject' ? 'opacity-50' : ''}`}
              disabled={submitting}
            >
              Reject
            </button>
            <button
              onClick={() => setShowComment(true)}
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
          {showComment && (
            <div className="flex flex-col items-center space-y-2 w-full max-w-sm">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Add comments..."
                rows={3}
              />
              <button
                onClick={() => submitResponse('edit')}
                className="btn-primary"
                disabled={submitting}
              >
                Submit
              </button>
            </div>
          )}
        </>
      ))}
      {versionModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-4 rounded shadow max-w-md text-center">
            <div className="mb-2 space-x-2">
              <button onClick={() => setVersionView('current')} className="btn-secondary px-2 py-1">
                V{versionModal.current.version || 1}
              </button>
              <button onClick={() => setVersionView('previous')} className="btn-secondary px-2 py-1">
                V{versionModal.previous.version || 1} (replaced)
              </button>
            </div>
            <OptimizedImage
              pngUrl={versionView === 'previous' ? versionModal.previous.firebaseUrl : versionModal.current.firebaseUrl}
              webpUrl={(versionView === 'previous' ? versionModal.previous.firebaseUrl : versionModal.current.firebaseUrl).replace(/\.png$/, '.webp')}
              alt="Ad version"
              className="max-w-full max-h-[70vh] mx-auto"
            />
            <button onClick={closeVersionModal} className="mt-2 btn-primary px-3 py-1">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Review;
