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
  FiGrid,
  FiCheck,
  FiType,
  FiMessageSquare,
  FiPlus,
  FiEdit3,
  FiCheckCircle,
  FiHome,
  FiDownload,
  FiMoreHorizontal,
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
  writeBatch,
  onSnapshot,
  orderBy,
  deleteField,
  documentId,
} from 'firebase/firestore';
import { db } from './firebase/config';
import useAgencyTheme from './useAgencyTheme';
import { DEFAULT_LOGO_URL } from './constants';
import OptimizedImage from './components/OptimizedImage.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import GalleryModal from './components/GalleryModal.jsx';
import Modal from './components/Modal.jsx';
import VersionModal from './components/VersionModal.jsx';
import EditRequestModal from './components/EditRequestModal.jsx';
import CopyRecipePreview from './CopyRecipePreview.jsx';
import { getCopyLetter } from './utils/copyLetter';
import sortCopyCards from './utils/sortCopyCards';
import RecipePreview from './RecipePreview.jsx';
import HelpdeskModal from './components/HelpdeskModal.jsx';
import InfoTooltip from './components/InfoTooltip.jsx';
import isVideoUrl from './utils/isVideoUrl';
import parseAdFilename from './utils/parseAdFilename';
import diffWords from './utils/diffWords';
import LoadingOverlay from "./LoadingOverlay";
import OverflowMenu from './components/OverflowMenu.jsx';
import NotificationDot from './components/NotificationDot.jsx';
import Button from './components/Button.jsx';
import debugLog from './utils/debugLog';
import useDebugTrace from './utils/useDebugTrace';
import { DEFAULT_ACCENT_COLOR } from './themeColors';
import { applyAccentColor } from './utils/theme';
import useSiteSettings from './useSiteSettings';
import { deductCredits } from './utils/credits';
import getVersion from './utils/getVersion';
import stripVersion from './utils/stripVersion';
import { isRealtimeReviewerEligible } from './utils/realtimeEligibility';
import notifySlackStatusChange from './utils/notifySlackStatusChange';
import { toDateSafe, countUnreadHelpdeskTickets } from './utils/helpdesk';
import {
  REPLACEMENT_BADGE_CLASS,
  REPLACEMENT_META_TEXT_CLASS,
  REPLACEMENT_NOTE_CLASS,
  REPLACEMENT_TEXTAREA_CLASS,
} from './utils/replacementStyles';

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
};

const normalizeReviewAssetData = (raw, overrides = {}) => {
  const combined = { ...raw, ...overrides };
  const info = parseAdFilename(combined.filename || '');

  const status = normalizeKeyPart(combined.status).toLowerCase() || 'pending';
  const recipeCode =
    normalizeKeyPart(combined.recipeCode) || normalizeKeyPart(info.recipeCode);
  const recipeProductCode =
    normalizeKeyPart(combined.recipeProductCode) ||
    normalizeKeyPart(combined.productCode);
  const adUrl = normalizeKeyPart(combined.adUrl);
  const firebaseUrl = normalizeKeyPart(combined.firebaseUrl);

  return {
    ...combined,
    status,
    recipeCode,
    recipeProductCode,
    adUrl,
    firebaseUrl,
    version: combined.version ?? info.version ?? 1,
  };
};

const combineClasses = (...classes) => classes.filter(Boolean).join(' ');

const normalizeProductKey = (value) => {
  const normalized = normalizeKeyPart(value).toLowerCase();
  if (!normalized) {
    return '';
  }
  const withoutLeadingZeros = normalized.replace(/^0+/, '');
  if (withoutLeadingZeros) {
    return withoutLeadingZeros;
  }
  // Preserve a single zero so numeric recipe codes like "0" still resolve.
  return normalized.includes('0') ? '0' : normalized;
};

const resolveRecipeProductName = (recipe) => {
  if (!recipe || typeof recipe !== 'object') return '';
  const candidates = [
    recipe.product?.name,
    recipe.product,
    recipe.components?.['product.name'],
    recipe.components?.product?.name,
    recipe.metadata?.product?.name,
    recipe.metadata?.productName,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeKeyPart(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '';
};

const extractCopyCardProductValue = (value) => {
  if (!value) return '';
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = extractCopyCardProductValue(entry);
      if (normalized) return normalized;
    }
    return '';
  }
  if (typeof value === 'object') {
    const nestedCandidates = [
      value.name,
      value.title,
      value.label,
      value.value,
      value.productName,
    ];
    for (const nested of nestedCandidates) {
      const normalized = normalizeKeyPart(nested);
      if (normalized) return normalized;
    }
    return '';
  }
  return normalizeKeyPart(value);
};

const resolveCopyCardProductName = (card) => {
  if (!card) return '';
  if (typeof card !== 'object') {
    return extractCopyCardProductValue(card);
  }

  const candidates = [
    card.product,
    card.productName,
    card.name,
    card.title,
    card.label,
    card.meta?.product,
    card.meta?.productName,
    card.meta?.product?.name,
    card.meta?.product?.title,
    card.metadata?.product,
    card.metadata?.productName,
    card.metadata?.product?.name,
    card.metadata?.product?.title,
    card.details?.product,
    card.details?.productName,
    card.details?.product?.name,
    card.details?.product?.title,
  ];

  for (const candidate of candidates) {
    const normalized = extractCopyCardProductValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const normalizeCopyText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
};

const normalizeRecipeCode = (value) => {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return '';
  const trimmed = normalized.replace(/^0+/, '');
  return trimmed || (normalized.includes('0') ? '0' : normalized);
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

const getRecipeVersionUnitKey = (asset) => {
  if (!asset) return '';
  const info = parseAdFilename(asset.filename || '');
  const recipe =
    normalizeKeyPart(
      asset.recipeCode ||
        asset.recipeId ||
        asset.recipe ||
        info.recipeCode,
    ) || '';
  if (!recipe) return '';
  const adGroupId =
    normalizeKeyPart(
      asset.adGroupId || asset.groupId || asset.groupCode || info.adGroupCode,
    ) || '';
  const version = normalizeKeyPart(getVersion(asset));
  if (!version) return '';
  const parts = [];
  if (adGroupId) parts.push(adGroupId);
  parts.push(recipe);
  parts.push(`v${version}`);
  return parts.join('|');
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

  const firstRecipeVersionKey = getRecipeVersionUnitKey(first);
  const secondRecipeVersionKey = getRecipeVersionUnitKey(second);
  if (
    firstRecipeVersionKey &&
    secondRecipeVersionKey &&
    firstRecipeVersionKey === secondRecipeVersionKey
  ) {
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

const getAdUnitCandidateKey = (asset) => {
  if (!asset) return '';
  return (
    getRecipeVersionUnitKey(asset) ||
    getAdUnitKey(asset) ||
    getAssetUnitId(asset) ||
    getAssetParentId(asset) ||
    getAssetDocumentId(asset) ||
    getAssetUrlKey(asset) ||
    asset.assetId ||
    asset.id ||
    ''
  );
};

const dedupeByAdUnit = (list = []) => {
  const seen = new Set();
  return list.filter((item) => {
    if (!item) return false;
    const key = getAdUnitCandidateKey(item);
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

const parseDimensionValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const match = value.match(/([0-9.]+)/);
    if (!match) return null;
    const parsed = parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractDimensionsFromValue = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const width = parseDimensionValue(value.width ?? value.w);
    const height = parseDimensionValue(value.height ?? value.h);
    if (width && height) {
      return { width, height };
    }
  }

  const asString = Array.isArray(value) ? value.join(' ') : String(value);
  const match =
    asString.match(/([0-9.]+)[^0-9.]*[:xX\\/][^0-9.]*([0-9.]+)/) ||
    asString.match(/([0-9.]+)[^0-9.]*by[^0-9.]*([0-9.]+)/i);
  if (!match) return null;
  const [, firstRaw, secondRaw] = match;
  const width = parseDimensionValue(firstRaw);
  const height = parseDimensionValue(secondRaw);
  if (width && height) {
    return { width, height };
  }
  return null;
};

const extractAssetDimensions = (asset) => {
  if (!asset || typeof asset !== 'object') return null;

  const widthCandidates = [
    asset.width,
    asset.pixelWidth,
    asset.widthPx,
    asset.imageWidth,
    asset.image_width,
    asset.metadata?.width,
    asset.metadata?.pixelWidth,
    asset.metadata?.widthPx,
    asset.metadata?.imageWidth,
    asset.metadata?.image_width,
    asset.metadata?.dimensions,
    asset.meta?.width,
    asset.meta?.pixelWidth,
    asset.meta?.dimensions,
    asset.platform?.width,
    asset.platform?.pixelWidth,
    asset.platform?.dimensions,
  ];

  const heightCandidates = [
    asset.height,
    asset.pixelHeight,
    asset.heightPx,
    asset.imageHeight,
    asset.image_height,
    asset.metadata?.height,
    asset.metadata?.pixelHeight,
    asset.metadata?.heightPx,
    asset.metadata?.imageHeight,
    asset.metadata?.image_height,
    asset.metadata?.dimensions,
    asset.meta?.height,
    asset.meta?.pixelHeight,
    asset.meta?.dimensions,
    asset.platform?.height,
    asset.platform?.pixelHeight,
    asset.platform?.dimensions,
  ];

  let width = null;
  for (const candidate of widthCandidates) {
    if (!candidate) continue;
    if (typeof candidate === 'object') {
      const dims = extractDimensionsFromValue(candidate);
      if (dims?.width && dims?.height) {
        return dims;
      }
      const parsed = parseDimensionValue(candidate.width ?? candidate.w);
      if (parsed) {
        width = parsed;
        break;
      }
      continue;
    }
    const parsed = parseDimensionValue(candidate);
    if (parsed) {
      width = parsed;
      break;
    }
  }

  let height = null;
  for (const candidate of heightCandidates) {
    if (!candidate) continue;
    if (typeof candidate === 'object') {
      const dims = extractDimensionsFromValue(candidate);
      if (dims?.width && dims?.height) {
        return dims;
      }
      const parsed = parseDimensionValue(candidate.height ?? candidate.h);
      if (parsed) {
        height = parsed;
        break;
      }
      continue;
    }
    const parsed = parseDimensionValue(candidate);
    if (parsed) {
      height = parsed;
      break;
    }
  }

  if (width && height) {
    return { width, height };
  }

  const dimensionCandidates = [
    asset.dimensions,
    asset.dimension,
    asset.size,
    asset.metadata?.dimensions,
    asset.metadata?.size,
    asset.meta?.dimensions,
    asset.meta?.size,
    asset.platform?.dimensions,
    asset.platform?.size,
  ];

  for (const candidate of dimensionCandidates) {
    const dims = extractDimensionsFromValue(candidate);
    if (dims) {
      return dims;
    }
  }

  return null;
};

const getAssetAspectRatio = (asset) => {
  if (!asset) return '';
  const direct =
    asset.aspectRatio || parseAdFilename(asset.filename || '').aspectRatio || '';
  if (direct) return direct;

  const dims = extractAssetDimensions(asset);
  if (!dims) return '';

  const { width, height } = dims;
  if (!width || !height) return '';

  const round = (value) => {
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value - Math.round(value)) < 0.01) {
      return Math.round(value);
    }
    return Math.round(value * 100) / 100;
  };

  const normalizedWidth = round(width);
  const normalizedHeight = round(height);
  if (!normalizedWidth || !normalizedHeight) return '';

  return `${normalizedWidth}x${normalizedHeight}`;
};

const normalizeAspectKey = (value) => {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return '';
  const compact = normalized.replace(/\s+/g, '');
  const match = compact.match(/^([0-9.]+)(?:[:xX\/])([0-9.]+)$/);
  if (match) {
    return `${match[1]}x${match[2]}`.toLowerCase();
  }
  return compact.toLowerCase();
};

const isSquareAspectRatio = (aspect) => {
  const normalized = normalizeAspectKey(aspect);
  if (!normalized) return false;
  if (normalized === '1x1' || normalized === 'square') {
    return true;
  }
  const match = normalized.match(/^([0-9.]+)x([0-9.]+)$/);
  if (!match) {
    return false;
  }
  const width = parseFloat(match[1]);
  const height = parseFloat(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0) {
    return false;
  }
  const ratio = width / height;
  return Math.abs(ratio - 1) <= 0.02;
};

const getCssAspectRatioValue = (aspect) => {
  const normalized = normalizeKeyPart(aspect);
  if (!normalized) return '';
  const compact = normalized.replace(/\s+/g, '');
  const match = compact.match(/^([0-9.]+)(?:[:xX\/])([0-9.]+)$/);
  if (!match) return '';
  return `${match[1]}/${match[2]}`;
};

const REVIEW_V2_ASPECT_ORDER = [
  '9x16',
  '',
  '1x1',
  '3x5',
  '4x5',
  'Pinterest',
  'Snapchat',
].map(normalizeAspectKey);

const getReviewAspectPriority = (aspect) => {
  const normalized = normalizeAspectKey(aspect);
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
      brandDashboardSlug = '',
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
  const [assignedIntegrationId, setAssignedIntegrationId] = useState('');
  const [assignedIntegrationName, setAssignedIntegrationName] = useState('');
  const [finalGallery, setFinalGallery] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [copyCards, setCopyCards] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const actionsMenuRef = useRef(null);
  const [modalCopies, setModalCopies] = useState([]);
  const updateModalCopies = useCallback((next) => {
    if (typeof next === 'function') {
      setModalCopies((prev) => {
        const result = next(prev);
        return sortCopyCards(Array.isArray(result) ? result : []);
      });
      return;
    }
    if (Array.isArray(next)) {
      setModalCopies(sortCopyCards(next));
      return;
    }
    setModalCopies([]);
  }, []);
  const [inlineCopyDrafts, setInlineCopyDrafts] = useState({});
  const [inlineCopyModalContext, setInlineCopyModalContext] = useState(null);
  const [reviewVersion, setReviewVersion] = useState(null);
  const [showHelpdeskModal, setShowHelpdeskModal] = useState(false);
  const [helpdeskTickets, setHelpdeskTickets] = useState([]);
  const [helpdeskReadVersion, setHelpdeskReadVersion] = useState(0);
  const [showFinalizeModal, setShowFinalizeModal] = useState(null);
  const [finalizeProcessing, setFinalizeProcessing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [started, setStarted] = useState(false);
  const [allHeroAds, setAllHeroAds] = useState([]); // hero list for all ads
  const [versionMode, setVersionMode] = useState(false); // reviewing new versions
  const [animating, setAnimating] = useState(null); // 'approve' | 'reject'
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [cardVersionIndices, setCardVersionIndices] = useState({});
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [expandedRequests, setExpandedRequests] = useState({});
  const [collapsedRejects, setCollapsedRejects] = useState({});
  const [replacementForms, setReplacementForms] = useState({});
  const [pendingResponseContext, setPendingResponseContext] = useState(null);
  const [manualStatus, setManualStatus] = useState({});
  const statusBarSentinelRef = useRef(null);
  const statusBarRef = useRef(null);
  const toolbarRef = useRef(null);
  const recipePreviewRef = useRef(null);
  const autoDispatchedIntegrationAssetIdsRef = useRef(new Set());
  const [statusBarPinned, setStatusBarPinned] = useState(false);
  const statusBarPinnedRef = useRef(statusBarPinned);
  useEffect(() => {
    statusBarPinnedRef.current = statusBarPinned;
  }, [statusBarPinned]);
  const [toolbarOffset, setToolbarOffset] = useState(0);
  const [toolbarBaseOffset, setToolbarBaseOffset] = useState(0);
  const effectiveToolbarOffset = useMemo(() => {
    const normalizedOffset = Number.isFinite(toolbarOffset)
      ? Math.max(0, toolbarOffset)
      : 0;
    const normalizedBase =
      Number.isFinite(toolbarBaseOffset) && toolbarBaseOffset > 0
        ? Math.max(0, toolbarBaseOffset)
        : normalizedOffset;
    return Math.min(normalizedOffset, normalizedBase);
  }, [toolbarOffset, toolbarBaseOffset]);
  const effectiveToolbarOffsetRef = useRef(effectiveToolbarOffset);
  useEffect(() => {
    effectiveToolbarOffsetRef.current = effectiveToolbarOffset;
  }, [effectiveToolbarOffset]);
  const preloads = useRef([]);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const copyCardsWithMeta = useMemo(
    () =>
      copyCards.map((card, index) => {
        const productName = resolveCopyCardProductName(card);
        const normalizedProduct = normalizeProductKey(productName);
        return {
          ...card,
          letter: getCopyLetter(index),
          resolvedProduct: productName,
          normalizedProduct,
        };
      }),
    [copyCards],
  );

  const copiesByProduct = useMemo(() => {
    const map = {};
    copyCardsWithMeta.forEach((card) => {
      const key = card.normalizedProduct || '';
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(card);
    });
    return map;
  }, [copyCardsWithMeta]);

  const copyCardById = useMemo(() => {
    const map = {};
    copyCardsWithMeta.forEach((card) => {
      if (card && card.id) {
        map[card.id] = card;
      }
    });
    return map;
  }, [copyCardsWithMeta]);

  const recipeProductMapMemo = useMemo(() => {
    const map = {};
    const assign = (key, value) => {
      const normalizedKey = normalizeProductKey(key);
      if (!normalizedKey) return;
      if (!map[normalizedKey]) {
        map[normalizedKey] = value;
      }
    };
    recipes.forEach((recipe) => {
      const productName = resolveRecipeProductName(recipe);
      if (!productName) return;
      assign(recipe.id, productName);
      assign(recipe.recipeCode, productName);
      assign(recipe.recipeNo, productName);
      assign(recipe.code, productName);
      assign(recipe.components?.recipeCode, productName);
      assign(recipe.components?.code, productName);
      assign(recipe.metadata?.recipeCode, productName);
      assign(recipe.metadata?.code, productName);
    });
    return map;
  }, [recipes]);

  const getProductNameForRecipe = useCallback(
    (recipeCode) => {
      const normalized = normalizeProductKey(recipeCode);
      if (normalized && recipeProductMapMemo[normalized]) {
        return recipeProductMapMemo[normalized];
      }
      if (!recipeCode) {
        return '';
      }
      const fallback = recipes.find((recipe) => {
        const keys = [
          recipe.id,
          recipe.recipeCode,
          recipe.recipeNo,
          recipe.code,
          recipe.components?.recipeCode,
          recipe.components?.code,
          recipe.metadata?.recipeCode,
          recipe.metadata?.code,
        ];
        return keys.some((key) => normalizeProductKey(key) === normalized);
      });
      if (fallback) {
        return resolveRecipeProductName(fallback);
      }
      return '';
    },
    [recipeProductMapMemo, recipes],
  );

  const getCopyCardsForProduct = useCallback(
    (productName) => {
      const normalized = normalizeProductKey(productName);
      if (normalized) {
        if (copiesByProduct[normalized]) {
          return copiesByProduct[normalized];
        }
        if (copiesByProduct['']) {
          return copiesByProduct[''];
        }
      } else if (copiesByProduct['']) {
        return copiesByProduct[''];
      }
      return [];
    },
    [copiesByProduct],
  );

  const recipeCopyAssignments = useMemo(() => {
    const assignments = {};
    const priorities = {};
    const register = (candidate, assignedId, priority) => {
      if (!assignedId) return;
      const normalized = normalizeRecipeCode(candidate);
      if (!normalized) return;
      const currentPriority = priorities[normalized];
      if (currentPriority != null && currentPriority >= priority) {
        return;
      }
      priorities[normalized] = priority;
      assignments[normalized] = assignedId;
    };

    recipes.forEach((recipe) => {
      const assignedId = normalizeKeyPart(recipe.platformCopyCardId);
      if (!assignedId) return;
      register(recipe.id, assignedId, 5);
      register(recipe.recipeCode, assignedId, 5);
      register(recipe.metadata?.recipeCode, assignedId, 4);
      register(recipe.components?.recipeCode, assignedId, 4);
      register(recipe.code, assignedId, 3);
      register(recipe.metadata?.code, assignedId, 3);
      register(recipe.components?.code, assignedId, 3);
      register(recipe.metadata?.recipeNo, assignedId, 2);
      register(recipe.recipeNo, assignedId, 1);
    });

    return assignments;
  }, [recipes]);

  const resolvedReviewerName = useMemo(() => {
    if (typeof reviewerName === 'string' && reviewerName.trim()) {
      return reviewerName.trim();
    }
    if (typeof user?.displayName === 'string' && user.displayName.trim()) {
      return user.displayName.trim();
    }
    if (user?.email) {
      return user.email;
    }
    if (user?.uid) {
      return user.uid;
    }
    return '';
  }, [reviewerName, user]);

  const reviewerIdentifier = useMemo(
    () => resolvedReviewerName || 'anonymous',
    [resolvedReviewerName],
  );

  const helpdeskBrandCode = useMemo(() => {
    const normalizedGroup = typeof groupBrandCode === 'string'
      ? groupBrandCode.trim()
      : '';
    if (normalizedGroup) return normalizedGroup;
    if (Array.isArray(brandCodes)) {
      const found = brandCodes.find(
        (code) => typeof code === 'string' && code.trim(),
      );
      if (found) return found.trim();
    }
    return '';
  }, [groupBrandCode, brandCodes]);

  const canUpdateGroupDoc = !isPublicReviewer;
  const reviewerNameValue = resolvedReviewerName;
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
  const [groupStatus, setGroupStatus] = useState(null);
  const normalizedGroupStatus = useMemo(() => {
    if (!groupStatus) return '';
    return String(groupStatus).trim().toLowerCase();
  }, [groupStatus]);
  const isGroupReviewed =
    normalizedGroupStatus === 'reviewed' || normalizedGroupStatus === 'done';
  const reviewedLockMessage =
    'This ad group review has been finalized. Further changes are disabled.';
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
  const reviewLogoUrl = useMemo(
    () =>
      agency?.logoUrl ||
      settings?.campfireLogoUrl ||
      settings?.logoUrl ||
      DEFAULT_LOGO_URL,
    [agency?.logoUrl, settings?.campfireLogoUrl, settings?.logoUrl],
  );
  const reviewLogoAlt = agency?.name
    ? `${agency.name} logo`
    : 'Campfire logo';

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    reviewLengthRef.current = reviewAds.length;
  }, [reviewAds.length]);

  useEffect(() => {
    if (reviewVersion !== 2) {
      setStatusBarPinned(false);
      setToolbarOffset(0);
      setToolbarBaseOffset(0);
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver !== 'function') {
      setStatusBarPinned(false);
      setToolbarOffset(0);
      setToolbarBaseOffset(0);
      return;
    }
    const sentinel = statusBarSentinelRef.current;
    const statusBarEl = statusBarRef.current;
    if (!sentinel || !statusBarEl) {
      setStatusBarPinned(false);
      setToolbarBaseOffset(0);
      return;
    }
    // Add some hysteresis so the pinned state is stable even as the bar
    // changes height when it condenses. Use the sentinel's bottom edge, which
    // aligns with the top edge of the status bar, so we can pin exactly when
    // the bar reaches the top of the viewport. Adjust the pinning threshold by
    // the bar's margin so we only pin once the visible portion touches the top
    // of the viewport.
    const MIN_HYSTERESIS = 8;
    const computeOffsets = () => {
      const computedStyle = window.getComputedStyle(statusBarEl);
      const marginTop = Number.parseFloat(computedStyle?.marginTop || '0') || 0;
      const safeToolbarOffset = Number.isFinite(effectiveToolbarOffsetRef.current)
        ? Math.max(0, effectiveToolbarOffsetRef.current)
        : 0;
      const pinOffset = safeToolbarOffset - marginTop;
      const releaseOffset = Math.max(0, pinOffset + MIN_HYSTERESIS);
      return { pinOffset, releaseOffset };
    };
    let offsets = computeOffsets();
    const updateOffsets = () => {
      offsets = computeOffsets();
    };
    const observerThresholds = Array.from(
      { length: 101 },
      (_, index) => index / 100,
    );
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const sentinelBottom = entry.boundingClientRect.bottom;
        if (!Number.isFinite(sentinelBottom)) {
          return;
        }
        const viewportTop = entry.rootBounds?.top ?? 0;
        setStatusBarPinned((prevPinned) => {
          const { pinOffset, releaseOffset } = offsets;
          const pinThreshold = viewportTop + pinOffset;
          const releaseThreshold = viewportTop + releaseOffset;

          if (prevPinned) {
            if (sentinelBottom >= releaseThreshold) {
              return false;
            }
            return true;
          }
          if (sentinelBottom <= pinThreshold) {
            return true;
          }
          return false;
        });
      },
      {
        threshold: observerThresholds,
      },
    );
    observer.observe(sentinel);
    const supportsResizeObserver = typeof ResizeObserver === 'function';
    const resizeObserver = supportsResizeObserver
      ? new ResizeObserver(updateOffsets)
      : null;
    if (resizeObserver) {
      resizeObserver.observe(statusBarEl);
    }
    window.addEventListener('resize', updateOffsets);
    return () => {
      observer.disconnect();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateOffsets);
    };
  }, [reviewVersion, reviewAds.length, effectiveToolbarOffset]);

  useEffect(() => {
    if (reviewVersion !== 2) {
      setToolbarOffset(0);
      setToolbarBaseOffset(0);
      return undefined;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }

    const toolbarEl = toolbarRef.current;
    if (!toolbarEl) {
      setToolbarOffset(0);
      setToolbarBaseOffset(0);
      return undefined;
    }

    const raf =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(callback, 16);
    const cancelRaf =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    let frame = null;

    const updateOffset = () => {
      if (frame !== null) {
        cancelRaf(frame);
      }
      frame = raf(() => {
        frame = null;
        const { height } = toolbarEl.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(toolbarEl);
        const paddingTop = Number.parseFloat(computedStyle?.paddingTop || '0') || 0;
        const paddingBottom =
          Number.parseFloat(computedStyle?.paddingBottom || '0') || 0;
        const rootFontSize = Number.parseFloat(
          window.getComputedStyle(document.documentElement)?.fontSize || '16',
        ) || 16;
        const basePaddingTop = 0.75 * rootFontSize;
        const safeAreaTop = Math.max(0, paddingTop - basePaddingTop);
        const next = Math.max(
          0,
          Math.round(height - safeAreaTop - paddingBottom),
        );
        setToolbarOffset((prev) => (prev === next ? prev : next));
        setToolbarBaseOffset((prev) => {
          if (!statusBarPinnedRef.current) {
            return next;
          }
          if (!Number.isFinite(prev) || prev <= 0) {
            return next;
          }
          return Math.min(prev, next);
        });
      });
    };

    updateOffset();

    const supportsResizeObserver = typeof ResizeObserver === 'function';
    const resizeObserver = supportsResizeObserver
      ? new ResizeObserver(updateOffset)
      : null;
    if (resizeObserver) {
      resizeObserver.observe(toolbarEl);
    }
    window.addEventListener('resize', updateOffset);

    return () => {
      if (frame !== null) {
        cancelRaf(frame);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateOffset);
    };
  }, [reviewVersion]);

  useEffect(() => {
    if (![2, 3].includes(reviewVersion)) {
      actionsMenuRef.current?.close?.();
    }
  }, [reviewVersion]);



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

  const renderCopyModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 overflow-auto p-4">
      <div className="flex max-h-[90vh] w-full max-w-[50rem] flex-col rounded-xl bg-white p-4 shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Platform Copy</h2>
          <div className="flex gap-2">
            <button
              onClick={() => saveCopyCards(modalCopies)}
              className={`btn-primary ${copyChanges ? '' : 'opacity-50 cursor-not-allowed'}`}
              disabled={!copyChanges}
            >
              Save
            </button>
            <button onClick={() => setShowCopyModal(false)} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
        <p className="mb-2 text-sm">
          These lines appear as the primary text, headline, and description on your Meta ads. Feel free to tweak or remove any of the options.
        </p>
        <div className="flex-1 overflow-auto">
          <CopyRecipePreview
            onSave={saveCopyCards}
            initialResults={copyCards}
            showOnlyResults
            hideBrandSelect
            onCopiesChange={updateModalCopies}
          />
        </div>
      </div>
    </div>
  );

  const submitFeedback = async () => {
    if (!feedbackComment.trim() || !groupId) return;
    try {
      setFeedbackSubmitting(true);
      const trimmedComment = feedbackComment.trim();
      await addDoc(collection(db, 'adGroups', groupId, 'feedback'), {
        comment: trimmedComment,
        updatedBy: reviewerName || user.email || 'anonymous',
        updatedAt: serverTimestamp(),
      });
      const { reviewUrl: feedbackReviewUrl, adGroupUrl: feedbackAdGroupUrl } =
        buildDetailLinks();
      await notifySlackStatusChange({
        brandCode: groupBrandCode || brandCode || '',
        adGroupId: groupId,
        adGroupName: adGroupDisplayName,
        status: 'overall-feedback',
        url: feedbackReviewUrl,
        adGroupUrl: feedbackAdGroupUrl,
        note: trimmedComment,
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

  const helpdeskUserId = userUid || '';

  useEffect(() => {
    if (!helpdeskBrandCode || !helpdeskUserId) {
      setHelpdeskTickets([]);
      return () => {};
    }
    const ticketsRef = collection(db, 'requests');
    const helpdeskQuery = query(
      ticketsRef,
      where('type', '==', 'helpdesk'),
      where('brandCode', '==', helpdeskBrandCode),
      where('participants', 'array-contains', helpdeskUserId),
    );
    const unsubscribe = onSnapshot(
      helpdeskQuery,
      (snapshot) => {
        const openTickets = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((ticket) => {
            const status = String(ticket.status || 'new')
              .trim()
              .toLowerCase();
            return status !== 'done';
          })
          .sort((a, b) => {
            const aTime = toDateSafe(
              a.lastMessageAt || a.updatedAt || a.createdAt,
            )?.getTime() || 0;
            const bTime = toDateSafe(
              b.lastMessageAt || b.updatedAt || b.createdAt,
            )?.getTime() || 0;
            return bTime - aTime;
          });
        setHelpdeskTickets(openTickets);
      },
      (error) => {
        console.error('Failed to load helpdesk tickets', error);
        setHelpdeskTickets([]);
      },
    );
    return () => unsubscribe();
  }, [helpdeskBrandCode, helpdeskUserId]);

  const unreadHelpdeskCount = useMemo(
    () => countUnreadHelpdeskTickets(helpdeskTickets),
    [helpdeskTickets, helpdeskReadVersion],
  );
  const hasUnreadHelpdesk = unreadHelpdeskCount > 0;

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

  const buildDetailLinks = useCallback(() => {
    if (typeof window === 'undefined') {
      return { reviewUrl: undefined, adGroupUrl: undefined };
    }
    const origin = window.location?.origin || '';
    const search = window.location?.search || '';
    const href = window.location?.href;
    if (!origin || !groupId) {
      return { reviewUrl: href, adGroupUrl: href };
    }
    const base = origin.replace(/\/$/, '');
    return {
      reviewUrl: `${base}/review/${groupId}${search}`,
      adGroupUrl: `${base}/ad-group/${groupId}`,
    };
  }, [groupId]);

  const navigate = useNavigate();
  const handleExitReview = useCallback(() => {
    releaseLock();
    setStarted(false);
    const candidate = (
      brandDashboardSlug ||
      groupBrandCode ||
      brandCodes?.[0] ||
      ''
    ).trim();
    if (candidate) {
      navigate(`/${candidate}`);
    } else {
      navigate('/');
    }
  }, [
    brandCodes,
    brandDashboardSlug,
    groupBrandCode,
    navigate,
    releaseLock,
  ]);
  const [hasPending, setHasPending] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );

  const buildHeroList = useCallback((list) => {
    const prefOrder = REVIEW_V2_ASPECT_ORDER;
    const getRecipe = (a) =>
      a.recipeCode || parseAdFilename(a.filename || '').recipeCode || 'unknown';
    const getAspect = (a) => normalizeAspectKey(getAssetAspectRatio(a));
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
    if (!groupId) {
      setCopyCards([]);
      return undefined;
    }

    publicHistoryKeyRef.current = null;

    let cancelled = false;
    let unsubscribe = null;
    let pollTimer = null;
    const collectionRef = collection(db, 'adGroups', groupId, 'copyCards');
    const collectionQuery = query(collectionRef, orderBy(documentId()));

    const applySnapshot = (snap) => {
      if (cancelled) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCopyCards(sortCopyCards(list));
    };

    const fetchOnce = async () => {
      try {
        const snap = await getDocs(collectionQuery);
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

    const shouldUseRealtime = allowPublicListeners && realtimeEnabled;

    if (!shouldUseRealtime) {
      startPolling();
    } else {
      try {
        unsubscribe = onSnapshot(
          collectionQuery,
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
      updateModalCopies(copyCards);
    }
  }, [showCopyModal, updateModalCopies]);

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
      const aspect = getAssetAspectRatio(a) || info.aspectRatio || '';
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
    if (!groupId) {
      setGroupStatus(null);
      return;
    }

    const groupRef = doc(db, 'adGroups', groupId);
    let cancelled = false;
    let unsubscribe = null;

    const applyStatus = (snapshot) => {
      if (!snapshot || !snapshot.exists()) {
        setGroupStatus(null);
        setAssignedIntegrationId('');
        setAssignedIntegrationName('');
        return;
      }
      const data = snapshot.data();
      setGroupStatus(data?.status || null);
      const integrationId =
        typeof data?.assignedIntegrationId === 'string'
          ? data.assignedIntegrationId
          : '';
      const integrationName =
        typeof data?.assignedIntegrationName === 'string'
          ? data.assignedIntegrationName
          : '';
      setAssignedIntegrationId(integrationId);
      setAssignedIntegrationName(integrationName);
    };

    const fetchStatus = async () => {
      try {
        const snap = await getDoc(groupRef);
        if (cancelled) return;
        applyStatus(snap);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch ad group status', err);
        }
      }
    };

    fetchStatus();

    if (allowPublicListeners) {
      unsubscribe = onSnapshot(
        groupRef,
        (snap) => applyStatus(snap),
        (error) => {
          console.error('Failed to subscribe to ad group status', error);
        },
      );
    }

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [allowPublicListeners, groupId]);

  useEffect(() => {
    if (!allowPublicListeners) {
      return;
    }

    let cancelled = false;
    let realtimeUnsubscribe = null;
    let pollTimer = null;
    let pollInFlight = false;

    const fetchAds = async () => {
      debugLog('Loading ads', { groupId, brandCodes });
      try {
        let list = [];
        let startIndex = 0;
        let status = 'pending';
        let rv = 1;
        if (groupId) {
            const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
            if (cancelled) return;
            if (groupSnap.exists()) {
              const data = groupSnap.data();
              const rawStatus = data.status || 'pending';
              setGroupStatus(rawStatus);
              status = rawStatus;
              rv = data.reviewVersion || 1;
              setGroupBrandCode(data.brandCode || '');
              const integrationId =
                typeof data.assignedIntegrationId === 'string'
                  ? data.assignedIntegrationId
                  : '';
              const integrationName =
                typeof data.assignedIntegrationName === 'string'
                  ? data.assignedIntegrationName
                  : '';
              setAssignedIntegrationId(integrationId);
              setAssignedIntegrationName(integrationName);
              if (rv === 2 || rv === 3) {
                try {
                  const rSnap = await getDocs(
                    collection(db, 'adGroups', groupId, 'recipes')
                  );
                  setRecipes(
                    rSnap.docs.map((d) => {
                      const data = d.data();
                      return {
                        id: d.id,
                        ...data,
                        recipeNo:
                          data?.recipeNo ?? data?.metadata?.recipeNo ?? data?.recipeNumber ?? null,
                      };
                    })
                  );
                } catch (err) {
                  console.error('Failed to fetch recipes for review', err);
                  setRecipes([]);
                } finally {
                  setRecipesLoaded(true);
                }
              } else {
                setRecipes([]);
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
            if (cancelled) return;
              const groupName = data.name || '';
              const brandCode = data.brandCode || '';
              list = assetsSnap.docs.map((assetDoc) =>
                normalizeReviewAssetData({
                  assetId: assetDoc.id,
                  ...assetDoc.data(),
                  adGroupId: groupId,
                  groupName,
                  brandCode,
                })
              );
          } else {
            setGroupStatus(null);
          }
          setInitialStatus(status);
          setReviewVersion(rv);
        } else {
          setGroupStatus(null);
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
            list = (
              await Promise.all(
                docs.map(async (d) => {
                  const data = d.data();
                  const adGroupId = data.adGroupId || d.ref.parent.parent.id;
                  if (!groupCache[adGroupId]) {
                    const gSnap = await getDoc(doc(db, 'adGroups', adGroupId));
                    if (cancelled) {
                      return null;
                    }
                    groupCache[adGroupId] = gSnap.exists() ? gSnap.data().name : '';
                  }
                  return normalizeReviewAssetData({
                    assetId: d.id,
                    ...data,
                    adGroupId,
                    groupName: groupCache[adGroupId],
                  });
                })
              )
            ).filter(Boolean);
            if (cancelled) {
              return;
            }
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
              if (cancelled) {
                return [];
              }
              const extras = [];
              if (parentSnap.exists()) {
                extras.push(
                  normalizeReviewAssetData({
                    assetId: rootId,
                    ...parentSnap.data(),
                    adGroupId: groupId,
                    groupName,
                  }),
                );
              }
              siblingSnap.docs.forEach((d) => {
                const normalizedSibling = normalizeReviewAssetData({
                  assetId: d.id,
                  ...d.data(),
                  adGroupId: groupId,
                  groupName,
                });
                const relatedRefs = [
                  d.id,
                  normalizedSibling.parentAdId,
                  normalizedSibling.parentId,
                  normalizedSibling.rootAdId,
                  normalizedSibling.rootAssetId,
                  normalizedSibling.assetFamilyId,
                  normalizedSibling.recipeAssetId,
                ];
                const alreadyIncluded = list.some((a) => {
                  if (assetsReferToSameDoc(a, normalizedSibling)) return true;
                  return relatedRefs.some((ref) => assetMatchesReference(a, ref));
                });
                if (!alreadyIncluded) {
                  extras.push(normalizedSibling);
                }
              });
              return extras;
            }),
          );
          list = [...list, ...extraLists.flat()];
        }

        if (cancelled) {
          return;
        }

        list.sort((a, b) => {
          const infoA = parseAdFilename(a.filename || '');
          const infoB = parseAdFilename(b.filename || '');
          const rA = a.recipeCode || infoA.recipeCode || '';
          const rB = b.recipeCode || infoB.recipeCode || '';
          const recipeComparison = compareRecipeCodes(rA, rB);
          if (recipeComparison !== 0) return recipeComparison;
          const aAsp = getAssetAspectRatio(a) || infoA.aspectRatio || '';
          const bAsp = getAssetAspectRatio(b) || infoB.aspectRatio || '';
          return getReviewAspectPriority(aAsp) - getReviewAspectPriority(bAsp);
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
            stripVersion(a.filename) ||
            getAssetDocumentId(a);
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
          const reviewUnitKeys = new Set(
            uniqueVisibleDeduped
              .map((asset) => getAdUnitCandidateKey(asset))
              .filter(Boolean),
          );
          const historyAssets = list.filter((a) => {
            if (a.status !== 'pending') return true;
            const key = getAdUnitCandidateKey(a);
            return key && reviewUnitKeys.has(key);
          });
          setAllAds(historyAssets);
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
        if (!cancelled) {
          console.error('Failed to load ads', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!user?.uid || (!groupId && brandCodes.length === 0)) {
      if (!cancelled) {
        setAds([]);
        setReviewAds([]);
        setLoading(false);
      }
      return;
    }

    const startPolling = () => {
      if (pollTimer) return;
      const run = () => {
        if (pollInFlight || cancelled) {
          return;
        }
        pollInFlight = true;
        fetchAds().finally(() => {
          pollInFlight = false;
        });
      };
      run();
      pollTimer = setInterval(run, 15000);
    };

    if (groupId && realtimeEnabled) {
      const assetsRef = collection(db, 'adGroups', groupId, 'assets');
      try {
        realtimeUnsubscribe = onSnapshot(
          assetsRef,
          () => {
            fetchAds();
          },
          (error) => {
            console.error('Failed to subscribe to ad group assets', error);
            if (!cancelled) {
              if (realtimeUnsubscribe) {
                try {
                  realtimeUnsubscribe();
                } catch (cleanupErr) {
                  console.warn('Failed to clean up ad group asset listener', cleanupErr);
                }
                realtimeUnsubscribe = null;
              }
              startPolling();
            }
          },
        );
      } catch (err) {
        console.error('Realtime asset listener setup failed', err);
        startPolling();
      }
      fetchAds();
    } else if (groupId) {
      startPolling();
    } else {
      fetchAds();
    }

    return () => {
      cancelled = true;
      if (realtimeUnsubscribe) {
        try {
          realtimeUnsubscribe();
        } catch (err) {
          console.warn('Failed to clean up asset listener', err);
        }
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [
    allowPublicListeners,
    user,
    brandCodes,
    groupId,
    realtimeEnabled,
    buildHeroList,
    getLatestAds,
  ]);

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
    const url = reviewLogoUrl;
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
  }, [reviewLogoUrl]);

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
        const aspA = getAssetAspectRatio(a);
        const aspB = getAssetAspectRatio(b);
        return getReviewAspectPriority(aspA) - getReviewAspectPriority(aspB);
      });
    });
    return groups;
  }, [currentAd, allAds]);

  const currentVersionAssets = versions[versionIndex] || [];
  const currentInfo = currentAd ? parseAdFilename(currentAd.filename || '') : {};
  const currentAspectRaw = getAssetAspectRatio(currentAd) || currentInfo.aspectRatio || '';
  const normalizedCurrentAspect = normalizeAspectKey(currentAspectRaw);
  const displayAd =
    currentVersionAssets.find(
      (a) => normalizeAspectKey(getAssetAspectRatio(a)) === normalizedCurrentAspect,
    ) || currentVersionAssets[0] || currentAd;
  const displayAssetId = getAssetDocumentId(displayAd);
  const displayParentId = getAssetParentId(displayAd);
  const displayUnitId = getAssetUnitId(displayAd);
  const displayVersion = getVersion(displayAd);
  const hasMultipleVersions = versions.length > 1;
  const hasDisplayVersion =
    displayVersion !== null &&
    displayVersion !== undefined &&
    displayVersion !== '';

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

  const mergeAssetUpdate = useCallback(
    (data) => {
      if (!data) return;
      const matchesAsset = (asset) => assetsReferToSameDoc(asset, data);

      if (reviewVersion === 2 && data.status === 'archived') {
        let nextLength = null;
        setAds((prev) => prev.filter((a) => !matchesAsset(a)));
        setAllAds((prev) => prev.filter((a) => !matchesAsset(a)));
        setReviewAds((prev) => {
          const filtered = prev.filter((a) => !matchesAsset(a));
          nextLength = filtered.length;
          return filtered;
        });

        const urlsToClear = [];
        if (data.adUrl) urlsToClear.push(data.adUrl);
        if (data.firebaseUrl) urlsToClear.push(data.firebaseUrl);
        if (urlsToClear.length > 0) {
          setResponses((prev) => {
            let changed = false;
            const next = { ...prev };
            urlsToClear.forEach((url) => {
              if (next[url]) {
                delete next[url];
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }

        if (nextLength !== null) {
          setCurrentIndex((idx) => {
            if (nextLength === 0) return 0;
            return Math.min(idx, nextLength - 1);
          });
        }
        return;
      }

      setAds((prev) =>
        prev.map((a) => (matchesAsset(a) ? { ...a, ...data } : a)),
      );
      setReviewAds((prev) =>
        prev.map((a) => (matchesAsset(a) ? { ...a, ...data } : a)),
      );
      setAllAds((prev) =>
        prev.map((a) =>
          matchesAsset(a)
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
    [reviewVersion, setAds, setReviewAds, setAllAds, setResponses, setCurrentIndex],
  );

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
    if (!allowPublicListeners) {
      return;
    }
    if (reviewVersion !== 2) {
      return;
    }

    const targetGroupId = displayAd?.adGroupId || groupId;
    if (!targetGroupId) {
      return;
    }

    let cancelled = false;
    let unsubscribe = null;
    let pollTimer = null;

    const assetsCollectionRef = collection(db, 'adGroups', targetGroupId, 'assets');

    const applyCollectionSnapshot = (snap) => {
      if (cancelled) return;
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') return;
        const docSnap = change.doc;
        if (!docSnap.exists()) return;
        mergeAssetUpdate({ assetId: docSnap.id, ...docSnap.data() });
      });
    };

    const fetchCollectionOnce = async () => {
      try {
        const snap = await getDocs(assetsCollectionRef);
        if (cancelled) return;
        snap.forEach((docSnap) => {
          mergeAssetUpdate({ assetId: docSnap.id, ...docSnap.data() });
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load assets via polling', err);
        }
      }
    };

    const startCollectionPolling = () => {
      if (pollTimer) return;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (err) {
          console.warn('Failed to clean up asset collection listener', err);
        }
        unsubscribe = null;
      }
      fetchCollectionOnce();
      pollTimer = setInterval(fetchCollectionOnce, 5000);
    };

    if (!realtimeEnabled) {
      startCollectionPolling();
    } else {
      try {
        unsubscribe = onSnapshot(
          assetsCollectionRef,
          (snap) => applyCollectionSnapshot(snap),
          (error) => {
            console.error('Failed to subscribe to asset collection updates', error);
            startCollectionPolling();
          },
        );
      } catch (err) {
        console.error('Realtime asset collection listener setup failed', err);
        startCollectionPolling();
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
  }, [
    allowPublicListeners,
    displayAd?.adGroupId,
    groupId,
    isPublicReviewer,
    mergeAssetUpdate,
    realtimeEnabled,
    reviewVersion,
  ]);

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

    const shouldTrackSingleAsset = reviewVersion !== 2;
    const assetRef = shouldTrackSingleAsset
      ? doc(db, 'adGroups', displayAd.adGroupId, 'assets', displayAssetId)
      : null;

    const fetchAssetOnce = async () => {
      if (!assetRef) return;
      try {
        const snap = await getDoc(assetRef);
        if (!snap.exists() || cancelled) return;
        mergeAssetUpdate({ assetId: snap.id, ...snap.data() });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load asset via polling', err);
        }
      }
    };

    const startAssetPolling = () => {
      if (!assetRef) return;
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

    if (shouldTrackSingleAsset) {
      if (!realtimeEnabled) {
        startAssetPolling();
      } else {
        try {
          assetUnsubscribe = onSnapshot(
            assetRef,
            (snap) => {
              if (!snap.exists() || cancelled) return;
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
    reviewVersion,
    mergeAssetUpdate,
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

  const currentAspect =
    getCssAspectRatioValue(currentAspectRaw) || getCssAspectRatioValue('9x16');

  const versionGroupsByAd = useMemo(() => {
    if (!reviewAds || reviewAds.length === 0) return {};
    const map = {};
    reviewAds.forEach((ad, idx) => {
      if (!ad) return;
      const cardKey = getAdKey(ad, idx);
      const related = allAds.filter((asset) => isSameAdUnit(asset, ad));
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
        .map((group) => {
          const sorted = [...group].sort((a, b) => {
            const aspectA = getAssetAspectRatio(a);
            const aspectB = getAssetAspectRatio(b);
            return getReviewAspectPriority(aspectA) - getReviewAspectPriority(aspectB);
          });
          const nonArchived = sorted.filter((asset) => asset.status !== 'archived');
          return nonArchived.length > 0 ? nonArchived : sorted;
        })
        .filter((group) => group.length > 0)
        .sort((a, b) => getVersion(b[0]) - getVersion(a[0]));
      map[cardKey] = groups.length > 0 ? groups : [[ad]];
    });
    return map;
  }, [reviewAds, allAds]);

  useEffect(() => {
    setCardVersionIndices((prev) => {
      if (!reviewAds || reviewAds.length === 0) {
        return prev;
      }

      const next = {};
      let changed = false;

      reviewAds.forEach((ad, idx) => {
        if (!ad) return;

        const key = getAdKey(ad, idx);
        const groups = versionGroupsByAd[key] && versionGroupsByAd[key].length > 0
          ? versionGroupsByAd[key]
          : [[ad]];
        const groupCount = groups.length;
        const prevIndex = prev[key] ?? 0;
        const clampedIndex = Math.min(prevIndex, groupCount - 1);
        const normalizedIndex = clampedIndex < 0 ? 0 : clampedIndex;

        next[key] = normalizedIndex;

        if (prevIndex !== normalizedIndex) {
          changed = true;
        }
      });

      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        changed = true;
      } else if (!changed) {
        for (const key of prevKeys) {
          if (!(key in next)) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [reviewAds, versionGroupsByAd]);

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

  useEffect(() => {
    if (!reviewAds || reviewAds.length === 0) {
      if (Object.keys(collapsedRejects).length > 0) {
        setCollapsedRejects({});
      }
      if (Object.keys(replacementForms).length > 0) {
        setReplacementForms({});
      }
      return;
    }
    const metas = reviewAds.map((ad, index) => buildStatusMeta(ad, index));
    setCollapsedRejects((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(prev).forEach((key) => {
        const meta = metas.find((entry) => entry.cardKey === key);
        if (!meta || meta.statusValue !== 'reject') {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setReplacementForms((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(prev).forEach((key) => {
        const meta = metas.find((entry) => entry.cardKey === key);
        if (!meta || meta.statusValue !== 'reject') {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [reviewAds, buildStatusMeta, collapsedRejects, replacementForms]);

  const setReplacementFormState = useCallback((key, updater) => {
    setReplacementForms((prev) => {
      const current = prev[key] || {};
      const nextState =
        typeof updater === 'function' ? updater(current) : updater;
      if (nextState === null || nextState === undefined) {
        if (!(key in prev)) {
          return prev;
        }
        const clone = { ...prev };
        delete clone[key];
        return clone;
      }
      return { ...prev, [key]: nextState };
    });
  }, []);

  const saveReplacementRequest = useCallback(
    async (cardKey, targetAssets, note) => {
      const trimmed = (note || '').trim();
      if (!trimmed) {
        setReplacementFormState(cardKey, (prev) => ({
          ...prev,
          open: true,
          error: 'Replacement direction is required.',
        }));
        return false;
      }

      setReplacementFormState(cardKey, (prev) => ({
        ...prev,
        open: true,
        saving: true,
        error: '',
      }));

      const requestedByName =
        reviewerName || user?.displayName || user?.email || user?.uid || 'Reviewer';

      const payload = {
        note: trimmed,
        requestedBy: requestedByName,
        requestedById: user?.uid || '',
        requestedByEmail: user?.email || '',
        requestedAt: serverTimestamp(),
      };

      try {
        const updates = [];
        targetAssets.forEach((asset) => {
          const docId = getAssetDocumentId(asset);
          if (!docId || !asset.adGroupId) return;
          updates.push(
            updateDoc(
              doc(db, 'adGroups', asset.adGroupId, 'assets', docId),
              { replacementRequest: payload },
            ),
          );
        });
        await Promise.all(updates);

        const applyLocalReplacement = (list) =>
          list.map((item) =>
            targetAssets.some((asset) => assetsReferToSameDoc(asset, item))
              ? { ...item, replacementRequest: payload }
              : item,
          );

        setAds((prev) => applyLocalReplacement(prev));
        setReviewAds((prev) => applyLocalReplacement(prev));
        setAllAds((prev) => applyLocalReplacement(prev));

        setReplacementFormState(cardKey, {
          open: false,
          saving: false,
          note: trimmed,
          originalNote: trimmed,
          error: '',
        });
        setCollapsedRejects((prev) => ({ ...prev, [cardKey]: true }));
        return true;
      } catch (err) {
        console.error('Failed to save replacement request', err);
        setReplacementFormState(cardKey, (prev) => ({
          ...prev,
          saving: false,
          error:
            err?.message ||
            'Failed to save replacement direction. Please try again.',
        }));
        return false;
      }
    },
    [reviewerName, user, setReplacementFormState, setAds, setReviewAds, setAllAds],
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

  const handleDownloadBrief = useCallback(() => {
    if (
      !recipePreviewRef.current ||
      typeof recipePreviewRef.current.downloadVisibleCsv !== 'function'
    ) {
      return;
    }
    const baseName =
      adGroupDisplayName ||
      (groupId ? `ad-group-${groupId}` : 'brief');
    const normalized = baseName
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${normalized || 'brief'}-brief.csv`;
    recipePreviewRef.current.downloadVisibleCsv(filename);
  }, [adGroupDisplayName, groupId]);

  const showCopyAction = copyCards.length > 0;
  const showGalleryAction = reviewVersion !== 3 && ads.length > 0;
  const canDownloadBrief = reviewVersion === 3 && recipes.length > 0;
  const reviewMenuActions = useMemo(() => {
    const actions = [];
    if (showCopyAction) {
      actions.push({
        key: 'copy',
        label: 'View platform copy',
        onSelect: () => {
          setShowCopyModal(true);
        },
        Icon: FiType,
      });
    }
    if (reviewVersion === 3 && canDownloadBrief) {
      actions.push({
        key: 'download',
        label: 'Download brief (CSV)',
        onSelect: () => {
          handleDownloadBrief();
        },
        Icon: FiDownload,
      });
    }
    if (reviewVersion !== 3 && showGalleryAction) {
      actions.push({
        key: 'gallery',
        label: 'View ad gallery',
        onSelect: () => {
          setShowGallery(true);
        },
        Icon: FiGrid,
      });
    }
    actions.push({
      key: 'helpdesk',
      label: (
        <span className="flex w-full items-center justify-between">
          <span>Contact helpdesk</span>
          {hasUnreadHelpdesk ? (
            <NotificationDot size="sm" srText="Unread helpdesk messages" />
          ) : null}
        </span>
      ),
      onSelect: () => {
        setShowHelpdeskModal(true);
      },
      Icon: FiMessageSquare,
    });
    return actions;
  }, [
    showCopyAction,
    reviewVersion,
    canDownloadBrief,
    showGalleryAction,
    setShowCopyModal,
    handleDownloadBrief,
    setShowGallery,
    setShowHelpdeskModal,
    hasUnreadHelpdesk,
  ]);

  const reviewMenuButtonIcon = useMemo(
    () => (
      <span className="relative inline-flex">
        <FiMoreHorizontal className="h-5 w-5" />
        {hasUnreadHelpdesk ? (
          <NotificationDot
            className="absolute -right-1 -top-1"
            size="sm"
            srText="Unread helpdesk messages"
          />
        ) : null}
      </span>
    ),
    [hasUnreadHelpdesk],
  );

  const reviewMenuButtonAriaLabel = hasUnreadHelpdesk
    ? 'Open review actions menu (unread helpdesk messages)'
    : 'Open review actions menu';

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
          const resolvedProduct = resolveCopyCardProductName(c);
          const data = {
            primary: c.primary || '',
            headline: c.headline || '',
            description: c.description || '',
            product: resolvedProduct,
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

  const saveInlineCopyCard = useCallback(
    async ({ id, primary = '', headline = '', description = '', product = '' }) => {
      if (!groupId) return null;
      const resolvedProduct =
        extractCopyCardProductValue(product) ||
        resolveCopyCardProductName({ product });
      const payload = {
        primary: primary || '',
        headline: headline || '',
        description: description || '',
        product: resolvedProduct,
      };
      try {
        if (id) {
          await setDoc(
            doc(db, 'adGroups', groupId, 'copyCards', id),
            payload,
            { merge: true },
          );
          const updated = { id, ...payload };
          setCopyCards((prev) =>
            sortCopyCards(prev.map((card) => (card.id === id ? updated : card))),
          );
          updateModalCopies((prev) =>
            prev.map((card) => (card.id === id ? updated : card)),
          );
          return updated;
        }
        const docRef = await addDoc(
          collection(db, 'adGroups', groupId, 'copyCards'),
          payload,
        );
        const created = { id: docRef.id, ...payload };
        setCopyCards((prev) => sortCopyCards([...prev, created]));
        updateModalCopies((prev) => [...prev, created]);
        return created;
      } catch (err) {
        console.error('Failed to save platform copy', err);
        throw err;
      }
    },
    [groupId],
  );

  const saveInlineCopyOverride = useCallback(
    async (asset, { primary = '', headline = '', description = '' } = {}) => {
      if (!groupId || !asset) return null;
      const assetDocId = getAssetDocumentId(asset);
      if (!assetDocId) return null;
      const targetGroupId = asset.adGroupId || groupId;
      const payload = {
        platformCopyOverride: {
          primary: primary || '',
          headline: headline || '',
          description: description || '',
        },
      };
      try {
        await setDoc(
          doc(db, 'adGroups', targetGroupId, 'assets', assetDocId),
          payload,
          { merge: true },
        );
        const applyOverride = (list) =>
          list.map((item) =>
            assetsReferToSameDoc(item, asset)
              ? { ...item, ...payload }
              : item,
          );
        setAds((prev) => applyOverride(prev));
        setReviewAds((prev) => applyOverride(prev));
        setAllAds((prev) => applyOverride(prev));
        return payload.platformCopyOverride;
      } catch (err) {
        console.error('Failed to save ad-specific platform copy', err);
        throw err;
      }
    },
    [groupId],
  );

  const clearInlineCopyOverride = useCallback(
    async (asset) => {
      if (!groupId || !asset) return;
      const assetDocId = getAssetDocumentId(asset);
      if (!assetDocId) return;
      const targetGroupId = asset.adGroupId || groupId;
      try {
        await updateDoc(
          doc(db, 'adGroups', targetGroupId, 'assets', assetDocId),
          { platformCopyOverride: deleteField() },
        );
      } catch (err) {
        console.error('Failed to clear ad-specific platform copy', err);
      }
      const removeOverride = (list) =>
        list.map((item) =>
          assetsReferToSameDoc(item, asset)
            ? { ...item, platformCopyOverride: undefined }
            : item,
        );
      setAds((prev) => removeOverride(prev));
      setReviewAds((prev) => removeOverride(prev));
      setAllAds((prev) => removeOverride(prev));
    },
    [groupId],
  );

  const deleteInlineCopyCard = useCallback(
    async (cardId) => {
      if (!groupId || !cardId) return;
      try {
        await deleteDoc(doc(db, 'adGroups', groupId, 'copyCards', cardId));
        setCopyCards((prev) => prev.filter((card) => card.id !== cardId));
        updateModalCopies((prev) => prev.filter((card) => card.id !== cardId));
      } catch (err) {
        console.error('Failed to delete platform copy', err);
        throw err;
      }
    },
    [groupId],
  );

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
    let recipeAssets = filteredAssets;
    if (recipeAssets.length === 0 && matchesTargetAsset(targetAd)) {
      recipeAssets = [targetAd];
    }

    if (recipeAssets.length === 0) {
      console.warn('No eligible assets found for status update');
      setSubmitting(false);
      setAnimating(null);
      return;
    }
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

  const approveAllPending = async () => {
    const pendingEntries = [];
    reviewAds.forEach((ad, index) => {
      const { statusValue, statusAssets } = buildStatusMeta(ad, index);
      if (statusValue === 'pending') {
        pendingEntries.push({ ad, assets: statusAssets, index });
      }
    });

    for (const entry of pendingEntries) {
      await submitResponse('approve', {
        targetAd: entry.ad,
        targetAssets: entry.assets,
        targetIndex: entry.index,
        skipAdvance: true,
      });
    }
  };

  const updateIntegrationStatusForAssets = useCallback(
    async (targetAssets, nextState, options = {}) => {
      if (
        !groupId ||
        !assignedIntegrationId ||
        !Array.isArray(targetAssets) ||
        targetAssets.length === 0
      ) {
        return;
      }

      const { errorMessage = '' } = options;
      const hasRequestPayload = Object.prototype.hasOwnProperty.call(
        options,
        'requestPayload',
      );
      const hasResponsePayload = Object.prototype.hasOwnProperty.call(
        options,
        'responsePayload',
      );
      const hasResponseStatus = Object.prototype.hasOwnProperty.call(
        options,
        'responseStatus',
      );
      const hasResponseHeaders = Object.prototype.hasOwnProperty.call(
        options,
        'responseHeaders',
      );

      try {
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();
        let hasUpdates = false;

        targetAssets.forEach((asset) => {
          const docId = getAssetDocumentId(asset);
          if (!docId) {
            return;
          }
          const ref = doc(db, 'adGroups', groupId, 'assets', docId);
          const payload = {
            state: nextState,
            integrationId: assignedIntegrationId,
            integrationName: assignedIntegrationName || '',
            updatedAt: timestamp,
          };
          if (nextState === 'error') {
            payload.errorMessage = errorMessage || '';
          } else {
            payload.errorMessage = '';
          }
          if (hasRequestPayload) {
            payload.requestPayload =
              options.requestPayload === undefined ? null : options.requestPayload;
          }
          if (hasResponsePayload) {
            payload.responsePayload =
              options.responsePayload === undefined ? null : options.responsePayload;
          }
          if (hasResponseStatus) {
            payload.responseStatus =
              options.responseStatus === undefined ? null : options.responseStatus;
          }
          if (hasResponseHeaders) {
            payload.responseHeaders =
              options.responseHeaders === undefined ? null : options.responseHeaders;
          }
          batch.update(ref, {
            [`integrationStatuses.${assignedIntegrationId}`]: payload,
          });
          hasUpdates = true;
        });

        if (hasUpdates) {
          await batch.commit();
        }
      } catch (err) {
        console.error('Failed to update integration statuses', err);
      }
    },
    [assignedIntegrationId, assignedIntegrationName, groupId],
  );

  const dispatchIntegrationForApprovedAds = useCallback(
    async (approvedAssets) => {
      if (!groupId || !assignedIntegrationId) {
        return;
      }

      const assetsList = Array.isArray(approvedAssets)
        ? approvedAssets.filter((asset) => getAssetDocumentId(asset))
        : [];

      if (!assetsList.length) {
        return;
      }

      await updateIntegrationStatusForAssets(assetsList, 'sending', {
        requestPayload: null,
        responsePayload: null,
        responseStatus: null,
        responseHeaders: null,
        errorMessage: '',
      });

      const errors = [];

      for (let index = 0; index < assetsList.length; index += 1) {
        const asset = assetsList[index];
        const assetId = getAssetDocumentId(asset);
        const attempt = index + 1;

        const approvedAsset = {
          id: assetId,
          filename: asset.filename || '',
          status: asset.status || '',
          firebaseUrl: asset.firebaseUrl || '',
          cdnUrl: asset.cdnUrl || '',
          thumbnailUrl: asset.thumbnailUrl || '',
          aspectRatio: asset.aspectRatio || '',
          recipeCode: asset.recipeCode || '',
          version: getVersion(asset),
        };

        const payload = {
          adGroupId: groupId,
          integrationId: assignedIntegrationId,
          integrationName: assignedIntegrationName || '',
          approvedAssetId: assetId,
          approvedAdId: assetId,
          approvedAssetIds: assetId ? [assetId] : [],
          approvedAssets: [approvedAsset],
          approvedAsset,
        };

        let responsePayloadSnapshot = null;
        let responseHeadersSnapshot = null;
        let responseStatusCode = null;
        let requestPayloadSnapshot = payload;
        let responseText = '';
        let parsedResponse = null;
        let errorHandled = false;

        try {
          const response = await fetch('/api/integration-worker', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              integrationId: assignedIntegrationId,
              reviewId: groupId,
              attempt,
              payload,
            }),
          });

          responseStatusCode = response.status;
          responseText = await response.text();
          if (responseText) {
            try {
              parsedResponse = JSON.parse(responseText);
            } catch (err) {
              parsedResponse = null;
            }
          }

          if (
            parsedResponse &&
            typeof parsedResponse === 'object' &&
            parsedResponse !== null
          ) {
            if (
              parsedResponse.request &&
              typeof parsedResponse.request === 'object' &&
              parsedResponse.request !== null &&
              Object.prototype.hasOwnProperty.call(parsedResponse.request, 'body')
            ) {
              requestPayloadSnapshot = parsedResponse.request.body;
            } else if (
              parsedResponse.mapping &&
              typeof parsedResponse.mapping === 'object' &&
              parsedResponse.mapping !== null &&
              Object.prototype.hasOwnProperty.call(parsedResponse.mapping, 'payload')
            ) {
              requestPayloadSnapshot = parsedResponse.mapping.payload;
            }

            if (
              parsedResponse.dispatch &&
              typeof parsedResponse.dispatch === 'object' &&
              parsedResponse.dispatch !== null
            ) {
              const dispatchData = parsedResponse.dispatch;
              if (Object.prototype.hasOwnProperty.call(dispatchData, 'body')) {
                responsePayloadSnapshot = dispatchData.body;
              }
              if (Object.prototype.hasOwnProperty.call(dispatchData, 'headers')) {
                responseHeadersSnapshot = dispatchData.headers;
              }
              if (
                Object.prototype.hasOwnProperty.call(dispatchData, 'status') &&
                typeof dispatchData.status === 'number'
              ) {
                responseStatusCode = dispatchData.status;
              }
            }
          }

          if (responsePayloadSnapshot === null && responseText) {
            try {
              responsePayloadSnapshot = JSON.parse(responseText);
            } catch (err) {
              responsePayloadSnapshot = responseText;
            }
          }

          if (responseStatusCode === null) {
            responseStatusCode = response.status;
          }

          if (!response.ok) {
            const message = (() => {
              if (
                parsedResponse &&
                typeof parsedResponse === 'object' &&
                parsedResponse !== null
              ) {
                if (typeof parsedResponse.error === 'string') {
                  return parsedResponse.error;
                }
                if (typeof parsedResponse.message === 'string') {
                  return parsedResponse.message;
                }
              }
              return response.statusText || 'Integration request failed.';
            })();

            errorHandled = true;
            await updateIntegrationStatusForAssets([asset], 'error', {
              errorMessage: message,
              requestPayload: requestPayloadSnapshot,
              responsePayload: responsePayloadSnapshot,
              responseStatus: responseStatusCode,
              responseHeaders: responseHeadersSnapshot,
            });
            errors.push({
              assetId,
              message,
            });
            continue;
          }

          await updateIntegrationStatusForAssets([asset], 'received', {
            requestPayload: requestPayloadSnapshot,
            responsePayload: responsePayloadSnapshot,
            responseStatus: responseStatusCode,
            responseHeaders: responseHeadersSnapshot,
            errorMessage: '',
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Integration dispatch failed.';
          if (!errorHandled) {
            await updateIntegrationStatusForAssets([asset], 'error', {
              errorMessage: message,
              requestPayload: requestPayloadSnapshot,
              responsePayload: responsePayloadSnapshot,
              responseStatus: responseStatusCode,
              responseHeaders: responseHeadersSnapshot,
            });
          }
          errors.push({
            assetId,
            message,
          });
        }
      }

      if (errors.length > 0) {
        const combinedMessage = errors
          .map((entry) => `${entry.assetId || 'ad'}: ${entry.message}`)
          .join('; ');
        throw new Error(combinedMessage);
      }
    },
    [
      assignedIntegrationId,
      assignedIntegrationName,
      groupId,
      updateIntegrationStatusForAssets,
    ],
  );

  useEffect(() => {
    const normalizedStatus = normalizeKeyPart(groupStatus).toLowerCase();

    if (!groupId || !assignedIntegrationId || normalizedStatus !== 'done') {
      autoDispatchedIntegrationAssetIdsRef.current = new Set();
      return;
    }

    const eligibleAssets = ads.filter((asset) => {
      if (!asset || typeof asset !== 'object') {
        return false;
      }
      const assetStatus = normalizeKeyPart(asset.status).toLowerCase();
      if (assetStatus !== 'approved') {
        return false;
      }
      const statuses =
        asset.integrationStatuses && typeof asset.integrationStatuses === 'object'
          ? asset.integrationStatuses
          : null;
      const statusEntry = statuses ? statuses[assignedIntegrationId] : null;
      const state = normalizeKeyPart(statusEntry?.state).toLowerCase();
      if (state === 'received' || state === 'sending') {
        return false;
      }
      return true;
    });

    if (eligibleAssets.length === 0) {
      return;
    }

    const assetsToDispatch = [];
    const dispatchedIds = [];

    for (const asset of eligibleAssets) {
      const docId = getAssetDocumentId(asset);
      if (!docId) {
        continue;
      }
      if (autoDispatchedIntegrationAssetIdsRef.current.has(docId)) {
        continue;
      }
      autoDispatchedIntegrationAssetIdsRef.current.add(docId);
      dispatchedIds.push(docId);
      assetsToDispatch.push(asset);
    }

    if (assetsToDispatch.length === 0) {
      return;
    }

    let cancelled = false;

    dispatchIntegrationForApprovedAds(assetsToDispatch).catch((error) => {
      console.error('Failed to dispatch integration when group marked done', error);
      if (!cancelled) {
        dispatchedIds.forEach((id) =>
          autoDispatchedIntegrationAssetIdsRef.current.delete(id),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    ads,
    assignedIntegrationId,
    dispatchIntegrationForApprovedAds,
    groupId,
    groupStatus,
  ]);

  const handleFinalizeReview = async (approvePending = false) => {
    if (!groupId) {
      setShowFinalizeModal(null);
      return;
    }

    setFinalizeProcessing(true);
    try {
      if (approvePending) {
        await approveAllPending();
      }

      const approvedAssets =
        assignedIntegrationId
          ? ads.filter((asset) => asset.status === 'approved')
          : [];

      const updateData = {
        status: 'reviewed',
        reviewProgress: null,
        lastUpdated: serverTimestamp(),
      };

      await updateDoc(doc(db, 'adGroups', groupId), updateData);

      const { reviewUrl: detailUrl, adGroupUrl } = buildDetailLinks();

      await notifySlackStatusChange({
        brandCode: groupBrandCode || brandCode || '',
        adGroupId: groupId,
        adGroupName: adGroupDisplayName,
        status: 'reviewed',
        url: detailUrl,
        adGroupUrl,
      });

      if (isPublicReviewer) {
        try {
          await addDoc(collection(db, 'adGroups', groupId, 'publicUpdates'), {
            type: 'status',
            update: {
              status: 'reviewed',
              reviewProgress: null,
              lastUpdated: new Date().toISOString(),
            },
            createdAt: serverTimestamp(),
            reviewer: reviewerIdentifier,
            source: 'public-review',
          });
        } catch (err) {
          console.warn('Failed to record public finalize update', err);
        }
      }

      setGroupStatus('reviewed');
      setInitialStatus('done');
      setStarted(false);
      setShowFinalizeModal(null);

    } catch (err) {
      console.error('Failed to finalize review', err);
    } finally {
      setFinalizeProcessing(false);
    }
  };

  const openFinalizeModal = () => {
    if (finalizeProcessing || !groupId) return;
    const pendingCount = reviewStatusCounts?.pending ?? 0;
    setShowFinalizeModal(pendingCount > 0 ? 'pending' : 'confirm');
  };

  const closeFinalizeModal = () => {
    if (finalizeProcessing) return;
    setShowFinalizeModal(null);
  };

  const renderFinalizeAction = ({
    compact = false,
    fullWidth = true,
    className = '',
  } = {}) => {
    if (isGroupReviewed) {
      return (
        <span
          className={combineClasses(
            'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-emerald-500/70 bg-emerald-50 font-semibold text-emerald-700 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
            compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            fullWidth ? 'w-full' : '',
            'sm:w-auto',
            className,
          )}
        >
          <FiCheckCircle
            className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}
            aria-hidden="true"
          />
          Reviewed
        </span>
      );
    }

    const disabled = finalizeProcessing || submitting || !groupId;

    return (
      <button
        type="button"
        onClick={openFinalizeModal}
        disabled={disabled}
        className={combineClasses(
          'btn-primary relative z-40 whitespace-nowrap font-semibold',
          compact ? 'px-3 py-1.5 text-xs' : 'text-sm',
          fullWidth ? 'w-full' : '',
          disabled ? 'opacity-60 cursor-not-allowed' : '',
          'sm:w-auto',
          className,
        )}
      >
        finalize review
      </button>
    );
  };

  if (
    reviewVersion === null ||
    !logoReady ||
    (started && !firstAdLoaded) ||
    ((reviewVersion === 2 || reviewVersion === 3) && !recipesLoaded)
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
        {showCopyModal && renderCopyModal()}
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
      <div className="flex flex-col items-center justify-center space-y-4 text-center min-h-screen">
          {reviewLogoUrl && (
            <OptimizedImage
              pngUrl={reviewLogoUrl}
              alt={reviewLogoAlt}
              loading="eager"
              cacheKey={reviewLogoUrl}
              onLoad={() => setLogoReady(true)}
              className="mb-2 max-h-16 w-auto"
            />
          )}
        <h1 className="text-2xl font-bold">Ads Pending Review</h1>
        <p className="text-lg">We'll notify you when your ads are ready.</p>
        {showCopyModal && renderCopyModal()}
      </div>
    );
  }


  return (
    <div className="relative flex flex-col items-center justify-center space-y-4 min-h-screen">
      {showFinalizeModal && (
        <Modal>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                Finalize review
              </h2>
              {showFinalizeModal === 'pending' ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    There are pending ads remaining. Would you like to approve them?
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Note: This lets the design team know the review is complete. You'll still be able to download approved ads,
                    but once finalized you won't be able to open new helpdesk chats or re-open the review.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Note: This lets the design team know the review is complete. You'll still be able to download approved ads, but
                  once finalized you won't be able to open new helpdesk chats or re-open the review.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary rounded-full px-5"
                onClick={closeFinalizeModal}
                disabled={finalizeProcessing}
              >
                Cancel
              </button>
              {showFinalizeModal === 'pending' ? (
                <button
                  type="button"
                  className="btn-primary rounded-full px-5"
                  onClick={() => handleFinalizeReview(true)}
                  disabled={finalizeProcessing}
                >
                  {finalizeProcessing ? 'Approving...' : 'Approve all Pending'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary rounded-full px-5"
                  onClick={() => handleFinalizeReview(false)}
                  disabled={finalizeProcessing}
                >
                  {finalizeProcessing ? 'Finalizing...' : 'Confirm'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {showStreakModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="flex flex-col gap-4 bg-white p-4 rounded-xl shadow max-w-sm dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
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
              <div className="flex flex-col gap-2">
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
      <div className="flex w-full flex-col items-center">
        {(reviewVersion === 2 || reviewVersion === 3) && (
          <div
            ref={toolbarRef}
            className="sticky top-0 z-30 flex w-full items-center gap-2 px-4 py-3 sm:px-6"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <button
              type="button"
              onClick={handleExitReview}
              aria-label="Exit review"
              className="btn-action flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
            >
              <FiHome className="h-5 w-5" />
            </button>
            {reviewVersion === 2 && statusBarPinned && (
              <div className="flex flex-1 justify-center sm:hidden">
                {renderFinalizeAction({ compact: true, fullWidth: false })}
              </div>
            )}
            <OverflowMenu
              ref={actionsMenuRef}
              actions={reviewMenuActions}
              buttonAriaLabel={reviewMenuButtonAriaLabel}
              buttonIcon={reviewMenuButtonIcon}
              className="ml-auto"
            />
          </div>
        )}
        <div className="flex w-full flex-col items-center">
          <div
          className={`w-full px-4 pt-6 pb-4 sm:px-6 ${
            reviewVersion === 3 ? 'max-w-5xl' : 'max-w-[712px]'
          }`}
        >
          <div className="flex items-center justify-center">
            {reviewLogoUrl && (
              <OptimizedImage
                pngUrl={reviewLogoUrl}
                alt={reviewLogoAlt}
                loading="eager"
                cacheKey={reviewLogoUrl}
                onLoad={() => setLogoReady(true)}
                className="max-h-16 w-auto"
              />
            )}
          </div>
        </div>
      </div>
        <div className="relative flex w-full justify-center px-2 sm:px-0">
          {reviewVersion === 3 ? (
            <div className="w-full max-w-5xl">
              <RecipePreview
                ref={recipePreviewRef}
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
            <div
              className={combineClasses(
                'relative w-full max-w-[712px] pt-2 sm:px-0',
                statusBarPinned ? 'px-4' : 'px-2',
              )}
            >
              <div
                ref={statusBarSentinelRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 -top-6 h-6"
              />
              <div
                ref={statusBarRef}
                className={combineClasses(
                  'sticky z-20',
                  statusBarPinned ? 'mt-0' : 'mt-2',
                )}
                style={{
                  top:
                    effectiveToolbarOffset && effectiveToolbarOffset > 0
                      ? `${effectiveToolbarOffset}px`
                      : 0,
                }}
              >
                <div
                  className={combineClasses(
                    'rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]',
                    statusBarPinned
                      ? 'px-2 py-1.5 sm:px-3 sm:py-2'
                      : 'px-3 py-3 sm:px-4 sm:py-3',
                  )}
                >
                  <div
                    className={combineClasses(
                      'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
                      statusBarPinned ? 'sm:gap-3' : '',
                    )}
                  >
                    <div
                      className={combineClasses(
                        'flex-1',
                        statusBarPinned ? 'hidden sm:flex sm:items-center sm:gap-4' : '',
                      )}
                    >
                      {adGroupDisplayName && !statusBarPinned && (
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                          {adGroupDisplayName}
                        </div>
                      )}
                      <div
                        className={combineClasses(
                          statusBarPinned
                            ? 'hidden sm:grid sm:grid-cols-4'
                            : 'grid grid-cols-2 sm:grid-cols-4',
                          statusBarPinned
                            ? 'mt-0 gap-2 sm:gap-3'
                            : 'mt-3 gap-4',
                        )}
                      >
                        {['pending', 'approve', 'edit', 'reject'].map((statusKey) => {
                          const statusLabel = (statusLabelMap[statusKey] || statusKey).toLowerCase();
                          return (
                            <div
                              key={statusKey}
                              className={`flex flex-col items-center text-center ${
                                statusBarPinned ? 'gap-0.5 sm:gap-0.5' : 'gap-0.5 sm:gap-1'
                              }`}
                            >
                              <span
                                className={`font-semibold text-gray-900 dark:text-[var(--dark-text)] ${
                                  statusBarPinned
                                    ? 'text-base sm:text-lg'
                                    : 'text-lg sm:text-xl'
                                }`}
                              >
                                {reviewStatusCounts[statusKey] ?? 0}
                              </span>
                              <span
                                className={`font-medium text-gray-500 dark:text-gray-300 ${
                                  statusBarPinned
                                    ? 'text-[10px] sm:text-[11px]'
                                    : 'text-[11px] sm:text-xs'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className={combineClasses(
                        statusBarPinned ? 'hidden sm:flex' : 'flex',
                        'w-full flex-col items-stretch gap-2 sm:w-auto sm:self-center sm:items-end',
                      )}
                    >
                      {renderFinalizeAction({ compact: statusBarPinned })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 space-y-6">
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
                  const fallbackAssets =
                    latestAssets && latestAssets.length > 0
                      ? latestAssets
                      : ad
                      ? [ad]
                      : [];
                  const versionGroups =
                    groups && groups.length > 0
                      ? groups
                      : fallbackAssets.length > 0
                      ? [fallbackAssets]
                      : [];
                  const groupCount = versionGroups.length;
                  const storedVersionIndex = cardVersionIndices[cardKey] ?? 0;
                  const resolvedVersionIndex =
                    groupCount > 0
                      ? Math.min(storedVersionIndex, groupCount - 1)
                      : 0;
                  const safeVersionIndex =
                    resolvedVersionIndex < 0 ? 0 : resolvedVersionIndex;
                  const primaryAssets =
                    versionGroups[safeVersionIndex] &&
                    versionGroups[safeVersionIndex].length > 0
                      ? versionGroups[safeVersionIndex]
                      : fallbackAssets;
                  const sortedAssets = primaryAssets
                    .map((asset, originalIndex) => ({ asset, originalIndex }))
                    .sort((a, b) => {
                      const priorityA = getReviewAspectPriority(
                        getAssetAspectRatio(a.asset),
                      );
                      const priorityB = getReviewAspectPriority(
                        getAssetAspectRatio(b.asset),
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
                  const latestVersionAsset = latestAssets[0] || null;
                  const latestVersionNumber = latestVersionAsset
                    ? getVersion(latestVersionAsset)
                    : null;
                  const displayVersionAsset =
                    primaryAssets[0] || latestVersionAsset;
                  const displayVersionNumber = displayVersionAsset
                    ? getVersion(displayVersionAsset)
                    : latestVersionNumber;
                  const hasMultipleVersions = versionGroups.length > 1;
                  const handleVersionBadgeClick = () => {
                    if (!hasMultipleVersions) {
                      return;
                    }
                    setCardVersionIndices((prev) => {
                      const currentIndex = prev[cardKey] ?? 0;
                      const nextIndex =
                        ((currentIndex % versionGroups.length) + 1) %
                        versionGroups.length;
                      return { ...prev, [cardKey]: nextIndex };
                    });
                  };
                  const isExpanded = !!expandedRequests[cardKey];
                  const replacementAssets = statusAssets.filter((asset) => {
                    const request = asset?.replacementRequest;
                    return request && typeof request.note === 'string' && request.note.trim();
                  });
                  const replacementSummary = (() => {
                    if (!replacementAssets.length) return null;
                    const entries = replacementAssets
                      .map((asset) => {
                        const request = asset.replacementRequest || {};
                        const note = (request.note || '').trim();
                        if (!note) return null;
                        const requestedAt = toDateSafe(request.requestedAt);
                        const info = parseAdFilename(asset.filename || '');
                        const aspect = info.aspectRatio || asset.aspectRatio || '';
                        const assetLabel = aspect
                          ? aspect.toUpperCase()
                          : asset.filename || '';
                        return {
                          note,
                          requestedBy:
                            request.requestedBy ||
                            request.requestedByEmail ||
                            request.requestedById ||
                            '',
                          requestedAt: requestedAt || null,
                          assetLabel,
                        };
                      })
                      .filter(Boolean);
                    if (!entries.length) return null;
                    entries.sort(
                      (a, b) =>
                        (b.requestedAt?.getTime?.() || 0) -
                        (a.requestedAt?.getTime?.() || 0),
                    );
                    const labels = Array.from(
                      new Set(entries.map((entry) => entry.assetLabel).filter(Boolean)),
                    );
                    return {
                      note: entries[0].note,
                      requestedBy: entries[0].requestedBy,
                      requestedAt: entries[0].requestedAt,
                      assetLabels: labels,
                      total: entries.length,
                    };
                  })();
                  const replacementState = replacementForms[cardKey] || {};
                  const replacementDraftNote =
                    replacementState.note !== undefined
                      ? replacementState.note
                      : replacementSummary?.note || '';
                  const replacementOriginalNote =
                    replacementState.originalNote !== undefined
                      ? replacementState.originalNote
                      : replacementSummary?.note || '';
                  const replacementOpen = !!replacementState.open;
                  const replacementSaving = !!replacementState.saving;
                  const replacementError = replacementState.error || '';
                  const replacementHasChanges =
                    replacementDraftNote.trim() !== (replacementOriginalNote || '').trim();
                  const isRejectedStatus = statusValue === 'reject';
                  const isRejectCollapsed =
                    isRejectedStatus && !replacementOpen && collapsedRejects[cardKey] !== false;
                  const replacementMetaLine = (() => {
                    if (!replacementSummary) return '';
                    const parts = [];
                    if (replacementSummary.requestedBy) {
                      parts.push(`Logged by ${replacementSummary.requestedBy}`);
                    }
                    if (replacementSummary.requestedAt instanceof Date) {
                      parts.push(
                        replacementSummary.requestedAt.toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      );
                    }
                    if (replacementSummary.assetLabels?.length) {
                      parts.push(
                        `Affects ${replacementSummary.assetLabels
                          .map((label) => label.toUpperCase())
                          .join(', ')}`,
                      );
                    }
                    return parts.join(' • ');
                  })();
                  const replacementSummaryContent = replacementSummary ? (
                    <div className="space-y-2">
                      <span className={REPLACEMENT_BADGE_CLASS}>
                        Replacement requested
                        {replacementSummary.assetLabels?.length ? (
                          <span className="ml-1 text-[10px] font-medium normal-case">
                            {replacementSummary.assetLabels.join(', ')}
                          </span>
                        ) : null}
                      </span>
                      <div className={REPLACEMENT_NOTE_CLASS}>
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {replacementSummary.note}
                        </p>
                        {replacementMetaLine && (
                          <p className={combineClasses('mt-2', REPLACEMENT_META_TEXT_CLASS)}>
                            {replacementMetaLine}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null;
                  const recipeLabel =
                    ad.recipeCode ||
                    parseAdFilename(ad.filename || '').recipeCode ||
                    'Ad Unit';
                  const recipeCode =
                    ad.recipeCode ||
                    parseAdFilename(ad.filename || '').recipeCode ||
                    '';
                  const productName = getProductNameForRecipe(recipeCode);
                  const normalizedRecipeKey = normalizeRecipeCode(recipeCode);
                  const assignedCopyCardId =
                    normalizedRecipeKey && recipeCopyAssignments[normalizedRecipeKey]
                      ? recipeCopyAssignments[normalizedRecipeKey]
                      : null;
                  const assignedCopyCard =
                    assignedCopyCardId && copyCardById[assignedCopyCardId]
                      ? copyCardById[assignedCopyCardId]
                      : null;
                  const productCopyCards = getCopyCardsForProduct(productName);
                  const candidateCopyCards = assignedCopyCard
                    ? [
                        assignedCopyCard,
                        ...productCopyCards.filter(
                          (card) => card && card.id !== assignedCopyCard.id,
                        ),
                      ]
                    : productCopyCards;
                  const hasSquareAsset = sortedAssets.some((asset) =>
                    isSquareAspectRatio(getAssetAspectRatio(asset)),
                  );
                  const showCopyMirror =
                    hasSquareAsset && candidateCopyCards.length > 0;
                  const mapInlineCopyCard = (card) => {
                    if (!card) return null;
                    const primary = normalizeCopyText(card.primary);
                    const headline = normalizeCopyText(card.headline);
                    const description = normalizeCopyText(card.description);
                    return {
                      id: card.id || '',
                      product:
                        card.resolvedProduct ||
                        resolveCopyCardProductName(card) ||
                        productName ||
                        '',
                      primary,
                      headline,
                      description,
                      letter: card.letter || '',
                    };
                  };

                  const assignedInlineCopyCard = mapInlineCopyCard(assignedCopyCard);

                  const fallbackInlineCopyCard =
                    showCopyMirror && !assignedInlineCopyCard
                      ? (() => {
                          for (const card of candidateCopyCards) {
                            if (!card) continue;
                            const mapped = mapInlineCopyCard(card);
                            if (!mapped) continue;
                            if (
                              mapped.primary ||
                              mapped.headline ||
                              mapped.description
                            ) {
                              return mapped;
                            }
                          }
                          return null;
                        })()
                      : null;

                  const baseInlineCopyCard = showCopyMirror
                    ? assignedInlineCopyCard || fallbackInlineCopyCard
                    : null;
                  const squareAssetIndex = sortedAssets.findIndex(
                    (asset) =>
                      normalizeAspectKey(getAssetAspectRatio(asset)) === '1x1',
                  );
                  const squareAsset =
                    squareAssetIndex >= 0 ? sortedAssets[squareAssetIndex] : null;
                  const assetOverrideRaw = squareAsset?.platformCopyOverride || null;
                  const assetOverride = assetOverrideRaw
                    ? {
                        primary: normalizeCopyText(assetOverrideRaw.primary),
                        headline: normalizeCopyText(assetOverrideRaw.headline),
                        description: normalizeCopyText(assetOverrideRaw.description),
                      }
                    : null;
                  const inlineCopyCard = assetOverride
                    ? {
                        ...(baseInlineCopyCard || {
                          id: '',
                          product: productName || '',
                          letter: '',
                        }),
                        ...assetOverride,
                      }
                    : baseInlineCopyCard;
                  const shouldRenderInlineCopy =
                    !!inlineCopyCard && squareAssetIndex !== -1;
                  const inlineCopyEditorState = inlineCopyDrafts[cardKey];
                  const isEditingInlineCopy = !!inlineCopyEditorState?.editing;
                  const inlineCopySaving = !!inlineCopyEditorState?.saving;
                  const inlineCopyDraft =
                    (isEditingInlineCopy && inlineCopyEditorState?.draft) ||
                    inlineCopyCard;
                  const inlineCopyMeta = inlineCopyEditorState?.meta || {};
                  const inlineCopyValues = inlineCopyDraft || null;
                  const inlineCopyHasContent = !!(
                    inlineCopyValues &&
                    (inlineCopyValues.primary ||
                      inlineCopyValues.headline ||
                      inlineCopyValues.description)
                  );
                  const shouldShowInlineCopySection =
                    shouldRenderInlineCopy &&
                    (isEditingInlineCopy || inlineCopyHasContent);
                  const normalizedInlineCopyValues = inlineCopyValues || {
                    primary: '',
                    headline: '',
                    description: '',
                  };
                  const inlineCopyHasChanges = isEditingInlineCopy
                    ? normalizedInlineCopyValues.primary !==
                        (inlineCopyCard?.primary || '') ||
                      normalizedInlineCopyValues.headline !==
                        (inlineCopyCard?.headline || '') ||
                      normalizedInlineCopyValues.description !==
                        (inlineCopyCard?.description || '')
                    : false;
                  const selectId = `ad-status-${cardKey}`;
                  const handleStartInlineCopyEdit = () => {
                    if (isGroupReviewed) return;
                    if (inlineCopyDrafts[cardKey]?.editing) return;
                    const source = inlineCopyCard || baseInlineCopyCard;
                    const initial = {
                      id: source?.id || '',
                      product: source?.product || productName || '',
                      primary: source?.primary || '',
                      headline: source?.headline || '',
                      description: source?.description || '',
                    };
                    setInlineCopyDrafts((prev) => ({
                      ...prev,
                      [cardKey]: {
                        editing: true,
                        saving: false,
                        draft: {
                          primary: initial.primary,
                          headline: initial.headline,
                          description: initial.description,
                        },
                        meta: {
                          id: initial.id,
                          product: initial.product,
                        },
                      },
                    }));
                  };
                  const handleInlineCopyDraftChange = (field, value) => {
                    setInlineCopyDrafts((prev) => {
                      const current = prev[cardKey];
                      if (!current) return prev;
                      return {
                        ...prev,
                        [cardKey]: {
                          ...current,
                          draft: {
                            ...current.draft,
                            [field]: value,
                          },
                        },
                      };
                    });
                  };
                  const handleCancelInlineCopyEdit = () => {
                    setInlineCopyDrafts((prev) => {
                      const next = { ...prev };
                      delete next[cardKey];
                      return next;
                    });
                  };
                  const handleSaveInlineCopy = async (mode) => {
                    const currentState = inlineCopyDrafts[cardKey];
                    if (!currentState) return;
                    const applyToAll = mode === 'all';
                    const applyToAdOnly = mode === 'single';
                    if (!applyToAll && !applyToAdOnly) return;
                    setInlineCopyModalContext(null);
                    const fallbackState = {
                      ...currentState,
                      draft: { ...currentState.draft },
                      meta: { ...currentState.meta },
                      saving: false,
                    };
                    const draftValues = {
                      primary: currentState.draft.primary || '',
                      headline: currentState.draft.headline || '',
                      description: currentState.draft.description || '',
                    };
                    setInlineCopyDrafts((prev) => ({
                      ...prev,
                      [cardKey]: { ...prev[cardKey], saving: true },
                    }));
                    try {
                      if (applyToAll) {
                        await saveInlineCopyCard({
                          id: inlineCopyCard?.id || inlineCopyMeta.id || '',
                          primary: draftValues.primary,
                          headline: draftValues.headline,
                          description: draftValues.description,
                          product:
                            inlineCopyCard?.product ||
                            inlineCopyMeta.product ||
                            productName ||
                            '',
                        });
                        if (squareAsset) {
                          await clearInlineCopyOverride(squareAsset);
                        }
                      } else if (applyToAdOnly) {
                        if (squareAsset) {
                          await saveInlineCopyOverride(squareAsset, draftValues);
                        } else {
                          console.warn(
                            'No square asset available for ad-specific platform copy update',
                          );
                        }
                      }
                      setInlineCopyDrafts((prev) => {
                        const next = { ...prev };
                        delete next[cardKey];
                        return next;
                      });
                    } catch (err) {
                      console.error('Failed to save inline platform copy', err);
                      setInlineCopyDrafts((prev) => ({
                        ...prev,
                        [cardKey]: fallbackState,
                      }));
                    }
                  };
                  const handleOpenInlineCopyModal = () => {
                    if (!inlineCopyHasChanges || inlineCopySaving) return;
                    setInlineCopyModalContext({
                      onSelect: (mode) => handleSaveInlineCopy(mode),
                    });
                  };

                  const baseEditButtonClasses = isMobile
                    ? 'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200'
                    : 'inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 dark:border-[var(--border-color-default)] dark:bg-transparent dark:text-gray-200';

                  const editButtonStateClass = isGroupReviewed
                    ? 'opacity-60 cursor-not-allowed'
                    : isMobile
                    ? 'hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]'
                    : 'hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-bg)]';

                  const editActionButtonClass = `${baseEditButtonClasses} ${editButtonStateClass}`;

                  const showDetailsButtonClass = baseEditButtonClasses;
                  const requestReplacementButtonClass = isMobile
                    ? 'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-[var(--accent-color)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-white dark:focus-visible:ring-offset-[var(--dark-sidebar-bg)] disabled:cursor-not-allowed disabled:opacity-60'
                    : 'inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--accent-color)] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-white dark:focus-visible:ring-offset-[var(--dark-sidebar-bg)] disabled:cursor-not-allowed disabled:opacity-60';

                  const renderInlineCopyBlock = (assetElement) => {
                    if (!shouldShowInlineCopySection) {
                      return assetElement;
                    }

                    return (
                      <div className="flex w-full flex-col gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
                          <p className="m-0 text-[8px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                            Primary copy
                          </p>
                          {isEditingInlineCopy ? (
                            <textarea
                              value={normalizedInlineCopyValues.primary}
                              onChange={(event) =>
                                handleInlineCopyDraftChange('primary', event.target.value)
                              }
                              rows={3}
                              disabled={inlineCopySaving}
                              className="mt-0.5 w-full rounded-lg border border-gray-300 p-2 text-sm leading-snug focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-100"
                            />
                          ) : (
                            <p className="m-0 whitespace-pre-wrap break-words text-sm leading-snug text-gray-900 dark:text-[var(--dark-text)]">
                              {normalizedInlineCopyValues.primary || '—'}
                            </p>
                          )}
                        </div>
                        {assetElement}
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
                          <div>
                            <p className="m-0 text-[8px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                              Headline
                            </p>
                            {isEditingInlineCopy ? (
                              <textarea
                                value={normalizedInlineCopyValues.headline}
                                onChange={(event) =>
                                  handleInlineCopyDraftChange('headline', event.target.value)
                                }
                              rows={2}
                              disabled={inlineCopySaving}
                              className="mt-0.5 w-full rounded-lg border border-gray-300 p-2 text-sm leading-snug focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-100"
                            />
                          ) : (
                            <p className="m-0 whitespace-pre-wrap break-words text-sm font-semibold leading-snug text-gray-900 dark:text-[var(--dark-text)]">
                              {normalizedInlineCopyValues.headline || '—'}
                            </p>
                          )}
                          </div>
                          <div className="mt-2">
                            <p className="m-0 text-[8px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                              Description
                            </p>
                            {isEditingInlineCopy ? (
                              <textarea
                                value={normalizedInlineCopyValues.description}
                                onChange={(event) =>
                                  handleInlineCopyDraftChange('description', event.target.value)
                                }
                                rows={2}
                                disabled={inlineCopySaving}
                                className="mt-0.5 w-full rounded-lg border border-gray-300 p-2 text-sm leading-snug focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-100"
                              />
                            ) : (
                              <p className="m-0 whitespace-pre-wrap break-words text-sm leading-snug text-gray-600 dark:text-gray-300">
                                {normalizedInlineCopyValues.description || '—'}
                              </p>
                            )}
                          </div>
                        </div>
                        <div
                          className={`flex flex-wrap gap-2 ${
                            isMobile ? 'w-full' : 'items-center justify-end'
                          }`}
                        >
                          {isEditingInlineCopy ? (
                            <>
                              <button
                                type="button"
                                onClick={handleCancelInlineCopyEdit}
                                disabled={inlineCopySaving}
                                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color-default)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenInlineCopyModal}
                                disabled={!inlineCopyHasChanges || inlineCopySaving}
                                className="inline-flex items-center gap-2 rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-[var(--accent-color-10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--accent-color)] dark:text-[var(--accent-color)] dark:hover:bg-[var(--accent-color-10)]"
                              >
                                {inlineCopySaving ? 'Saving...' : 'Save'}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={handleStartInlineCopyEdit}
                              disabled={isGroupReviewed || !inlineCopyCard}
                              title={
                                isGroupReviewed
                                  ? reviewedLockMessage
                                  : !inlineCopyCard
                                  ? 'No platform copy available to edit'
                                  : undefined
                              }
                              className={`${editActionButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                              aria-disabled={isGroupReviewed || !inlineCopyCard}
                            >
                              <FiEdit3 className="h-4 w-4" aria-hidden="true" />
                              <span>Edit platform copy</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  };
                  const handleReplacementDraftChange = (value) => {
                    setReplacementFormState(cardKey, (prev) => ({
                      ...prev,
                      open: true,
                      note: value,
                      originalNote:
                        prev?.originalNote !== undefined
                          ? prev.originalNote
                          : replacementSummary?.note || '',
                      error: '',
                      saving: false,
                    }));
                  };
                  const handleOpenReplacementForm = () => {
                    setCollapsedRejects((prev) => ({ ...prev, [cardKey]: false }));
                    setReplacementFormState(cardKey, (prev) => ({
                      ...prev,
                      open: true,
                      note:
                        prev?.note !== undefined
                          ? prev.note
                          : replacementSummary?.note || '',
                      originalNote:
                        prev?.originalNote !== undefined
                          ? prev.originalNote
                          : replacementSummary?.note || '',
                      error: '',
                      saving: false,
                    }));
                  };
                  const handleCancelReplacementForm = () => {
                    setReplacementFormState(cardKey, (prev) => ({
                      ...prev,
                      open: false,
                      note:
                        prev?.originalNote !== undefined
                          ? prev.originalNote
                          : replacementSummary?.note || '',
                      originalNote:
                        prev?.originalNote !== undefined
                          ? prev.originalNote
                          : replacementSummary?.note || '',
                      error: '',
                      saving: false,
                    }));
                  };
                  const handleSubmitReplacementForm = async () => {
                    await saveReplacementRequest(
                      cardKey,
                      statusAssets,
                      replacementDraftNote,
                    );
                  };
                  const expandRejectedCard = () => {
                    setCollapsedRejects((prev) => ({ ...prev, [cardKey]: false }));
                  };
                  const collapseRejectedCard = () => {
                    setCollapsedRejects((prev) => ({ ...prev, [cardKey]: true }));
                    setReplacementFormState(cardKey, (prev) =>
                      prev
                        ? {
                            ...prev,
                            open: false,
                            note:
                              prev?.originalNote !== undefined
                                ? prev.originalNote
                                : replacementSummary?.note || '',
                            originalNote:
                              prev?.originalNote !== undefined
                                ? prev.originalNote
                                : replacementSummary?.note || '',
                            error: '',
                            saving: false,
                          }
                        : prev,
                    );
                  };
                  const showReplacementOverlay = isRejectedStatus && replacementOpen;
                  const replacementFormContent = showReplacementOverlay ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]">
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-[var(--dark-text)]">
                            Replacement direction
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            We’ll get started on a new one - just let us know what you have in mind!
                          </p>
                        </div>
                        <textarea
                          value={replacementDraftNote}
                          onChange={(event) => handleReplacementDraftChange(event.target.value)}
                          rows={6}
                          disabled={replacementSaving}
                          className={REPLACEMENT_TEXTAREA_CLASS}
                          placeholder="Share the direction for the replacement creative..."
                        />
                        {replacementError && (
                          <p className="text-sm font-medium text-red-600 dark:text-red-300">
                            {replacementError}
                          </p>
                        )}
                        {replacementSummary && replacementMetaLine && (
                          <p className={REPLACEMENT_META_TEXT_CLASS}>{replacementMetaLine}</p>
                        )}
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            type="button"
                            variant="neutral"
                            size="sm"
                            onClick={handleCancelReplacementForm}
                            disabled={replacementSaving}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="accent"
                            size="sm"
                            onClick={handleSubmitReplacementForm}
                            disabled={replacementSaving || !replacementDraftNote.trim()}
                          >
                            {replacementSaving ? 'Saving...' : 'Submit'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null;
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

                  const handleOpenEditModal = (mode) => {
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
                      mode,
                      initialComment: '',
                      initialCopy: resolvedExistingCopy,
                    });
                  };

                  if (isMobile) {
                    if (isRejectedStatus && isRejectCollapsed) {
                      return (
                        <div
                          key={cardKey}
                          className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
                        >
                          <div className="flex flex-col gap-4 p-4">
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-2">
                                  <h3 className="text-lg font-semibold leading-tight text-gray-900 dark:text-[var(--dark-text)]">
                                    {recipeLabel}
                                  </h3>
                                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--reject-color)]">
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full"
                                      style={statusDotStyles.reject}
                                    />
                                    <span>Rejected</span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <button
                                    type="button"
                                    onClick={expandRejectedCard}
                                    className={showDetailsButtonClass}
                                  >
                                    Show ad details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleOpenReplacementForm}
                                    className={requestReplacementButtonClass}
                                  >
                                    Request replacement
                                  </button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Provide updated direction for a new creative or reopen the ad to review the assets again.
                              </p>
                              {replacementSummaryContent}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const assetCount = sortedAssets.length;
                    const statusLabel = statusLabelMap[statusValue] || statusValue;

                    return (
                      <div
                        key={cardKey}
                        className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
                      >
                        <div className="flex flex-col gap-4 p-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-lg font-semibold leading-tight text-gray-900 dark:text-[var(--dark-text)]">
                                {recipeLabel}
                              </h3>
                              {latestVersionNumber > 1 ? (
                                hasMultipleVersions ? (
                                  <InfoTooltip text="Toggle between versions" placement="bottom">
                                    <button
                                      type="button"
                                      onClick={handleVersionBadgeClick}
                                      className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-bg)] dark:focus:ring-offset-gray-900"
                                      aria-label={`Toggle version (currently V${displayVersionNumber || latestVersionNumber || ''})`}
                                    >
                                      V{displayVersionNumber || latestVersionNumber}
                                    </button>
                                  </InfoTooltip>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                                    V{displayVersionNumber || latestVersionNumber}
                                  </span>
                                )
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={statusDotStyles[statusValue] || statusDotStyles.pending}
                              />
                              <span className="font-medium">{statusLabel}</span>
                            </div>
                          </div>
                          {replacementSummaryContent && !showReplacementOverlay && (
                            <div>{replacementSummaryContent}</div>
                          )}
                          {showReplacementOverlay ? (
                            replacementFormContent
                          ) : (
                            <div
                              className={combineClasses(
                                `flex w-full gap-3 overflow-x-auto pb-1 ${
                                  assetCount > 1 ? 'snap-x snap-mandatory' : ''
                                }`,
                              )}
                            >
                              {sortedAssets.map((asset, assetIdx) => {
                              const assetUrl = asset.firebaseUrl || asset.adUrl || '';
                              const assetAspect = getAssetAspectRatio(asset);
                              const assetCssAspect = getCssAspectRatioValue(assetAspect);
                              const assetStyle = assetCssAspect
                                ? { aspectRatio: assetCssAspect }
                                : {};
                              const assetKey =
                                getAssetDocumentId(asset) || assetUrl || assetIdx;
                              const wrapperClasses = [
                                'flex w-full flex-col',
                                assetCount > 1
                                  ? 'min-w-full flex-shrink-0 snap-center'
                                  : '',
                                shouldRenderInlineCopy && assetIdx === squareAssetIndex
                                  ? 'gap-3'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ');
                              const assetNode = (
                                <div
                                  className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
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
                                  {assetCount > 1 && (
                                    <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                                      {assetIdx + 1}/{assetCount}
                                    </div>
                                  )}
                                </div>
                              );
                              if (shouldRenderInlineCopy && assetIdx === squareAssetIndex) {
                                return (
                                  <div key={assetKey} className={wrapperClasses}>
                                    {renderInlineCopyBlock(assetNode)}
                                  </div>
                                );
                              }
                              return (
                                <div key={assetKey} className={wrapperClasses}>
                                  {assetNode}
                                </div>
                              );
                              })}
                            </div>
                          )}
                          <div className="space-y-3">
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]">
                              <label
                                htmlFor={selectId}
                                className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300"
                              >
                                Update status
                              </label>
                              <select
                                id={selectId}
                                aria-label="Status"
                                className={`mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 dark:focus:border-[var(--accent-color)] dark:focus:ring-[var(--accent-color)] ${
                                  isGroupReviewed ? 'cursor-not-allowed opacity-60' : ''
                                }`}
                                value={statusValue}
                                onChange={handleSelectChange}
                                disabled={submitting || isGroupReviewed}
                              >
                                {statusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {showEditButton && (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
                                  onClick={() =>
                                    setExpandedRequests((prev) => ({
                                      ...prev,
                                      [cardKey]: !prev[cardKey],
                                    }))
                                  }
                                >
                                  {isExpanded ? 'Hide edit request' : 'View edit request'}
                                </button>
                                {isExpanded && (
                                  <div className="space-y-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                                    <div className="flex flex-col gap-2">
                                      <span
                                        className="inline-flex"
                                        title={
                                          isGroupReviewed ? reviewedLockMessage : undefined
                                        }
                                      >
                                        <button
                                          type="button"
                                          className={editActionButtonClass}
                                          onClick={() => handleOpenEditModal('note')}
                                          disabled={isGroupReviewed}
                                          aria-disabled={isGroupReviewed}
                                        >
                                          <FiPlus className="h-4 w-4" aria-hidden="true" />
                                          <span>Add note</span>
                                        </button>
                                      </span>
                                      <span
                                        className="inline-flex"
                                        title={
                                          isGroupReviewed ? reviewedLockMessage : undefined
                                        }
                                      >
                                        <button
                                          type="button"
                                          className={editActionButtonClass}
                                          onClick={() => handleOpenEditModal('copy')}
                                          disabled={isGroupReviewed}
                                          aria-disabled={isGroupReviewed}
                                        >
                                          <FiEdit3 className="h-4 w-4" aria-hidden="true" />
                                          <span>Edit Copy</span>
                                        </button>
                                      </span>
                                    </div>
                                    {hasEditInfo?.comment && (
                                      <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                          Notes
                                        </h4>
                                        {noteEntries.map((entry, noteIdx) => (
                                          <div key={noteIdx} className="space-y-1">
                                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                                              {entry.body}
                                            </p>
                                            {entry.meta && (
                                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {entry.meta}
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {hasEditInfo?.copyEdit && (
                                      <div className="space-y-1">
                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                          Requested Copy
                                        </h4>
                                        <pre className="whitespace-pre-wrap break-words leading-relaxed">
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
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isRejectedStatus && isRejectCollapsed) {
                    return (
                      <div
                        key={cardKey}
                        className="mx-auto w-full max-w-[712px] rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
                      >
                        <div className="flex flex-col gap-4 p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-2">
                              <h3 className="text-lg font-semibold leading-tight text-gray-900 dark:text-[var(--dark-text)]">
                                {recipeLabel}
                              </h3>
                              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--reject-color)]">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={statusDotStyles.reject}
                                />
                                <span>Rejected</span>
                              </div>
                              {latestVersionNumber > 1 && (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                                  V{displayVersionNumber || latestVersionNumber}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={expandRejectedCard}
                                className={showDetailsButtonClass}
                              >
                                Show ad details
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenReplacementForm}
                                className={requestReplacementButtonClass}
                              >
                                Request replacement
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Provide replacement direction so the team can deliver a new creative.
                          </p>
                          {replacementSummaryContent}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={cardKey}
                      className="mx-auto w-full max-w-[712px] rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]"
                    >
                      <div className="flex flex-col gap-4 p-5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="mb-0 text-lg font-semibold leading-tight text-gray-900 dark:text-[var(--dark-text)]">
                              {recipeLabel}
                            </h3>
                            {latestVersionNumber > 1 ? (
                              hasMultipleVersions ? (
                                <InfoTooltip text="Toggle between versions" placement="bottom">
                                  <button
                                    type="button"
                                    onClick={handleVersionBadgeClick}
                                    className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-bg)] dark:focus:ring-offset-gray-900"
                                    aria-label={`Toggle version (currently V${displayVersionNumber || latestVersionNumber || ''})`}
                                  >
                                    V{displayVersionNumber || latestVersionNumber}
                                  </button>
                                </InfoTooltip>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                                  V{displayVersionNumber || latestVersionNumber}
                                </span>
                              )
                            ) : null}
                          </div>
                        </div>
                        {replacementSummaryContent && !showReplacementOverlay && (
                          <div>{replacementSummaryContent}</div>
                        )}
                        {showReplacementOverlay ? (
                          <div className="space-y-4">{replacementFormContent}</div>
                        ) : (
                          <div className="space-y-4">
                            <div
                              className={`grid items-start gap-3 ${
                                sortedAssets.length > 1 ? 'sm:grid-cols-2' : ''
                              }`}
                            >
                              {sortedAssets.map((asset, assetIdx) => {
                              const assetUrl = asset.firebaseUrl || asset.adUrl || '';
                              const assetAspect = getAssetAspectRatio(asset);
                              const assetCssAspect = getCssAspectRatioValue(assetAspect);
                              const assetStyle = assetCssAspect
                                ? { aspectRatio: assetCssAspect }
                                : {};
                              const assetKey =
                                getAssetDocumentId(asset) || assetUrl || assetIdx;
                              const isSquareAsset = shouldRenderInlineCopy &&
                                assetIdx === squareAssetIndex;
                              const wrapperClasses = [
                                'flex w-full flex-col self-start',
                                isSquareAsset ? 'gap-3' : '',
                              ]
                                .filter(Boolean)
                                .join(' ');
                              const assetNode = (
                                <div className="mx-auto w-full max-w-[712px] overflow-hidden rounded-lg sm:mx-0">
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
                              if (isSquareAsset) {
                                return (
                                  <div key={assetKey} className={wrapperClasses}>
                                    {renderInlineCopyBlock(assetNode)}
                                  </div>
                                );
                              }
                              return (
                                <div key={assetKey} className={wrapperClasses}>
                                  {assetNode}
                                </div>
                              );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-[var(--border-color-default)] sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={statusDotStyles[statusValue] || statusDotStyles.pending}
                              />
                              <div
                                className="flex items-center gap-2"
                                title={isGroupReviewed ? reviewedLockMessage : undefined}
                              >
                                <select
                                  id={selectId}
                                  aria-label="Status"
                                  className={`min-w-[160px] ${
                                    isGroupReviewed ? 'cursor-not-allowed opacity-60' : ''
                                  }`}
                                  value={statusValue}
                                  onChange={handleSelectChange}
                                  disabled={submitting || isGroupReviewed}
                                >
                                  {statusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {isRejectedStatus && (
                                  <Button
                                    type="button"
                                    variant="action"
                                    size="sm"
                                    className="text-xs font-medium"
                                    onClick={collapseRejectedCard}
                                  >
                                    Hide ad details
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          {showEditButton && (
                            <Button
                              type="button"
                              variant="action"
                              size="sm"
                              className="text-sm font-medium"
                              onClick={() =>
                                setExpandedRequests((prev) => ({
                                  ...prev,
                                  [cardKey]: !prev[cardKey],
                                }))
                              }
                            >
                              {isExpanded ? 'Hide edit request' : 'View edit request'}
                            </Button>
                          )}
                        </div>
                        {showEditButton && isExpanded && (
                          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <span
                                className="inline-flex"
                                title={isGroupReviewed ? reviewedLockMessage : undefined}
                              >
                                <button
                                  type="button"
                                  className={editActionButtonClass}
                                  onClick={() => handleOpenEditModal('note')}
                                  disabled={isGroupReviewed}
                                  aria-disabled={isGroupReviewed}
                                >
                                  <FiPlus className="h-4 w-4" aria-hidden="true" />
                                  <span>Add note</span>
                                </button>
                              </span>
                              <span
                                className="inline-flex"
                                title={isGroupReviewed ? reviewedLockMessage : undefined}
                              >
                                <button
                                  type="button"
                                  className={editActionButtonClass}
                                  onClick={() => handleOpenEditModal('copy')}
                                  disabled={isGroupReviewed}
                                  aria-disabled={isGroupReviewed}
                                >
                                  <FiEdit3 className="h-4 w-4" aria-hidden="true" />
                                  <span>Edit Copy</span>
                                </button>
                              </span>
                            </div>
                            {hasEditInfo?.comment && (
                              <div className="mb-3">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                                  Notes
                                </h4>
                                {noteEntries.map((entry, noteIdx) => (
                                  <div key={noteIdx} className="mb-2 last:mb-0">
                                    <p className="whitespace-pre-wrap leading-relaxed break-words">
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
                                <pre className="whitespace-pre-wrap leading-relaxed break-words">
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
              <div className="mt-6 px-4 pt-8 pb-12 text-center text-sm text-gray-500 dark:text-gray-300">
                <p className="mb-2">Thank you for taking the time to review these!</p>
                <p className="mb-0">
                  When you are all set, just click Finalize Review so we can keep things moving.
                </p>
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
  {hasDisplayVersion && (
    hasMultipleVersions ? (
      versions.length === 2 ? (
        <span
          onClick={() =>
            setVersionIndex((i) => (i + 1) % versions.length)
          }
          className="version-badge cursor-pointer"
        >
          V{displayVersion}
        </span>
      ) : (
        <div className="absolute top-0 left-0">
          <span
            onClick={() => setShowVersionMenu((o) => !o)}
            className="version-badge cursor-pointer select-none"
          >
            V{displayVersion}
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
      <span className="version-badge">V{displayVersion}</span>
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
      {showCopyModal && renderCopyModal()}
      {inlineCopyModalContext && (
        <Modal sizeClass="max-w-md w-full">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-[var(--dark-text)]">
            Apply platform copy changes
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            This copy is automatically applied to all ads for the same product. Choose how you'd like to apply your updates.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setInlineCopyModalContext(null)}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200 dark:hover:bg-[var(--dark-sidebar-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => inlineCopyModalContext?.onSelect?.('all')}
              className="inline-flex items-center justify-center rounded-md bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:bg-[var(--accent-color)] dark:hover:bg-[var(--accent-color-10)]"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => inlineCopyModalContext?.onSelect?.('single')}
              className="inline-flex items-center justify-center rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-[var(--accent-color-10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--accent-color)] dark:text-[var(--accent-color)] dark:hover:bg-[var(--accent-color-10)]"
            >
              Just this ad
            </button>
          </div>
        </Modal>
      )}
      {showHelpdeskModal && (
        <HelpdeskModal
          brandCode={helpdeskBrandCode}
          groupId={groupId || ''}
          reviewerName={resolvedReviewerName || reviewerIdentifier}
          user={user}
          tickets={helpdeskTickets}
          onClose={() => setShowHelpdeskModal(false)}
          onTicketViewed={() => setHelpdeskReadVersion((value) => value + 1)}
        />
      )}
    </div>
  );
});

export default Review;
