// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  FiEye,
  FiClock,
  FiTrash,
  FiRefreshCw,
  FiCheckCircle,
  FiShare2,
  FiSend,
  FiUpload,
  FiBookOpen,
  FiFileText,
  FiFolder,
  FiArchive,
  FiDownload,
  FiRotateCcw,
  FiRotateCw,
  FiBarChart2,
  FiFile,
  FiPenTool,
  FiType,
  FiCopy,
  FiPlus,
  FiGrid,
  FiMoreHorizontal,
  FiMessageSquare,
  FiAlertTriangle,
  FiPlay,
} from "react-icons/fi";
import { Bubbles } from "lucide-react";
import { FaMagic } from "react-icons/fa";
import RecipePreview from "./RecipePreview.jsx";
import CopyRecipePreview from "./CopyRecipePreview.jsx";
import BrandAssets from "./BrandAssets.jsx";
import BrandAssetsLayout from "./BrandAssetsLayout.jsx";
import { Link, useParams, useLocation } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  arrayUnion,
  Timestamp,
  deleteField,
  documentId,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase/config";
import useUserRole from "./useUserRole";
import createArchiveTicket from "./utils/createArchiveTicket";
import { uploadFile } from "./uploadFile";
import ShareLinkModal from "./components/ShareLinkModal.jsx";
import GalleryModal from "./components/GalleryModal.jsx";
import parseAdFilename from "./utils/parseAdFilename";
import StatusBadge from "./components/StatusBadge.jsx";
import LoadingOverlay from "./LoadingOverlay";
import OptimizedImage from "./components/OptimizedImage.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
import isVideoUrl from "./utils/isVideoUrl";
import pickHeroAsset from "./utils/pickHeroAsset";
import computeGroupStatus from "./utils/computeGroupStatus";
import diffWords from "./utils/diffWords";
import Modal from "./components/Modal.jsx";
import sortCopyCards from "./utils/sortCopyCards";
import IconButton from "./components/IconButton.jsx";
import Button from "./components/Button.jsx";
import TabButton from "./components/TabButton.jsx";
import Table from "./components/common/Table";
import stripVersion from "./utils/stripVersion";
import summarizeByRecipe from "./utils/summarizeByRecipe";
import aggregateRecipeStatusCounts from "./utils/aggregateRecipeStatusCounts";
import FeedbackPanel from "./components/FeedbackPanel.jsx";
import detectMissingRatios from "./utils/detectMissingRatios";
import notifySlackStatusChange from "./utils/notifySlackStatusChange";
import { getCopyLetter } from "./utils/copyLetter";
import buildFeedbackEntries, {
  buildFeedbackEntriesForGroup,
} from "./utils/buildFeedbackEntries";

const fileExt = (name) => {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
};

const PlaceholderIcon = ({ ext }) => {
  let Icon = FiFile;
  if (ext === "ai") Icon = FiPenTool;
  else if (ext === "pdf") Icon = FiFileText;
  else if (["otf", "ttf", "woff", "woff2"].includes(ext)) Icon = FiType;
  return (
    <div className="w-40 h-32 flex items-center justify-center bg-accent-10 text-accent rounded">
      <Icon size={32} />
    </div>
  );
};

const ExpandableText = ({ value, maxLength = 40, isLink = false }) => {
  const [expanded, setExpanded] = useState(false);
  if (value == null) return null;
  const str = String(value);
  const tooLong = str.length > maxLength;
  const display = expanded || !tooLong ? str : str.slice(0, maxLength) + "...";
  const handleClick = () => {
    if (tooLong) setExpanded((p) => !p);
  };
  return isLink ? (
    <a
      href={str}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:underline"
    >
      <span onClick={handleClick} className="cursor-pointer">
        {display}
      </span>
    </a>
  ) : (
    <span onClick={handleClick} className={tooLong ? "cursor-pointer" : ""}>
      {display}
    </span>
  );
};

const createRenderCopyEditDiff = (meta = {}) =>
  (recipeCode, edit, origOverride) => {
    const metaKey = recipeCode ? String(recipeCode) : "";
    const normalizedKey = metaKey.toLowerCase();
    const recipeMeta =
      (metaKey && meta[metaKey]) ||
      (normalizedKey && meta[normalizedKey]) ||
      null;
    const baseCopy =
      origOverride ??
      recipeMeta?.copy ??
      recipeMeta?.latestCopy ??
      "";
    if (!edit || edit === baseCopy) return null;
    const diff = diffWords(baseCopy, edit);
    return diff.map((p, i) => {
      const text = p.text ?? p.value ?? "";
      const type =
        p.type ?? (p.added ? "added" : p.removed ? "removed" : "same");
      const space = i < diff.length - 1 ? " " : "";
      if (type === "removed")
        return (
          <span key={i} className="text-red-600 line-through">
            {text}
            {space}
          </span>
        );
      if (type === "same") return text + space;
      return (
        <span key={i} className="text-green-600 italic">
          {text}
          {space}
        </span>
      );
    });
  };

const flattenRichText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((child) => flattenRichText(child)).join('');
  }
  if (React.isValidElement(value)) {
    return flattenRichText(value.props?.children);
  }
  if (value && typeof value === 'object' && 'props' in value) {
    return flattenRichText(value.props.children);
  }
  return '';
};

const summaryInlineTokenPattern = /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^\)]+\)/;

const renderInlineSummarySegments = (text, keyPrefix = 'segment') => {
  if (!text) return [];
  const nodes = [];
  let remaining = text;
  let index = 0;
  while (remaining.length > 0) {
    const matchIndex = remaining.search(summaryInlineTokenPattern);
    if (matchIndex === -1) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-${index}`}>{remaining}</React.Fragment>,
      );
      break;
    }
    if (matchIndex > 0) {
      const plain = remaining.slice(0, matchIndex);
      nodes.push(
        <React.Fragment key={`${keyPrefix}-${index}`}>{plain}</React.Fragment>,
      );
      index += 1;
      remaining = remaining.slice(matchIndex);
      continue;
    }
    const match = remaining.match(summaryInlineTokenPattern);
    if (!match) break;
    const token = match[0];
    const nextIndex = index + 1;
    if (token.startsWith('**')) {
      const content = token.slice(2, -2);
      nodes.push(
        <strong key={`${keyPrefix}-${index}`}>{renderInlineSummarySegments(content, `${keyPrefix}-${index}-strong`)}</strong>,
      );
    } else if (token.startsWith('*')) {
      const content = token.slice(1, -1);
      nodes.push(
        <em key={`${keyPrefix}-${index}`}>{renderInlineSummarySegments(content, `${keyPrefix}-${index}-em`)}</em>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-${index}`}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const [, label, url] = token.match(/\[([^\]]+)\]\(([^)]+)\)/) || [];
      const safeLabel = label || url || '';
      nodes.push(
        <a
          key={`${keyPrefix}-${index}`}
          href={url || '#'}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-color)] underline"
        >
          {renderInlineSummarySegments(safeLabel, `${keyPrefix}-${index}-link`)}
        </a>,
      );
    }
    index = nextIndex;
    remaining = remaining.slice(token.length);
  }
  return nodes;
};

const parseSummaryMarkdown = (raw = '') => {
  const text = typeof raw === 'string' ? raw : String(raw || '');
  if (!text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let currentList = null;
  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2].trim() });
      return;
    }
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushList();
      blocks.push({ type: 'quote', content: quoteMatch[1].trim() });
      return;
    }
    const dividerMatch = trimmed.replace(/\s+/g, '').match(/^([-*_])\1{2,}$/);
    if (dividerMatch) {
      flushList();
      blocks.push({ type: 'divider' });
      return;
    }
    const orderedMatch = trimmed.match(/^(\d+)[\.)]\s+(.*)$/);
    if (orderedMatch) {
      if (!currentList || currentList.kind !== 'ordered') {
        flushList();
        currentList = { type: 'list', kind: 'ordered', items: [] };
      }
      currentList.items.push(orderedMatch[2].trim());
      return;
    }
    const bulletMatch = trimmed.match(/^([-*+])\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList || currentList.kind !== 'bullet') {
        flushList();
        currentList = { type: 'list', kind: 'bullet', items: [] };
      }
      currentList.items.push(bulletMatch[2].trim());
      return;
    }
    flushList();
    blocks.push({ type: 'paragraph', content: trimmed });
  });

  flushList();
  return blocks;
};

const renderSummaryBlocks = (blocks = []) =>
  blocks.map((block, index) => {
    if (!block) return null;
    if (block.type === 'heading') {
      const HeadingTag = block.level <= 2 ? 'h4' : 'h5';
      return (
        <HeadingTag
          key={`summary-heading-${index}`}
          className="text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          {renderInlineSummarySegments(block.content, `summary-heading-${index}`)}
        </HeadingTag>
      );
    }
    if (block.type === 'list') {
      const ListTag = block.kind === 'ordered' ? 'ol' : 'ul';
      return (
        <ListTag
          key={`summary-list-${index}`}
          className={`${block.kind === 'ordered' ? 'list-decimal' : 'list-disc'} ml-5 space-y-1 text-sm text-gray-700 dark:text-gray-200`}
        >
          {(block.items || []).map((item, itemIndex) => (
            <li key={`summary-list-${index}-${itemIndex}`}>
              {renderInlineSummarySegments(item, `summary-list-${index}-${itemIndex}`)}
            </li>
          ))}
        </ListTag>
      );
    }
    if (block.type === 'quote') {
      return (
        <blockquote
          key={`summary-quote-${index}`}
          className="border-l-2 border-gray-200 pl-4 italic text-gray-600 dark:border-gray-700 dark:text-gray-300"
        >
          {renderInlineSummarySegments(block.content, `summary-quote-${index}`)}
        </blockquote>
      );
    }
    if (block.type === 'divider') {
      return <hr key={`summary-divider-${index}`} className="border-gray-200 dark:border-gray-700" />;
    }
    return (
      <p key={`summary-paragraph-${index}`} className="text-sm text-gray-700 dark:text-gray-200">
        {renderInlineSummarySegments(block.content, `summary-paragraph-${index}`)}
      </p>
    );
  }).filter(Boolean);

const normalizeId = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^0+/, "")
    .toLowerCase();

const normalizeKeyPart = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value);
};

const normalizeRecipeCode = (value) => {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return "";
  const trimmed = normalized.replace(/^0+/, "");
  return trimmed || (normalized.includes("0") ? "0" : normalized);
};

const normalizeProductKey = (value) => {
  const normalized = normalizeKeyPart(value).toLowerCase();
  if (!normalized) return "";
  const withoutLeadingZeros = normalized.replace(/^0+/, "");
  return withoutLeadingZeros || (normalized.includes("0") ? "0" : normalized);
};

const extractCopyCardProductValue = (value) => {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = extractCopyCardProductValue(entry);
      if (normalized) return normalized;
    }
    return "";
  }
  if (typeof value === "object") {
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
    return "";
  }
  return normalizeKeyPart(value);
};

const resolveCopyCardProductName = (card) => {
  if (!card) return "";
  if (typeof card !== "object") {
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
    card.metadata?.product,
    card.metadata?.productName,
    card.metadata?.product?.name,
    card.details?.product,
    card.details?.productName,
    card.details?.product?.name,
  ];
  for (const candidate of candidates) {
    const normalized = extractCopyCardProductValue(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const resolveRecipeProductName = (recipe) => {
  if (!recipe || typeof recipe !== "object") return "";
  const candidates = [
    recipe.product?.name,
    recipe.product,
    recipe.productName,
    recipe.productLabel,
    recipe.components?.["product.name"],
    recipe.components?.product?.name,
    recipe.components?.product?.title,
    recipe.metadata?.product?.name,
    recipe.metadata?.productName,
    recipe.details?.product?.name,
    recipe.details?.productName,
  ];
  for (const candidate of candidates) {
    const normalized = extractCopyCardProductValue(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const DESIGNER_EDITABLE_STATUSES = [
  "pending",
  "edit_requested",
  "ready",
  "archived",
];

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [brandName, setBrandName] = useState("");
  const [brandGuidelines, setBrandGuidelines] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brandNotes, setBrandNotes] = useState([]);
  const [brandHasAgency, setBrandHasAgency] = useState(false);
  const [assets, setAssets] = useState([]);
  const [briefAssets, setBriefAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [designLoading, setDesignLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [historyRecipe, setHistoryRecipe] = useState(null);
  const [historyAsset, setHistoryAsset] = useState(null);
  const [recipesMeta, setRecipesMeta] = useState({});
  const hasRecipes = useMemo(
    () => Object.keys(recipesMeta).length > 0,
    [recipesMeta],
  );
  const [previewAsset, setPreviewAsset] = useState(null);
  const previewUrl =
    previewAsset?.firebaseUrl ||
    previewAsset?.thumbnailUrl ||
    previewAsset?.cdnUrl ||
    "";
  const previewIsVideo = previewUrl ? isVideoUrl(previewUrl) : false;
  const hasScrubbed = useMemo(
    () => assets.some((a) => a.scrubbedFrom),
    [assets],
  );
  const [metadataRecipe, setMetadataRecipe] = useState(null);
  const [metadataForm, setMetadataForm] = useState({
    copy: "",
  });
  const [exportModal, setExportModal] = useState(false);
  const [groupBy, setGroupBy] = useState([]);
  const [maxAds, setMaxAds] = useState(1);
  const [previewGroups, setPreviewGroups] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [showRecipesTable, setShowRecipesTable] = useState(false);
  const [copyCards, setCopyCards] = useState([]);
  const [copyAssignments, setCopyAssignments] = useState({});
  const [copyAssignmentSaving, setCopyAssignmentSaving] = useState({});
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [modalCopies, setModalCopies] = useState([]);
  const updateModalCopies = useCallback((next) => {
    if (typeof next === "function") {
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
  const [showBrandAssets, setShowBrandAssets] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [feedback, setFeedback] = useState([]);
  const [responses, setResponses] = useState([]);
  const [feedbackScope, setFeedbackScope] = useState("current");
  const [allFeedbackEntries, setAllFeedbackEntries] = useState([]);
  const [allFeedbackLoading, setAllFeedbackLoading] = useState(false);
  const [tab, setTab] = useState("stats");
  const [blockerText, setBlockerText] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [briefDrag, setBriefDrag] = useState(false);
  const [designers, setDesigners] = useState([]);
  const [designerName, setDesignerName] = useState('');
  const [editors, setEditors] = useState([]);
  const [editorName, setEditorName] = useState('');
  const [revisionModal, setRevisionModal] = useState(null);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [menuRecipe, setMenuRecipe] = useState(null);
  const [inspectRecipe, setInspectRecipe] = useState(null);
  const menuRef = useRef(null);
  const allFeedbackLoadedRef = useRef(false);
  const autoSummaryTriggeredRef = useRef(false);
  const [feedbackSummary, setFeedbackSummary] = useState("");
  const [feedbackSummaryUpdatedAt, setFeedbackSummaryUpdatedAt] = useState(null);
  const [updatingFeedbackSummary, setUpdatingFeedbackSummary] = useState(false);
  const [feedbackSummaryError, setFeedbackSummaryError] = useState("");
  const OPENAI_PROXY_URL = useMemo(
    () =>
      `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/openaiProxy`,
    [],
  );
  let hasApprovedV2 = false;
  const countsRef = useRef(null);
  const slackStatusRef = useRef({
    initialized: false,
    previousStatus: null,
    brandCode: null,
  });
  const { role: userRole } = useUserRole(auth.currentUser?.uid);
  const location = useLocation();
  const isDesigner = userRole === "designer";
  const isAdmin = userRole === "admin";
  const isEditor = userRole === "editor";
  const isProjectManager = userRole === "project-manager";
  const isManager =
    userRole === "manager" ||
    userRole === "editor" ||
    isProjectManager;
  const canManageStaff = isAdmin || (isManager && !isEditor);
  const isAgency = userRole === "agency";
  const isClientPortalUser = ["client", "ops"].includes(userRole) || isProjectManager;
  const usesTabs = isAdmin || isDesigner || isManager || isClientPortalUser;
  const canEditBriefNote = isAdmin || isClientPortalUser;
  const canAddBriefAssets = isAdmin || isClientPortalUser;
  const canManageCopy = isAdmin || isManager || isClientPortalUser;
  const canUploadAds = isAdmin || isDesigner || isAgency;
  const tableVisible = usesTabs ? tab === "ads" : showTable;
  const recipesTableVisible = usesTabs ? tab === "brief" : showRecipesTable;
  const showStats = usesTabs ? (!isClientPortalUser && tab === "stats") : !showTable;

  useEffect(() => {
    if (!isClientPortalUser) return;
    if (!['brief', 'ads', 'copy', 'feedback', 'blocker'].includes(tab)) {
      setTab('brief');
    }
  }, [isClientPortalUser, tab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('exportApproved')) {
      setExportModal(true);
    }
  }, [location.search]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, 'adGroups', id, 'feedback'),
      (snap) => {
        setFeedback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, 'adGroups', id, 'responses'),
      (snap) => {
        setResponses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!group) {
      setFeedbackSummary('');
      setFeedbackSummaryUpdatedAt(null);
      return;
    }
    const summary =
      typeof group.feedbackSummary === 'string' ? group.feedbackSummary : '';
    setFeedbackSummary(summary);
    const updatedAtValue = group.feedbackSummaryUpdatedAt;
    if (updatedAtValue?.toDate) {
      try {
        setFeedbackSummaryUpdatedAt(updatedAtValue.toDate());
      } catch (err) {
        console.error('Failed to parse feedback summary timestamp', err);
        setFeedbackSummaryUpdatedAt(null);
      }
      return;
    }
    if (updatedAtValue instanceof Date) {
      setFeedbackSummaryUpdatedAt(updatedAtValue);
      return;
    }
    if (typeof updatedAtValue === 'number') {
      setFeedbackSummaryUpdatedAt(new Date(updatedAtValue));
      return;
    }
    if (typeof updatedAtValue === 'string') {
      const parsed = new Date(updatedAtValue);
      setFeedbackSummaryUpdatedAt(
        Number.isNaN(parsed.getTime()) ? null : parsed,
      );
      return;
    }
    setFeedbackSummaryUpdatedAt(null);
  }, [group]);

  const renderCopyEditDiff = useMemo(
    () => createRenderCopyEditDiff(recipesMeta),
    [recipesMeta],
  );

  const backPath = useMemo(() => {
    let base = "/";
    switch (userRole) {
      case "admin":
        base = "/admin/ad-groups";
        break;
      case "manager":
        base = "/admin/ad-groups";
        break;
      case "editor":
        base = "/editor/ad-groups";
        break;
      case "project-manager":
        base = "/pm/ad-groups";
        break;
      case "ops":
        base = "/pm/ad-groups";
        break;
      case "agency":
        base = "/agency/ad-groups";
        break;
      case "designer":
        base = "/dashboard/designer";
        break;
      case "client":
        base = "/ad-groups";
        break;
      default:
        base = "/";
    }
    if (userRole === "agency" && location.search) {
      return base + location.search;
    }
    return base;
  }, [userRole, location.search]);

  const ganttPath = useMemo(
    () => `${backPath}${backPath.includes('?') ? '&' : '?'}view=gantt`,
    [backPath]
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

  const feedbackItems = useMemo(
    () =>
      buildFeedbackEntriesForGroup({
        groupId: id,
        groupName: group?.name || '',
        feedback,
        responses,
        assets,
        recipesMeta,
        renderCopyEditDiff,
      }),
    [
      id,
      group?.name,
      feedback,
      responses,
      assets,
      recipesMeta,
      renderCopyEditDiff,
    ],
  );

  const canShowAllGroups = Boolean(group?.brandCode);
  const displayedFeedbackEntries =
    feedbackScope === 'all' ? allFeedbackEntries : feedbackItems;
  const isFeedbackLoading =
    feedbackScope === 'all' ? allFeedbackLoading : false;
  const feedbackScopeOptions = canShowAllGroups
    ? [
        { value: 'current', label: 'This group' },
        { value: 'all', label: 'All groups' },
      ]
    : [{ value: 'current', label: 'This group' }];

  const summaryBlocks = useMemo(
    () => (feedbackSummary ? parseSummaryMarkdown(feedbackSummary) : []),
    [feedbackSummary],
  );

  const renderedSummary = useMemo(() => {
    if (!feedbackSummary) return [];
    const blocks = summaryBlocks.length
      ? summaryBlocks
      : [{ type: 'paragraph', content: feedbackSummary }];
    return renderSummaryBlocks(blocks);
  }, [feedbackSummary, summaryBlocks]);

  const formatFeedbackForSummary = useCallback(() => {
    if (!feedbackItems.length) return 'No client feedback available yet.';
    const formatTimestamp = (value) => {
      if (!value || !(value instanceof Date)) return '';
      try {
        return value.toLocaleString(undefined, { month: 'short', day: 'numeric' });
      } catch (err) {
        return '';
      }
    };
    const cleanText = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value.trim();
      return flattenRichText(value).trim();
    };
    const sanitizeLine = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');

    return feedbackItems
      .map((entry, entryIndex) => {
        const headerParts = [];
        if (entry.groupName) headerParts.push(`Group: ${entry.groupName}`);
        if (entry.recipeCode) headerParts.push(`Recipe: ${entry.recipeCode}`);
        if (entry.subtitle) headerParts.push(`Details: ${sanitizeLine(entry.subtitle)}`);
        if (entry.adStatus) {
          headerParts.push(`Status: ${entry.adStatus.replace(/_/g, ' ')}`);
        }
        const commentCount = Array.isArray(entry.commentList)
          ? entry.commentList.length
          : 0;
        const copyEditCount = Array.isArray(entry.copyEditList)
          ? entry.copyEditList.length
          : 0;
        if (commentCount) {
          headerParts.push(`${commentCount} comment${commentCount === 1 ? '' : 's'}`);
        }
        if (copyEditCount) {
          headerParts.push(`${copyEditCount} copy edit${copyEditCount === 1 ? '' : 's'}`);
        }
        const headerLabel = headerParts.length
          ? headerParts.join(' | ')
          : entry.title || `Entry ${entryIndex + 1}`;
        const lines = [`Entry ${entryIndex + 1}: ${headerLabel}`];

        const commentItems = Array.isArray(entry.commentList)
          ? entry.commentList
          : [];
        commentItems.forEach((item) => {
          if (!item?.text) return;
          const detailParts = [];
          if (item.assetLabel) detailParts.push(item.assetLabel);
          if (item.updatedBy) detailParts.push(`by ${item.updatedBy}`);
          const timestamp = formatTimestamp(item.updatedAt);
          if (timestamp) detailParts.push(timestamp);
          if (item.status) {
            detailParts.push(`status: ${item.status.replace(/_/g, ' ')}`);
          }
          const detailString = detailParts.length ? ` (${detailParts.join(' • ')})` : '';
          lines.push(`  - Comment${detailString}: ${sanitizeLine(item.text)}`);
        });
        if (!commentItems.length && entry.comment) {
          lines.push(`  - Comment: ${sanitizeLine(entry.comment)}`);
        }

        const copyItems = Array.isArray(entry.copyEditList)
          ? entry.copyEditList
          : [];
        copyItems.forEach((item) => {
          const detailParts = [];
          if (item.assetLabel) detailParts.push(item.assetLabel);
          if (item.updatedBy) detailParts.push(`by ${item.updatedBy}`);
          const timestamp = formatTimestamp(item.updatedAt);
          if (timestamp) detailParts.push(timestamp);
          if (item.status) {
            detailParts.push(`status: ${item.status.replace(/_/g, ' ')}`);
          }
          const detailString = detailParts.length ? ` (${detailParts.join(' • ')})` : '';
          const copyText = sanitizeLine(cleanText(item.text) || cleanText(item.diff));
          if (copyText) {
            lines.push(`  - Copy edit${detailString}: ${copyText}`);
          } else {
            lines.push(
              `  - Copy edit${detailString}: Updated copy provided via diff.`,
            );
          }
        });
        if (!copyItems.length && entry.copyEdit) {
          lines.push(`  - Copy edit: ${sanitizeLine(entry.copyEdit)}`);
        }

        return lines.join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }, [feedbackItems]);

  const handleUpdateSummary = useCallback(async () => {
    if (updatingFeedbackSummary) return;
    setFeedbackSummaryError('');
    if (!feedbackItems.length) {
      const emptySummary = 'No client feedback available yet.';
      setFeedbackSummary(emptySummary);
      const now = new Date();
      setFeedbackSummaryUpdatedAt(now);
      setUpdatingFeedbackSummary(true);
      try {
        await updateDoc(doc(db, 'adGroups', id), {
          feedbackSummary: emptySummary,
          feedbackSummaryUpdatedAt: serverTimestamp(),
        });
        setGroup((prev) =>
          prev
            ? {
                ...prev,
                feedbackSummary: emptySummary,
                feedbackSummaryUpdatedAt: now,
              }
            : prev,
        );
      } catch (err) {
        console.error('Failed to save empty feedback summary', err);
        setFeedbackSummaryError('Failed to save summary. Please try again.');
      } finally {
        setUpdatingFeedbackSummary(false);
      }
      return;
    }

    setUpdatingFeedbackSummary(true);
    try {
      const feedbackDigest = formatFeedbackForSummary();
      const existingSummary = feedbackSummary?.trim() || '';
      const prompt =
        `You are a marketing project assistant who maintains concise feedback summaries for creative work.\n` +
        `Here is the current summary for ad group "${group?.name || id}":\n` +
        `${existingSummary || '(no summary yet)'}\n\n` +
        `Here are the latest client feedback notes that need to be reflected: \n${feedbackDigest}\n\n` +
        'Update the summary so it accurately reflects the feedback above. Preserve helpful context from the existing summary—make only the minimal additions or edits needed instead of rewriting from scratch. ' +
        'Return a polished Markdown summary limited to short bullet points (and optional brief follow-up sentences). Respond with the updated summary only.';

      const response = await fetch(OPENAI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You summarize client feedback for marketing creative teams.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI proxy request failed with ${response.status}`);
      }
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error('No summary returned from model');
      }
      await updateDoc(doc(db, 'adGroups', id), {
        feedbackSummary: raw,
        feedbackSummaryUpdatedAt: serverTimestamp(),
      });
      const now = new Date();
      setFeedbackSummary(raw);
      setFeedbackSummaryUpdatedAt(now);
      setGroup((prev) =>
        prev
          ? { ...prev, feedbackSummary: raw, feedbackSummaryUpdatedAt: now }
          : prev,
      );
    } catch (err) {
      console.error('Failed to update feedback summary', err);
      setFeedbackSummaryError('Failed to update summary. Please try again.');
    } finally {
      setUpdatingFeedbackSummary(false);
    }
  }, [
    OPENAI_PROXY_URL,
    feedbackItems,
    feedbackSummary,
    formatFeedbackForSummary,
    group?.name,
    id,
    updatingFeedbackSummary,
  ]);

  useEffect(() => {
    autoSummaryTriggeredRef.current = false;
  }, [id]);

  useEffect(() => {
    if (autoSummaryTriggeredRef.current) return;
    if (!group) return;
    const hasExistingSummary =
      Boolean(group.feedbackSummaryUpdatedAt) ||
      Boolean((group.feedbackSummary || '').trim()) ||
      Boolean(feedbackSummaryUpdatedAt) ||
      Boolean((feedbackSummary || '').trim());
    if (hasExistingSummary) return;
    if (!feedbackItems.length) return;
    if (updatingFeedbackSummary) return;
    autoSummaryTriggeredRef.current = true;
    void handleUpdateSummary();
  }, [
    feedbackItems.length,
    feedbackSummary,
    feedbackSummaryUpdatedAt,
    group,
    handleUpdateSummary,
    updatingFeedbackSummary,
  ]);

  const loadAllFeedbackForBrand = useCallback(
    async (signal) => {
      if (!group?.brandCode) {
        if (!signal?.aborted) {
          setAllFeedbackEntries([]);
          setAllFeedbackLoading(false);
        }
        return;
      }
      setAllFeedbackLoading(true);
      try {
        const groupsSnap = await getDocs(
          query(
            collection(db, 'adGroups'),
            where('brandCode', '==', group.brandCode),
          ),
        );
        if (signal?.aborted) return;
        const groupDocs = groupsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          name: docSnap.data()?.name || '',
        }));
        const payloads = await Promise.all(
          groupDocs.map(async (g) => {
            try {
              const [feedbackSnap, responsesSnap, assetsSnap, recipesSnap] =
                await Promise.all([
                  getDocs(collection(db, 'adGroups', g.id, 'feedback')),
                  getDocs(collection(db, 'adGroups', g.id, 'responses')),
                  getDocs(collection(db, 'adGroups', g.id, 'assets')),
                  getDocs(collection(db, 'adGroups', g.id, 'recipes')),
                ]);
              if (signal?.aborted) {
                return {
                  groupId: g.id,
                  groupName: g.name,
                  feedback: [],
                  responses: [],
                  assets: [],
                  recipesMeta: {},
                };
              }
              const feedbackList = feedbackSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              const responsesList = responsesSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              const assetsList = assetsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              const recipesMeta = {};
              recipesSnap.docs.forEach((d) => {
                const docData = d.data() || {};
                const meta = docData.metadata || {};
                recipesMeta[d.id] = {
                  id: d.id,
                  ...meta,
                  copy: docData.copy || '',
                  latestCopy: docData.latestCopy || '',
                };
              });
              return {
                groupId: g.id,
                groupName: g.name,
                feedback: feedbackList,
                responses: responsesList,
                assets: assetsList,
                recipesMeta,
                renderCopyEditDiff: createRenderCopyEditDiff(recipesMeta),
              };
            } catch (err) {
              console.error('Failed to load feedback for group', g.id, err);
              return {
                groupId: g.id,
                groupName: g.name,
                feedback: [],
                responses: [],
                assets: [],
                recipesMeta: {},
              };
            }
          }),
        );
        if (signal?.aborted) return;
        const combined = buildFeedbackEntries(payloads);
        const uniqueMap = new Map();
        combined.forEach((entry) => {
          if (!entry || !entry.id) return;
          if (!uniqueMap.has(entry.id)) {
            uniqueMap.set(entry.id, entry);
            return;
          }
          const prev = uniqueMap.get(entry.id);
          const prevTime = prev.updatedAt?.getTime?.() || 0;
          const nextTime = entry.updatedAt?.getTime?.() || 0;
          if (nextTime > prevTime) {
            uniqueMap.set(entry.id, entry);
          }
        });
        const list = Array.from(uniqueMap.values());
        list.sort(
          (a, b) =>
            (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0),
        );
        setAllFeedbackEntries(list);
      } catch (err) {
        console.error('Failed to load cross-group feedback', err);
        if (!signal?.aborted) setAllFeedbackEntries([]);
      } finally {
        if (!signal?.aborted) setAllFeedbackLoading(false);
      }
    },
    [group?.brandCode],
  );

  useEffect(() => {
    allFeedbackLoadedRef.current = false;
  }, [group?.brandCode, feedback.length, responses.length]);

  useEffect(() => {
    if (!canShowAllGroups && feedbackScope === 'all') {
      setFeedbackScope('current');
    }
  }, [canShowAllGroups, feedbackScope]);

  useEffect(() => {
    if (feedbackScope !== 'all') return;
    const controller = new AbortController();
    if (!allFeedbackLoadedRef.current) {
      allFeedbackLoadedRef.current = true;
      loadAllFeedbackForBrand(controller.signal);
    }
    return () => {
      controller.abort();
    };
  }, [feedbackScope, loadAllFeedbackForBrand]);

  const summarize = (list) => summarizeByRecipe(list);

  const openFeedbackAsset = useCallback(
    (assetId) => {
      if (!assetId) return;
      const match = assets.find((asset) => asset.id === assetId);
      if (match) {
        setPreviewAsset(match);
      }
    },
    [assets],
  );

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, "adGroups", id));
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() });
      }
    };
    load();
    const unsub = onSnapshot(
      collection(db, "adGroups", id, "assets"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAssets(list);
      },
    );
    const unsubBrief = onSnapshot(
      collection(db, "adGroups", id, "groupAssets"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBriefAssets(list);
      },
    );
    return () => {
      unsub();
      unsubBrief();
    };
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "adGroups", id, "recipes"),
      (snap) => {
        const data = {};
        snap.docs.forEach((d) => {
          const docData = d.data() || {};
          const meta = docData.metadata || {};
          data[d.id] = {
            id: d.id,
            ...meta,
            components: docData.components || {},
            copy: docData.copy || "",
            latestCopy: docData.latestCopy || "",
            assets: docData.assets || [],
            type: docData.type || "",
            selected: docData.selected || false,
            brandCode: docData.brandCode || group?.brandCode || "",
            platformCopyCardId: docData.platformCopyCardId || "",
          };
        });
        setRecipesMeta(data);
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const collectionRef = collection(db, "adGroups", id, "copyCards");
    const copyCardsQuery = query(collectionRef, orderBy(documentId()));
    const unsub = onSnapshot(copyCardsQuery, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCopyCards(sortCopyCards(list));
    });
    return () => unsub();
  }, [id]);

  const handleReviewTypeChange = async (e) => {
    const newVal = Number(e.target.value);
    try {
      await updateDoc(doc(db, 'adGroups', id), { reviewVersion: newVal });
      setGroup((p) => ({ ...p, reviewVersion: newVal }));
    } catch (err) {
      console.error('Failed to update review version', err);
    }
  };

  useEffect(() => {
    if (showCopyModal) {
      updateModalCopies(copyCards);
    }
  }, [showCopyModal, updateModalCopies]);

  useEffect(() => {
    const loadBrand = async () => {
      if (!group?.brandCode) return;
      try {
        const q = query(
          collection(db, "brands"),
          where("code", "==", group.brandCode),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const brandDoc = snap.docs[0];
          const data = brandDoc.data();
          setBrandName(data.name || group.brandCode);
          setBrandGuidelines(data.guidelinesUrl || "");
          setBrandHasAgency(Boolean(data.agencyId));
          setBrandId(brandDoc.id);
        } else {
          setBrandName(group.brandCode);
          setBrandGuidelines("");
          setBrandHasAgency(false);
          setBrandId("");
        }
      } catch (err) {
        console.error("Failed to fetch brand name", err);
        setBrandName(group.brandCode);
        setBrandGuidelines("");
        setBrandHasAgency(false);
        setBrandId("");
      }
    };
    loadBrand();
  }, [group?.brandCode]);

  useEffect(() => {
    if (!brandId) {
      setBrandNotes([]);
      return undefined;
    }

    const notesQuery = query(
      collection(db, "brands", brandId, "notes"),
      orderBy("createdAt", "desc"),
    );

    const normalizeTimestamp = (value) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value.toDate === "function") return value.toDate();
      return null;
    };

    const unsubscribe = onSnapshot(notesQuery, (snap) => {
      const items = snap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const createdAt = normalizeTimestamp(data.createdAt);
        const updatedAt = normalizeTimestamp(data.updatedAt);
        return {
          id: docSnap.id,
          title: data.title || "",
          body: data.body || data.text || data.note || "",
          createdAt,
          updatedAt,
        };
      });
      setBrandNotes(items);
    });

    return () => unsubscribe();
  }, [brandId]);

  useEffect(() => {
    if (!(isAdmin || (isManager && !isEditor))) {
      setDesigners([]);
      setEditors([]);
      return;
    }
    const fetchAssignments = async () => {
      try {
        const dSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'designer')));
        setDesigners(
          dSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch designers', err);
        setDesigners([]);
      }
      try {
        const eSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'editor')));
        setEditors(
          eSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch editors', err);
        setEditors([]);
      }
    };
    fetchAssignments();
  }, [isAdmin, isEditor, isManager]);

  useEffect(() => {
    let cancelled = false;
    const loadDesigner = async () => {
      if (!group?.designerId) {
        setDesignerName('');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', group.designerId));
        if (!cancelled) {
          setDesignerName(
            snap.exists()
              ? snap.data().fullName || snap.data().email || snap.id
              : group.designerId
          );
        }
      } catch (err) {
        console.error('Failed to fetch designer name', err);
        if (!cancelled) setDesignerName(group.designerId);
      }
    };
    loadDesigner();
    return () => {
      cancelled = true;
    };
  }, [group?.designerId]);

  useEffect(() => {
    let cancelled = false;
    const loadEditor = async () => {
      if (!group?.editorId) {
        setEditorName('');
        return;
      }
      if (group.editorId === auth.currentUser?.uid) {
        if (!cancelled) {
          const current = auth.currentUser;
          setEditorName(
            current?.displayName || current?.email || current?.phoneNumber || group.editorId
          );
        }
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', group.editorId));
        if (!cancelled) {
          setEditorName(
            snap.exists()
              ? snap.data().fullName || snap.data().email || snap.id
              : group.editorId
          );
        }
      } catch (err) {
        console.error('Failed to fetch editor name', err);
        if (!cancelled) setEditorName(group.editorId);
      }
    };
    loadEditor();
    return () => {
      cancelled = true;
    };
  }, [group?.editorId]);

  useEffect(() => {
    setBlockerText(group?.blocker || "");
  }, [group?.blocker]);

  useEffect(() => {
    if (group?.status === 'blocked') setTab('blocker');
  }, [group?.status]);

  useEffect(() => {
    if (group) {
      countsRef.current = {
        reviewed: group.reviewedCount || 0,
        approved: group.approvedCount || 0,
        edit: group.editCount || 0,
        rejected: group.rejectedCount || 0,
        archived: group.archivedCount || 0,
      };
    }
  }, [group]);

  useEffect(() => {
    if (!group?.status || !group?.brandCode || !id) return;

    const tracker = slackStatusRef.current;
    if (tracker.brandCode !== group.brandCode) {
      tracker.brandCode = group.brandCode;
      tracker.initialized = false;
      tracker.previousStatus = null;
    }

    const currentStatus = group.status;

    if (!tracker.initialized) {
      tracker.initialized = true;
      tracker.previousStatus = currentStatus;
      return;
    }

    if (tracker.previousStatus === currentStatus) {
      return;
    }

    tracker.previousStatus = currentStatus;

    if (![
      "briefed",
      "designed",
      "reviewed",
      "blocked",
    ].includes(currentStatus)) {
      return;
    }

    const adGroupUrl = (() => {
      if (typeof window === "undefined") return undefined;
      const origin = window.location?.origin || "";
      if (!origin || !id) return window.location?.href;
      return `${origin.replace(/\/$/, "")}/ad-group/${id}`;
    })();

    notifySlackStatusChange({
      brandCode: group.brandCode,
      adGroupId: id,
      adGroupName: group.name || "",
      status: currentStatus,
      adGroupUrl,
    });
  }, [group?.status, group?.brandCode, group?.name, id]);

  useEffect(() => {
    if (!group) return;
    const summary = summarize(assets);
    const prev = countsRef.current || {};
    const changed =
      summary.reviewed !== prev.reviewed ||
      summary.approved !== prev.approved ||
      summary.edit !== prev.edit ||
      summary.rejected !== prev.rejected ||
      summary.archived !== prev.archived ||
      (!group.thumbnailUrl && summary.thumbnail);
    if (changed) {
      const update = {
        reviewedCount: summary.reviewed,
        approvedCount: summary.approved,
        editCount: summary.edit,
        rejectedCount: summary.rejected,
        archivedCount: summary.archived,
        lastUpdated: serverTimestamp(),
        ...(group.thumbnailUrl
          ? {}
          : summary.thumbnail
            ? { thumbnailUrl: summary.thumbnail }
            : {}),
      };
      const newStatus = computeGroupStatus(
        assets,
        hasRecipes,
        group.status === 'designed',
        group.status,
      );
      if (
        newStatus !== group.status &&
        !(group.status === 'briefed' && assets.length === 0)
      ) {
        update.status = newStatus;
      }
      updateDoc(doc(db, "adGroups", id), update).catch((err) =>
        console.error("Failed to update summary", err),
      );
      countsRef.current = summary;
      setGroup((p) => ({ ...p, ...update }));
    }
  }, [assets, group, id, hasRecipes]);

  const recipeGroups = useMemo(() => {
    const map = {};
    assets.forEach((a) => {
      const info = parseAdFilename(a.filename || "");
      const recipe = info.recipeCode || "unknown";
      const aspect = info.aspectRatio || "";
      const item = { ...a, recipeCode: recipe, aspectRatio: aspect };
      if (!map[recipe]) map[recipe] = [];
      map[recipe].push(item);
    });
    const order = { "": 0, "3x5": 1, "9x16": 2, "1x1": 3 };
    const groups = Object.entries(map).map(([recipeCode, list]) => {
      list.sort((a, b) => {
        const diff =
          (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99);
        if (diff !== 0) return diff;
        return (a.version || 1) - (b.version || 1);
      });
      return { recipeCode, assets: list };
    });
    groups.sort((a, b) => Number(a.recipeCode) - Number(b.recipeCode));
    return groups;
  }, [assets]);

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

  const copyCardById = useMemo(() => {
    const map = {};
    copyCardsWithMeta.forEach((card) => {
      if (card.id) {
        map[card.id] = card;
      }
    });
    return map;
  }, [copyCardsWithMeta]);

  const copyCardsByProduct = useMemo(() => {
    const map = {};
    copyCardsWithMeta.forEach((card) => {
      const key = card.normalizedProduct || "";
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(card);
    });
    return map;
  }, [copyCardsWithMeta]);

  const recipeIdByCode = useMemo(() => {
    const map = {};
    Object.entries(recipesMeta).forEach(([docId, meta]) => {
      const candidates = [
        docId,
        meta.id,
        meta.recipeCode,
        meta.recipeNo,
        meta.code,
        meta.components?.recipeCode,
        meta.components?.code,
      ];
      candidates.forEach((candidate) => {
        const normalized = normalizeRecipeCode(candidate);
        if (normalized && !map[normalized]) {
          map[normalized] = docId;
        }
      });
    });
    return map;
  }, [recipesMeta]);

  const getRecipeMetaByCode = useCallback(
    (recipeCode) => {
      if (!recipeCode) return null;
      if (recipesMeta[recipeCode]) return recipesMeta[recipeCode];
      const normalized = normalizeRecipeCode(recipeCode);
      if (normalized && recipesMeta[normalized]) {
        return recipesMeta[normalized];
      }
      const docId = normalized ? recipeIdByCode[normalized] : null;
      if (docId && recipesMeta[docId]) {
        return recipesMeta[docId];
      }
      return null;
    },
    [recipeIdByCode, recipesMeta],
  );

  const getRecipeProductName = useCallback(
    (recipeCode) => {
      const meta = getRecipeMetaByCode(recipeCode);
      if (!meta) return "";
      return resolveRecipeProductName(meta);
    },
    [getRecipeMetaByCode],
  );

  useEffect(() => {
    setCopyAssignments((prev) => {
      const next = {};
      recipeGroups.forEach((group) => {
        const normalizedRecipe = normalizeRecipeCode(group.recipeCode);
        if (!normalizedRecipe) {
          return;
        }
        const meta = getRecipeMetaByCode(group.recipeCode) || {};
        const storedId = normalizeKeyPart(meta.platformCopyCardId);
        const prevId = normalizeKeyPart(prev[normalizedRecipe]);
        const available = (id) => id && copyCardById[id];
        let resolvedId = null;
        if (available(storedId)) {
          resolvedId = storedId;
        } else if (available(prevId)) {
          resolvedId = prevId;
        } else {
          const productName = getRecipeProductName(group.recipeCode);
          const normalizedProduct = normalizeProductKey(productName);
          const pool =
            (normalizedProduct && copyCardsByProduct[normalizedProduct]) ||
            copyCardsByProduct[""] ||
            copyCardsWithMeta;
          if (pool && pool.length > 0) {
            resolvedId = pool[0]?.id || null;
          }
        }
        if (resolvedId) {
          next[normalizedRecipe] = resolvedId;
        }
      });
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const unchanged =
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key) => prev[key] === next[key]);
      return unchanged ? prev : next;
    });
  }, [
    recipeGroups,
    getRecipeMetaByCode,
    copyCardById,
    copyCardsByProduct,
    copyCardsWithMeta,
    getRecipeProductName,
  ]);

  const handleCopyAssignmentChange = useCallback(
    async (recipeCode, newCopyId) => {
      const normalizedRecipe = normalizeRecipeCode(recipeCode);
      if (!normalizedRecipe) return;
      const nextId = newCopyId || "";
      if ((copyAssignments[normalizedRecipe] || "") === nextId) {
        return;
      }
      const docId =
        recipeIdByCode[normalizedRecipe] ||
        (recipesMeta[recipeCode] ? recipeCode : null) ||
        (recipesMeta[normalizedRecipe] ? normalizedRecipe : null);
      if (!docId) {
        console.warn("Unable to locate recipe for copy alignment", recipeCode);
        return;
      }
      const previousId = copyAssignments[normalizedRecipe] || "";
      setCopyAssignments((prev) => ({ ...prev, [normalizedRecipe]: nextId }));
      setCopyAssignmentSaving((prev) => ({ ...prev, [normalizedRecipe]: true }));
      try {
        if (nextId) {
          await setDoc(
            doc(db, "adGroups", id, "recipes", docId),
            { platformCopyCardId: nextId },
            { merge: true },
          );
        } else {
          await updateDoc(doc(db, "adGroups", id, "recipes", docId), {
            platformCopyCardId: deleteField(),
          });
        }
        setRecipesMeta((prev) => {
          const existing = prev[docId] || { id: docId };
          if (nextId) {
            return {
              ...prev,
              [docId]: { ...existing, platformCopyCardId: nextId },
            };
          }
          const { platformCopyCardId: _removed, ...rest } = existing;
          return { ...prev, [docId]: rest };
        });
      } catch (err) {
        console.error("Failed to update copy alignment", err);
        setCopyAssignments((prev) => ({
          ...prev,
          [normalizedRecipe]: previousId,
        }));
      } finally {
        setCopyAssignmentSaving((prev) => {
          const next = { ...prev };
          delete next[normalizedRecipe];
          return next;
        });
      }
    },
    [
      copyAssignments,
      id,
      recipeIdByCode,
      recipesMeta,
    ],
  );

  const recipeCount = useMemo(
    () => Object.keys(recipesMeta).length,
    [recipesMeta],
  );

  const savedRecipes = useMemo(() => {
    const ids = Object.keys(recipesMeta);
    ids.sort((a, b) => Number(a) - Number(b));
    return ids.map((id) => ({
      recipeNo: Number(id),
      components: recipesMeta[id].components || {},
      copy: recipesMeta[id].copy || "",
      assets: recipesMeta[id].assets || [],
      type: recipesMeta[id].type || "",
      selected: recipesMeta[id].selected || false,
      brandCode: recipesMeta[id].brandCode || group?.brandCode || "",
    }));
  }, [recipesMeta]);


  const recipeStatusSummary = useMemo(() => {
    const recipeIds = Object.keys(recipesMeta || {});
    return aggregateRecipeStatusCounts(assets, recipeIds);
  }, [assets, recipesMeta]);

  const unitStatusCounts = recipeStatusSummary.statusCounts || {
    pending: 0,
    approved: 0,
    rejected: 0,
    edit_requested: 0,
    archived: 0,
  };
  const unitCount = recipeStatusSummary.unitCount || 0;

  function getRecipeStatus(list) {
    const active = list.filter((a) => a.status !== "archived");
    const unique = Array.from(new Set(active.map((a) => a.status)));
    if (unique.length === 1) return unique[0];
    if (unique.length === 0) return "archived";
    return "mixed";
  }

  const specialGroups = useMemo(
    () =>
      recipeGroups.filter((g) =>
        ["rejected", "edit_requested"].includes(getRecipeStatus(g.assets)),
      ),
    [recipeGroups],
  );

  const normalGroups = useMemo(
    () =>
      recipeGroups.filter(
        (g) =>
          !["rejected", "edit_requested"].includes(getRecipeStatus(g.assets)),
      ),
    [recipeGroups],
  );

  const openHistory = async (recipeCode) => {
    try {
      const groupAssets = assets.filter((a) => {
        const info = parseAdFilename(a.filename || "");
        return (info.recipeCode || "unknown") === recipeCode;
      });
      const tsMillis = (t) =>
        t?.toMillis?.() ?? (typeof t === "number" ? t : 0);
      const all = [];
      const uids = new Set();
      for (const asset of groupAssets) {
        const snap = await getDocs(
          query(
            collection(db, "adGroups", id, "assets", asset.id, "history"),
            orderBy("updatedAt", "desc"),
          ),
        );
        snap.docs.forEach((d) => {
          const h = d.data() || {};
          const uid = h.updatedBy;
          if (uid) uids.add(uid);
          all.push({
            id: d.id,
            assetId: asset.id,
            lastUpdatedAt: h.updatedAt,
            email: uid || "N/A",
            status: h.status,
            comment: h.comment || "",
            copyEdit: h.copyEdit || "",
            origCopy: h.origCopy || "",
          });
        });
      }

      const userMap = {};
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            userMap[uid] = snap.exists()
              ? snap.data().fullName || snap.data().email || uid
              : uid;
          } catch (e) {
            userMap[uid] = uid;
          }
        }),
      );

      all.forEach((obj) => {
        if (userMap[obj.email]) obj.email = userMap[obj.email];
      });
      all.sort((a, b) => tsMillis(b.lastUpdatedAt) - tsMillis(a.lastUpdatedAt));
      setHistoryRecipe({ recipeCode, assets: all });
    } catch (err) {
      console.error("Failed to load recipe history", err);
    }
  };

  const openAssetHistory = async (asset) => {
    try {
      const snap = await getDocs(
        query(
          collection(db, "adGroups", id, "assets", asset.id, "history"),
          orderBy("updatedAt", "desc"),
        ),
      );
      const list = [];
      const uids = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const uid = data.updatedBy;
        if (uid) uids.add(uid);
        list.push({
          id: d.id,
          lastUpdatedAt: data.updatedAt,
          email: uid || "N/A",
          status: data.status,
          comment: data.comment || "",
          copyEdit: data.copyEdit || "",
          origCopy: data.origCopy || "",
        });
      });

      const userMap = {};
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            userMap[uid] = snap.exists()
              ? snap.data().fullName || snap.data().email || uid
              : uid;
          } catch (e) {
            userMap[uid] = uid;
          }
        }),
      );

      list.forEach((obj) => {
        if (userMap[obj.email]) obj.email = userMap[obj.email];
      });
      const info = parseAdFilename(asset.filename || "");
      setHistoryAsset({
        filename: asset.filename,
        assetId: asset.id,
        recipeCode: info.recipeCode || "",
        assets: list,
      });
    } catch (err) {
      console.error("Failed to load ad history", err);
    }
  };


  const openRevision = async (recipeCode) => {
    try {
      const groupAssets = assets.filter((a) => {
        const info = parseAdFilename(a.filename || "");
        return (info.recipeCode || "unknown") === recipeCode;
      });
      const hasV2 = groupAssets.some(
        (a) => (a.version || parseAdFilename(a.filename || "").version || 1) > 1,
      );
      const hasEditReq = groupAssets.some((a) => a.status === "edit_requested");
      if (!hasV2 && !hasEditReq) return;

      const history = [];
      const uids = new Set();
      for (const asset of groupAssets) {
        const snap = await getDocs(
          query(
            collection(db, "adGroups", id, "assets", asset.id, "history"),
            orderBy("updatedAt", "desc"),
          ),
        );
        snap.docs.forEach((d) => {
          const h = d.data() || {};
          if (h.updatedBy) uids.add(h.updatedBy);
          history.push({
            id: d.id,
            assetId: asset.id,
            lastUpdatedAt: h.updatedAt,
            email: h.updatedBy || "N/A",
            status: h.status,
            comment: h.comment || "",
            copyEdit: h.copyEdit || "",
            origCopy: h.origCopy || "",
          });
        });
      }

      const userMap = {};
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            userMap[uid] = snap.exists()
              ? snap.data().fullName || snap.data().email || uid
              : uid;
          } catch (e) {
            userMap[uid] = uid;
          }
        }),
      );

      history.forEach((obj) => {
        if (userMap[obj.email]) obj.email = userMap[obj.email];
      });
      history.sort((a, b) => {
        const t = (x) => x?.toMillis?.() ?? (typeof x === "number" ? x : 0);
        return t(b.lastUpdatedAt) - t(a.lastUpdatedAt);
      });

      const sorted = [...groupAssets].sort(
        (a, b) =>
          (a.version || parseAdFilename(a.filename || "").version || 1) -
          (b.version || parseAdFilename(b.filename || "").version || 1),
      );
      if (!hasV2 && hasEditReq) {
        sorted.push({ id: "placeholder", placeholder: true });
      }
      setRevisionModal({
        recipeCode,
        assets: sorted,
        history,
        copy:
          recipesMeta[recipeCode]?.latestCopy ||
          recipesMeta[recipeCode]?.copy ||
          "",
      });
    } catch (err) {
      console.error("Failed to open revision modal", err);
    }
  };

  useEffect(() => {
    if (metadataRecipe) {
      const rawId = String(metadataRecipe.id);
      const idKey = normalizeId(rawId);
      const meta =
        recipesMeta[rawId] ||
        recipesMeta[rawId.toLowerCase()] ||
        recipesMeta[idKey] ||
        metadataRecipe;
      setMetadataForm({
        copy: meta.copy || "",
      });
    }
  }, [metadataRecipe, recipesMeta]);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuRecipe(null);
      }
    };
    if (menuRecipe) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuRecipe]);

  const closeModals = () => {
    setHistoryRecipe(null);
    setHistoryAsset(null);
    setMetadataRecipe(null);
    setRevisionModal(null);
    setMenuRecipe(null);
    setInspectRecipe(null);
    setPreviewAsset(null);
  };

  const deleteHistoryEntry = async (assetId, entryId) => {
    try {
      await deleteDoc(doc(db, "adGroups", id, "assets", assetId, "history", entryId));
      setHistoryRecipe((prev) =>
        prev
          ? { ...prev, assets: prev.assets.filter((h) => h.id !== entryId) }
          : prev,
      );
      setHistoryAsset((prev) =>
        prev && prev.assetId === assetId
          ? { ...prev, assets: prev.assets.filter((h) => h.id !== entryId) }
          : prev,
      );
    } catch (err) {
      console.error("Failed to delete history entry", err);
    }
  };

  const resetGroup = async () => {
    if (!group) return;
    const confirmReset = window.confirm("Reset this group to New?");
    if (!confirmReset) return;
    try {
      const batch = writeBatch(db);
      assets.forEach((a) => {
        batch.update(doc(db, "adGroups", id, "assets", a.id), {
          status: "pending",
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
        });
      });
      batch.update(doc(db, "adGroups", id), { status: "new" });
      await batch.commit();
      setAssets((prev) => prev.map((a) => ({ ...a, status: "pending" })));
      setGroup((p) => ({ ...p, status: "new" }));
    } catch (err) {
      console.error("Failed to reset group", err);
    }
  };

  const archiveGroup = async () => {
    if (!group) return;
    if (!window.confirm("Archive this group?")) return;
    try {
      await updateDoc(doc(db, "adGroups", id), {
        status: "archived",
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setGroup((p) => ({ ...p, status: "archived" }));
      await createArchiveTicket({ target: 'adGroup', groupId: id, brandCode: group?.brandCode });
    } catch (err) {
      console.error("Failed to archive group", err);
    }
  };

  const scrubReviewHistory = async () => {
    if (!group) return;
    const hasPendingOrEdit = assets.some(
      (a) => a.status === "pending" || a.status === "edit_requested"
    );
    const confirmMsg = hasPendingOrEdit
      ? "One or more ads are pending or have an active edit request. Would you still like to scrub them?"
      : "Scrub review history? This will remove older revisions.";
    if (!window.confirm(confirmMsg)) return;
    try {
      const chains = {};
      assets.forEach((a) => {
        const root = a.parentAdId || a.id;
        if (!chains[root]) chains[root] = [];
        chains[root].push(a);
      });
      const batch = writeBatch(db);
      Object.entries(chains).forEach(([rootId, list]) => {
        const latest = list.reduce(
          (acc, cur) => (cur.version > acc.version ? cur : acc),
          list[0]
        );
        const update = {};
        if (list.length > 1) {
          list
            .filter((a) => a.id !== latest.id)
            .forEach((a) => {
              const dest = doc(
                db,
                "adGroups",
                id,
                "scrubbedHistory",
                rootId,
                "assets",
                a.id,
              );
              batch.set(dest, { ...a, scrubbedAt: serverTimestamp() });
              batch.delete(doc(db, "adGroups", id, "assets", a.id));
            });
          update.version = 1;
          update.parentAdId = null;
          update.scrubbedFrom = rootId;
          if (latest.filename) {
            const idx = latest.filename.lastIndexOf(".");
            const ext = idx >= 0 ? latest.filename.slice(idx) : "";
            update.filename = stripVersion(latest.filename) + ext;
          }
        }
        if (hasPendingOrEdit) {
          if (latest.status === "rejected" || latest.status === "archived") {
            update.status = "archived";
          } else {
            update.status = "ready";
          }
        } else {
          if (latest.status === "approved") update.status = "ready";
          if (latest.status === "rejected" || latest.status === "archived")
            update.status = "archived";
        }
        if (Object.keys(update).length > 0) {
          batch.update(doc(db, "adGroups", id, "assets", latest.id), update);
        }
      });
      for (const a of assets) {
        const snap = await getDocs(
          collection(db, "adGroups", id, "assets", a.id, "history")
        );
        snap.forEach((h) => {
          batch.delete(
            doc(db, "adGroups", id, "assets", a.id, "history", h.id)
          );
        });
      }
      await batch.commit();
      const groupsMap = {};
      assets.forEach((a) => {
        const root = a.parentAdId || a.id;
        if (!groupsMap[root]) groupsMap[root] = [];
        groupsMap[root].push(a);
      });
      const updatedAssets = [];
      Object.entries(groupsMap).forEach(([rootId, list]) => {
        const latest = list.reduce(
          (acc, cur) => (cur.version > acc.version ? cur : acc),
          list[0]
        );
        const updated = { ...latest };
        if (list.length > 1) {
          updated.version = 1;
          updated.parentAdId = null;
          updated.scrubbedFrom = rootId;
          if (latest.filename) {
            const idx = latest.filename.lastIndexOf(".");
            const ext = idx >= 0 ? latest.filename.slice(idx) : "";
            updated.filename = stripVersion(latest.filename) + ext;
          }
        }
        if (hasPendingOrEdit) {
          if (latest.status === "rejected" || latest.status === "archived") {
            updated.status = "archived";
          } else {
            updated.status = "ready";
          }
        } else {
          if (latest.status === "approved") updated.status = "ready";
          if (latest.status === "rejected" || latest.status === "archived")
            updated.status = "archived";
        }
        updatedAssets.push(updated);
      });
      setAssets(updatedAssets);
      const newStatus = computeGroupStatus(
        updatedAssets,
        hasRecipes,
        group.status === 'designed',
        group.status,
      );
      await updateDoc(doc(db, "adGroups", id), { status: newStatus });
      setGroup((p) => ({ ...p, status: newStatus }));
    } catch (err) {
      console.error("Failed to scrub review history", err);
    }
  };

  const undoScrubReviewHistory = async () => {
    if (!group) return;
    try {
      const rootsSnap = await getDocs(
        collection(db, "adGroups", id, "scrubbedHistory"),
      );
      if (rootsSnap.empty) return;
      const batch = writeBatch(db);
      const updatedAssets = [...assets];
      for (const root of rootsSnap.docs) {
        const rootId = root.id;
        const latestIdx = updatedAssets.findIndex(
          (a) => a.scrubbedFrom === rootId,
        );
        if (latestIdx === -1) continue;
        const latest = updatedAssets[latestIdx];
        const historySnap = await getDocs(
          collection(db, "adGroups", id, "scrubbedHistory", rootId, "assets"),
        );
        let maxVersion = 0;
        let prevId = null;
        historySnap.forEach((a) => {
          const data = a.data();
          batch.set(
            doc(db, "adGroups", id, "assets", a.id),
            { ...data, scrubbedAt: deleteField() },
          );
          batch.delete(
            doc(db, "adGroups", id, "scrubbedHistory", rootId, "assets", a.id),
          );
          updatedAssets.push({ id: a.id, ...data });
          const v = data.version || 1;
          if (v > maxVersion) {
            maxVersion = v;
            prevId = a.id;
          }
        });
        const newVersion = maxVersion + 1;
        const update = {
          scrubbedFrom: deleteField(),
          version: newVersion,
          parentAdId: prevId,
        };
        if (latest.filename) {
          const idx = latest.filename.lastIndexOf(".");
          const ext = idx >= 0 ? latest.filename.slice(idx) : "";
          update.filename = `${stripVersion(latest.filename)}_v${newVersion}${ext}`;
        }
        batch.update(
          doc(db, "adGroups", id, "assets", latest.id),
          update,
        );
        updatedAssets[latestIdx] = { ...latest, ...update };
      }
      await batch.commit();
      const newStatus = computeGroupStatus(
        updatedAssets,
        hasRecipes,
        group.status === 'designed',
        group.status,
      );
      await updateDoc(doc(db, "adGroups", id), { status: newStatus });
      setGroup((p) => ({ ...p, status: newStatus }));
      setAssets(updatedAssets);
    } catch (err) {
      console.error("Failed to undo scrub", err);
    }
  };

  const restoreGroup = async () => {
    if (!group) return;
    try {
      await updateDoc(doc(db, "adGroups", id), {
        status: "new",
        archivedAt: null,
        archivedBy: null,
      });
      setGroup((p) => ({ ...p, status: "new" }));
    } catch (err) {
      console.error("Failed to restore group", err);
    }
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    for (const file of files) {
      try {
        const info = parseAdFilename(file.name);
        const recipe = info.recipeCode || '';
        const recipeAssets = assets.filter((a) => {
          const aInfo = parseAdFilename(a.filename || "");
          const rcode = a.recipeCode || aInfo.recipeCode || "";
          return rcode === recipe;
        });
        let recipeStatus = null;
        if (recipeAssets.length > 0) recipeStatus = getRecipeStatus(recipeAssets);
        if (!isAdmin && ["archived", "rejected"].includes(recipeStatus)) {
          const display =
            recipeStatus === "edit_requested" ? "edit request" : recipeStatus;
          window.alert(`Error. Cannot Upload. Recipe is ${display}.`);
          continue;
        }
        const url = await uploadFile(
          file,
          id,
          group?.brandCode,
          group?.name || id,
        );
        let parentId = null;
        if (info.version && info.version > 1) {
          const base = stripVersion(file.name);
          const prev = assets.find((a) => stripVersion(a.filename) === base);
          if (prev) {
            parentId = prev.parentAdId || prev.id;
            try {
              await updateDoc(doc(db, "adGroups", id, "assets", prev.id), {
                status: "archived",
              });
            } catch (err) {
              console.error("Failed to archive previous version", err);
            }
          }
        }
        await addDoc(collection(db, "adGroups", id, "assets"), {
          adGroupId: id,
          brandCode: info.brandCode || group?.brandCode || "",
          adGroupCode: info.adGroupCode || "",
          recipeCode: info.recipeCode || "",
          aspectRatio: info.aspectRatio || "",
          filename: file.name,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
          status: recipeStatus === "approved" ? "approved" : "pending",
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          version: info.version || 1,
          parentAdId: parentId,
          isResolved: false,
        });
      } catch (err) {
        console.error("Upload failed", err);
      }
    }
    setUploading(false);
  };

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    if (group?.status === "archived" && !isAdmin) {
      window.alert("This ad group is archived and cannot accept new ads.");
      return;
    }
    const existing = new Set(assets.map((a) => a.filename));
    const used = new Set();
    const files = [];
    const dupes = [];
    for (const f of Array.from(selectedFiles)) {
      if (existing.has(f.name) || used.has(f.name)) {
        dupes.push(f.name);
      } else {
        used.add(f.name);
        files.push(f);
      }
    }
    if (dupes.length > 0) {
      window.alert(`Duplicate files skipped: ${dupes.join(", ")}`);
    }
    if (files.length === 0) return;
    const missing = detectMissingRatios(files, assets);
    if (Object.keys(missing).length > 0) {
      setUploadSummary({ files, missing, choices: {}, applyAll: false });
      return;
    }
    await uploadFiles(files);
  };

  const confirmUpload = async () => {
    if (!uploadSummary) return;
    await uploadFiles(uploadSummary.files);
    setUploadSummary(null);
  };

  const handleBriefUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setUploading(true);
    for (const file of Array.from(selectedFiles)) {
      try {
        const url = await uploadFile(
          file,
          id,
          group?.brandCode,
          group?.name || id,
        );
        await addDoc(collection(db, "adGroups", id, "groupAssets"), {
          filename: file.name,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
          brandCode: group?.brandCode || '',
          note: "",
        });
      } catch (err) {
        console.error("Brief upload failed", err);
      }
    }
    setUploading(false);
  };

  const deleteBriefAsset = async (asset) => {
    const confirm = window.confirm("Delete this asset?");
    if (!confirm) return;
    try {
      await deleteDoc(doc(db, "adGroups", id, "groupAssets", asset.id));
      if (asset.filename || asset.firebaseUrl) {
        try {
          const fileRef = ref(
            storage,
            asset.firebaseUrl ||
              `Campfire/Brands/${group?.brandCode}/Adgroups/${
                group?.name || id
              }/${asset.filename}`,
          );
          await deleteObject(fileRef);
        } catch (err) {
          console.error("Failed to delete storage file", err);
        }
      }
    } catch (err) {
      console.error("Failed to delete asset", err);
    }
  };

  const addBriefAssetNote = async (asset) => {
    const note = window.prompt("Asset note", asset.note || "");
    if (note === null) return;
    try {
      await updateDoc(doc(db, "adGroups", id, "groupAssets", asset.id), {
        note: note.trim(),
      });
    } catch (err) {
      console.error("Failed to update note", err);
    }
  };

  const replaceBriefAsset = async (asset, file) => {
    if (!file) return;
    try {
      const url = await uploadFile(
        file,
        id,
        group?.brandCode,
        group?.name || id,
      );
      await updateDoc(doc(db, "adGroups", id, "groupAssets", asset.id), {
        filename: file.name,
        firebaseUrl: url,
        uploadedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to replace asset", err);
    }
  };

  const downloadBriefAll = async () => {
    const files = [];
    for (const asset of briefAssets) {
      try {
        const resp = await fetch(asset.firebaseUrl);
        const buf = await resp.arrayBuffer();
        files.push({ path: asset.filename, data: buf });
      } catch (err) {
        console.error("Failed to download", err);
      }
    }
    if (files.length === 0) return;
    const blob = await makeZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${group?.name || "assets"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const uploadVersion = async (assetId, file) => {
    if (!file) return;
    setVersionUploading(assetId);
    try {
      const url = await uploadFile(
        file,
        id,
        group?.brandCode,
        group?.name || id,
      );
      const info = parseAdFilename(file.name);
      const asset = assets.find((a) => a.id === assetId);
      const currentVersion = asset?.version || 1;
      const update = {
        filename: file.name,
        firebaseUrl: url,
        uploadedAt: serverTimestamp(),
        version: info.version || currentVersion,
      };
      if (info.version && info.version > currentVersion) {
        update.parentAdId = asset?.parentAdId || assetId;
      }
      await updateDoc(doc(db, "adGroups", id, "assets", assetId), update);
    } catch (err) {
      console.error("Failed to upload version", err);
    } finally {
      setVersionUploading(null);
    }
  };

  const uploadRevision = async (origAsset, inputFiles) => {
    if (!origAsset || !inputFiles) return;

    const normalizeFiles = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value.length === 'number' && typeof value.item === 'function') {
        return Array.from({ length: value.length }, (_, idx) => value.item(idx)).filter(Boolean);
      }
      return [value].filter(Boolean);
    };

    const renameFile = (source, name) => {
      if (typeof File === 'undefined') return source;
      return new File([source], name, { type: source.type });
    };

    const files = normalizeFiles(inputFiles);
    if (files.length === 0) return;

    setVersionUploading(origAsset.id);
    const origInfo = parseAdFilename(origAsset.filename || '');
    const fallbackRecipeCode = origAsset.recipeCode || origInfo.recipeCode || '';
    const fallbackBrandCode = origAsset.brandCode || origInfo.brandCode || group?.brandCode || '';
    const fallbackAdGroupCode = origAsset.adGroupCode || origInfo.adGroupCode || '';
    const fallbackAspectRatio = origAsset.aspectRatio || origInfo.aspectRatio || '';
    const fallbackParentId = origAsset.parentAdId || origAsset.id;

    const assetsByBase = new Map();
    assets.forEach((asset) => {
      const base = stripVersion(asset.filename || '');
      if (base) assetsByBase.set(base.toLowerCase(), asset);
    });

    const versionMap = new Map();
    assets.forEach((asset) => {
      const parent = asset.parentAdId || asset.id;
      const version =
        asset.version || parseAdFilename(asset.filename || '').version || 1;
      const current = versionMap.get(parent) || 0;
      if (version > current) versionMap.set(parent, version);
    });

    const archivedIds = new Set();
    const createdAssets = [];

    try {
      for (const originalFile of files) {
        if (!originalFile) continue;

        let file = originalFile;
        let fname = file.name;
        const ext = fname.includes('.') ? fname.slice(fname.lastIndexOf('.')) : '';
        const baseName = stripVersion(fname);
        const baseKey = baseName ? baseName.toLowerCase() : '';
        const parsedInitial = parseAdFilename(fname);

        const matchedAsset =
          assetsByBase.get(baseKey) ||
          assets.find((asset) => {
            const info = parseAdFilename(asset.filename || '');
            const recipeMatches =
              (asset.recipeCode || info.recipeCode || '') ===
              (parsedInitial.recipeCode || fallbackRecipeCode);
            const ratioMatches =
              (asset.aspectRatio || info.aspectRatio || '') ===
              (parsedInitial.aspectRatio || fallbackAspectRatio);
            return recipeMatches && ratioMatches;
          }) ||
          origAsset;

        const parentId = matchedAsset?.parentAdId || matchedAsset?.id || fallbackParentId;
        const currentMax =
          versionMap.get(parentId) ||
          matchedAsset?.version ||
          parseAdFilename(matchedAsset?.filename || '').version ||
          1;
        let version = parsedInitial.version;

        const baseForName =
          baseName ||
          stripVersion(matchedAsset?.filename || '') ||
          stripVersion(origAsset.filename || '') ||
          fname.replace(/\.[^/.]+$/, '');

        if (!/_V\d+/i.test(fname) || !version || version <= currentMax) {
          const nextVersion = (versionMap.get(parentId) || currentMax) + 1;
          version = nextVersion;
          fname = `${baseForName}_V${nextVersion}${ext}`;
          file = renameFile(file, fname);
        }

        versionMap.set(parentId, Math.max(versionMap.get(parentId) || 0, version));

        const info = parseAdFilename(fname);
        const recipeCode =
          info.recipeCode ||
          matchedAsset?.recipeCode ||
          parsedInitial.recipeCode ||
          fallbackRecipeCode;
        const brandCode =
          info.brandCode ||
          matchedAsset?.brandCode ||
          origAsset.brandCode ||
          fallbackBrandCode;
        const adGroupCode =
          info.adGroupCode ||
          matchedAsset?.adGroupCode ||
          origAsset.adGroupCode ||
          fallbackAdGroupCode;
        const aspectRatio =
          info.aspectRatio ||
          matchedAsset?.aspectRatio ||
          parsedInitial.aspectRatio ||
          fallbackAspectRatio;

        const url = await uploadFile(
          file,
          id,
          group?.brandCode,
          group?.name || id,
        );

        const docRef = await addDoc(collection(db, 'adGroups', id, 'assets'), {
          adGroupId: id,
          brandCode: brandCode || '',
          adGroupCode,
          recipeCode,
          aspectRatio,
          filename: fname,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
          status: 'pending',
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
          version: info.version || version,
          parentAdId: parentId,
          isResolved: false,
        });

        if (
          matchedAsset?.id &&
          !archivedIds.has(matchedAsset.id) &&
          matchedAsset.status !== 'archived'
        ) {
          await updateAssetStatus(matchedAsset.id, 'archived');
          archivedIds.add(matchedAsset.id);
        }

        const newAsset = {
          id: docRef.id,
          adGroupId: id,
          brandCode: brandCode || '',
          adGroupCode,
          recipeCode,
          aspectRatio,
          filename: fname,
          firebaseUrl: url,
          uploadedAt: new Date(),
          status: 'pending',
          comment: null,
          lastUpdatedBy: null,
          lastUpdatedAt: new Date(),
          version: info.version || version,
          parentAdId: parentId,
          isResolved: false,
        };
        createdAssets.push(newAsset);
      }

      if (createdAssets.length > 0) {
        const modalRecipeCode =
          createdAssets[0]?.recipeCode || fallbackRecipeCode;

        setAssets((prev) => {
          const updated = prev.map((asset) =>
            archivedIds.has(asset.id) ? { ...asset, status: 'archived' } : asset,
          );
          return [...updated, ...createdAssets];
        });

        setRevisionModal((prev) => {
          if (!prev || prev.recipeCode !== modalRecipeCode) return prev;
          const updatedExisting = prev.assets
            .filter((asset) => asset.id !== 'placeholder')
            .map((asset) =>
              archivedIds.has(asset.id)
                ? { ...asset, status: 'archived' }
                : asset,
            );
          const combined = [...updatedExisting, ...createdAssets];
          combined.sort((a, b) => {
            const av = a.version || parseAdFilename(a.filename || '').version || 1;
            const bv = b.version || parseAdFilename(b.filename || '').version || 1;
            if (av === bv) return (a.filename || '').localeCompare(b.filename || '');
            return av - bv;
          });
          return {
            ...prev,
            assets: combined,
          };
        });
      }
    } catch (err) {
      console.error('Failed to upload revision', err);
    } finally {
      setVersionUploading(null);
    }
  };

  const saveNotes = async () => {
    try {
      await updateDoc(doc(db, "adGroups", id), { notes: notesInput });
      setGroup((p) => ({ ...p, notes: notesInput }));
      setEditingNotes(false);
    } catch (err) {
      console.error("Failed to save notes", err);
    }
  };

  const saveMetadata = async () => {
    if (!metadataRecipe) return;
    try {
      await setDoc(
        doc(db, "adGroups", id, "recipes", metadataRecipe.id),
        { copy: metadataForm.copy },
        { merge: true },
      );
      setRecipesMeta((prev) => ({
        ...prev,
        [metadataRecipe.id]: {
          ...(prev[metadataRecipe.id] || { id: metadataRecipe.id }),
          copy: metadataForm.copy,
        },
      }));
      setMetadataRecipe(null);
    } catch (err) {
      console.error("Failed to save metadata", err);
    }
  };

  const saveRevisionReady = async () => {
    if (!revisionModal) return;
    try {
      await setDoc(
        doc(db, "adGroups", id, "recipes", revisionModal.recipeCode),
        { latestCopy: revisionModal.copy },
        { merge: true },
      );
      setRecipesMeta((prev) => ({
        ...prev,
        [revisionModal.recipeCode]: {
          ...(prev[revisionModal.recipeCode] || { id: revisionModal.recipeCode }),
          latestCopy: revisionModal.copy,
        },
      }));
      const updateList = revisionModal.assets.filter(
        (a) => (a.version || parseAdFilename(a.filename || "").version || 1) > 1,
      );
      await Promise.all(
        updateList.map((a) => updateAssetStatus(a.id, "ready", true)),
      );
      setRevisionModal(null);
    } catch (err) {
      console.error("Failed to complete revision", err);
    }
  };

  const saveRecipes = async (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    try {
      if (showRecipes && Object.keys(recipesMeta).length > 0) {
        const confirmReplace = window.confirm(
          "Replace existing saved recipes with new generation?",
        );
        if (!confirmReplace) return;
      }

      const batch = writeBatch(db);
      const existingIds = Object.keys(recipesMeta);
      const newIds = list.map((r) => r.id || String(r.recipeNo));
      existingIds.forEach((rid) => {
        if (!newIds.includes(rid)) {
          batch.delete(doc(db, "adGroups", id, "recipes", rid));
        }
      });
      list.forEach((r) => {
        const docId = r.id || String(r.recipeNo);
        const docRef = doc(db, "adGroups", id, "recipes", docId);
        batch.set(
          docRef,
          {
            components: r.components,
            copy: r.copy,
            assets: r.assets || [],
            type: r.type || "",
            selected: r.selected || false,
            brandCode: r.brandCode || group?.brandCode || "",
          },
          { merge: true },
        );
      });
      await batch.commit();
      if (["pending", "new"].includes(group?.status)) {
        try {
          await updateDoc(doc(db, "adGroups", id), { status: "briefed" });
          setGroup((prev) => ({ ...prev, status: "briefed" }));
        } catch (err) {
          console.error("Failed to update group status", err);
        }
      }
      setShowRecipes(false);
      setShowRecipesTable(false);
    } catch (err) {
      console.error("Failed to save recipes", err);
    }
  };

  const saveCopyCards = async (list, options = {}) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const { append = false } = options;
    const prepared = list
      .map((c) => ({
        id: c?.id || '',
        primary: c?.primary || '',
        headline: c?.headline || '',
        description: c?.description || '',
        product: c?.product || '',
      }))
      .filter(
        (c) => c.primary || c.headline || c.description || c.product,
      );
    if (prepared.length === 0) return;
    const buildPayload = (card) => ({
      primary: card.primary,
      headline: card.headline,
      description: card.description,
      product: card.product,
    });

    try {
      if (append) {
        const existing = prepared.filter((c) => c.id);
        const additions = prepared.filter((c) => !c.id);
        const operations = [
          ...existing.map((c) =>
            setDoc(
              doc(db, 'adGroups', id, 'copyCards', c.id),
              buildPayload(c),
              { merge: true },
            ),
          ),
          ...additions.map((c) =>
            addDoc(
              collection(db, 'adGroups', id, 'copyCards'),
              buildPayload(c),
            ),
          ),
        ];
        await Promise.all(operations);
        setShowCopyModal(false);
        return;
      }

      if (showCopyModal && copyCards.length > 0) {
        const confirmReplace = window.confirm(
          'Replace existing saved copy with new generation?',
        );
        if (!confirmReplace) return;
      }

      const existingIds = copyCards.map((c) => c.id);
      const newIds = prepared.map((c) => c.id).filter(Boolean);
      const deletions = existingIds.filter((id) => !newIds.includes(id));
      await Promise.all(
        deletions.map((cid) => deleteDoc(doc(db, 'adGroups', id, 'copyCards', cid))),
      );
      await Promise.all(
        prepared.map((c) => {
          if (c.id) {
            return setDoc(
              doc(db, 'adGroups', id, 'copyCards', c.id),
              buildPayload(c),
              { merge: true },
            );
          }
          return addDoc(
            collection(db, 'adGroups', id, 'copyCards'),
            buildPayload(c),
          );
        }),
      );
      if (deletions.length > 0) {
        const affectedEntries = Object.entries(copyAssignments).filter(([, assignedId]) =>
          deletions.includes(assignedId),
        );
        if (affectedEntries.length > 0) {
          const affectedDocIds = new Set();
          affectedEntries.forEach(([recipeKey]) => {
            const docId =
              recipeIdByCode[recipeKey] ||
              (recipesMeta[recipeKey] ? recipeKey : null);
            if (docId) {
              affectedDocIds.add(docId);
            }
          });
          await Promise.all(
            Array.from(affectedDocIds).map((docId) =>
              updateDoc(doc(db, 'adGroups', id, 'recipes', docId), {
                platformCopyCardId: deleteField(),
              }).catch((err) => {
                console.error('Failed to clear copy alignment', err);
              }),
            ),
          );
          setCopyAssignments((prev) => {
            const next = { ...prev };
            affectedEntries.forEach(([recipeKey]) => {
              delete next[recipeKey];
            });
            return next;
          });
          setRecipesMeta((prev) => {
            if (affectedDocIds.size === 0) return prev;
            const next = { ...prev };
            affectedDocIds.forEach((docId) => {
              if (next[docId]) {
                const { platformCopyCardId: _removed, ...rest } = next[docId];
                next[docId] = rest;
              }
            });
            return next;
          });
        }
      }
      setShowCopyModal(false);
    } catch (err) {
      console.error('Failed to save copy cards', err);
    }
  };

  const updateAssetStatus = async (assetId, status, clearCopyEdit = false) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;

    if (isDesigner) {
      if (!DESIGNER_EDITABLE_STATUSES.includes(asset.status)) {
        window.alert(
          "Designers can only update ads that are pending, edit requested, or ready.",
        );
        return;
      }
      if (!DESIGNER_EDITABLE_STATUSES.includes(status)) {
        window.alert(
          "Designers can only change status to pending, edit requested, or ready.",
        );
        return;
      }
    }

    const updates = {
      status,
      ...(clearCopyEdit ? { copyEdit: "" } : {}),
    };
    const parentId = status === "ready" ? asset?.parentAdId : null;

    try {
      await updateDoc(doc(db, "adGroups", id, "assets", assetId), updates);
      if (parentId) {
        await updateDoc(doc(db, "adGroups", id, "assets", parentId), {
          status: "archived",
        });
      }

      const applyUpdates = (item) => {
        if (item.id === assetId) {
          return { ...item, ...updates };
        }
        if (parentId && item.id === parentId) {
          return { ...item, status: "archived" };
        }
        return item;
      };

      setAssets((prev) => prev.map(applyUpdates));
      setInspectRecipe((prev) =>
        prev ? { ...prev, assets: prev.assets.map(applyUpdates) } : prev,
      );
      setPreviewAsset((prev) => {
        if (!prev) return prev;
        if (prev.id === assetId) {
          return { ...prev, ...updates };
        }
        if (parentId && prev.id === parentId) {
          return { ...prev, status: "archived" };
        }
        return prev;
      });

      const info = parseAdFilename(asset.filename || "");
      const recipeCode = info.recipeCode || "unknown";
      const userName =
        auth.currentUser?.displayName || auth.currentUser?.uid || "unknown";
      await addDoc(
        collection(db, "adGroups", id, "assets", assetId, "history"),
        {
          status,
          updatedBy: userName,
          updatedAt: serverTimestamp(),
        },
      ).catch((err) => {
        if (err?.code === "already-exists") {
          console.log("History entry already exists, skipping");
        } else {
          throw err;
        }
      });
      await setDoc(
        doc(db, "recipes", recipeCode),
        {
          history: arrayUnion({
            timestamp: Date.now(),
            status,
            user: userName,
          }),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to update asset status", err);
    }
  };

  const toggleRecipeSelect = async (recipeNo, selected) => {
    try {
      await updateDoc(doc(db, "adGroups", id, "recipes", String(recipeNo)), {
        selected,
      });
      setRecipesMeta((prev) => ({
        ...prev,
        [recipeNo]: { ...(prev[recipeNo] || {}), selected },
      }));
    } catch (err) {
      console.error("Failed to update selection", err);
    }
  };

  const updateRecipeStatus = async (recipeCode, status, comment = "") => {
    const groupAssets = assets.filter((a) => {
      const info = parseAdFilename(a.filename || "");
      return (info.recipeCode || "unknown") === recipeCode;
    });
    if (groupAssets.length === 0) return;
    const hero = pickHeroAsset(groupAssets);
    const batch = writeBatch(db);
    groupAssets.forEach((a) => {
      batch.update(doc(db, "adGroups", id, "assets", a.id), {
        status,
        lastUpdatedBy: auth.currentUser?.uid || null,
        lastUpdatedAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
      if (hero) {
        const userName =
          auth.currentUser?.displayName || auth.currentUser?.uid || "unknown";
        await addDoc(
          collection(db, "adGroups", id, "assets", hero.id, "history"),
          {
            status,
            updatedBy: userName,
            updatedAt: serverTimestamp(),
          },
        ).catch((err) => {
          if (err?.code === "already-exists") {
            console.log("History entry already exists, skipping");
          } else {
            throw err;
          }
        });
      }

      await setDoc(
        doc(db, "recipes", recipeCode),
        {
          history: arrayUnion({
            timestamp: Date.now(),
            status,
            user:
              auth.currentUser?.displayName ||
              auth.currentUser?.uid ||
              "unknown",
            ...(comment
              ? {
                  editComment: comment,
                }
              : {}),
          }),
        },
        { merge: true },
      );

      setAssets((prev) =>
        prev.map((a) =>
          groupAssets.some((g) => g.id === a.id) ? { ...a, status } : a,
        ),
      );
    } catch (err) {
      console.error("Failed to update recipe status", err);
    }
  };

  const markDesigned = async () => {
    setDesignLoading(true);
    try {
      const batch = writeBatch(db);
      const pendingAssets = assets.filter((a) => a.status === "pending");
      for (const asset of pendingAssets) {
        batch.update(doc(db, "adGroups", id, "assets", asset.id), {
          status: "ready",
          lastUpdatedBy: null,
          lastUpdatedAt: serverTimestamp(),
        });
      }
      const groupVisibilityDefaults =
        group?.visibility !== "public"
          ? {
              visibility: "public",
              requireAuth: false,
              requirePassword: false,
              password: "",
            }
          : {};

      batch.update(doc(db, "adGroups", id), {
        status: "designed",
        ...groupVisibilityDefaults,
      });
      await batch.commit();
      if (pendingAssets.length > 0) {
        setAssets((prev) =>
          prev.map((a) =>
            pendingAssets.some((p) => p.id === a.id)
              ? { ...a, status: "ready" }
              : a,
          ),
        );
      }
      setGroup((prev) => ({
        ...prev,
        status: "designed",
        ...groupVisibilityDefaults,
      }));
    } catch (err) {
      console.error("Failed to mark designed", err);
    } finally {
      setDesignLoading(false);
    }
  };

  const [shareModal, setShareModal] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [clients, setClients] = useState([]);

  const handleShare = () => {
    setShareModal(true);
  };

  useEffect(() => {
    if (!clientModal) return;
    const fetchClients = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("role", "==", "client"))
        );
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() ?? 0) -
            (a.createdAt?.toMillis?.() ?? 0),
        );
        setClients(list);
      } catch (err) {
        console.error("Failed to fetch clients", err);
        setClients([]);
      }
    };
    fetchClients();
  }, [clientModal]);

  const handleSendToProjects = async (clientId) => {
    if (!id || !group || !clientId) return;
    try {
      let { agencyId, recipeTypes } = group;
      if (agencyId == null || recipeTypes == null) {
        try {
          const snap = await getDoc(doc(db, "brands", group.brandCode));
          if (snap.exists()) {
            const data = snap.data() || {};
            if (agencyId == null) agencyId = data.agencyId ?? null;
            if (recipeTypes == null)
              recipeTypes = Array.isArray(data.recipeTypes)
                ? data.recipeTypes
                : [];
          } else {
            if (agencyId == null) agencyId = null;
            if (recipeTypes == null) recipeTypes = [];
          }
        } catch (err) {
          console.error("Failed to fetch brand defaults", err);
          if (agencyId == null) agencyId = null;
          if (recipeTypes == null) recipeTypes = [];
        }
      }

      const payload = {
        title: group.name || "",
        brandCode: group.brandCode || "",
        status: group.status || "new",
        recipeTypes: Array.isArray(recipeTypes) ? recipeTypes : [],
        agencyId: agencyId ?? null,
        month: group.month || null,
      };

      const projRef = await addDoc(collection(db, "projects"), {
        ...payload,
        groupId: id,
        userId: clientId,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "adGroups", id), {
        ...payload,
        projectId: projRef.id,
        uploadedBy: clientId,
      });
      window.alert("Ad group added to client projects");
      setClientModal(false);
    } catch (err) {
      window.alert(
        `Failed to add group to projects: ${err?.message || err}`,
      );
      console.error("Failed to add group to projects", err);
    }
  };

  const allStatusOptions = ['new', 'briefed', 'designed', 'reviewed', 'done', 'blocked'];

  const editorStatusOptions = ['new', 'briefed', 'blocked'];
  const designerStatusOptions = ['briefed', 'designed', 'blocked'];

  const statusOptions = useMemo(() => {
    const appendCurrentStatus = (options) => {
      const list = [...options];
      if (group?.status && !list.includes(group.status)) {
        list.unshift(group.status);
      }
      return list;
    };

    if (isAdmin) return appendCurrentStatus(allStatusOptions);
    if (isEditor) return appendCurrentStatus(editorStatusOptions);
    if (isDesigner) return appendCurrentStatus(designerStatusOptions);
    return appendCurrentStatus([]);
  }, [group?.status, isAdmin, isDesigner, isEditor]);

  const handleStatusChange = async (e) => {
    if (!id) return;
    const newStatus = e.target.value;
    if (!statusOptions.includes(newStatus)) return;
    const visibilityDefaults =
      newStatus === "designed" && group?.visibility !== "public"
        ? {
            visibility: "public",
            requireAuth: false,
            requirePassword: false,
            password: "",
          }
        : {};
    try {
      await updateDoc(doc(db, "adGroups", id), {
        status: newStatus,
        ...visibilityDefaults,
      });
      setGroup((p) => ({
        ...p,
        status: newStatus,
        ...visibilityDefaults,
      }));
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const sanitize = (str) =>
    (str || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "unknown";

  const computeExportGroups = () => {
    const approved = assets.filter((a) => a.status === "approved");
    return approved.map((a) => {
      const info = parseAdFilename(a.filename || "");
      const recipe = a.recipeCode || info.recipeCode;
      const meta = recipesMeta[recipe] || {};
      return [{ asset: a, meta }];
    });
  };

  useEffect(() => {
    if (!exportModal) return;
    const groups = computeExportGroups();
    setPreviewGroups(groups.length);
  }, [exportModal, groupBy, maxAds, assets, recipesMeta]);

  const crcTable = useMemo(() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  }, []);

  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const makeZip = async (files) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const f of files) {
      const nameBuf = encoder.encode(f.path);
      const data = new Uint8Array(f.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBuf.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBuf.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBuf, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBuf.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBuf.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBuf, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    }
    const centralOffset = offset;
    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);
    const size =
      localParts.reduce((s, p) => s + p.length, 0) + centralSize + end.length;
    const zip = new Uint8Array(size);
    let ptr = 0;
    for (const part of localParts) {
      zip.set(part, ptr);
      ptr += part.length;
    }
    for (const part of centralParts) {
      zip.set(part, ptr);
      ptr += part.length;
    }
    zip.set(end, ptr);
    return new Blob([zip], { type: "application/zip" });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const groups = computeExportGroups();
      const files = [];
      const base = `${sanitize(group?.brandCode)}_${sanitize(group?.name)}`;
      const root = `${base}_`;
      for (const list of groups) {
        if (list.length === 0) continue;
        const { asset } = list[0];
        const info = parseAdFilename(asset.filename || "");
        const recipe = asset.recipeCode || info.recipeCode || "";
        const folder = `${root}${recipe}`;
        const resp = await fetch(asset.firebaseUrl);
        const buf = await resp.arrayBuffer();
        files.push({ path: `${folder}/${asset.filename}`, data: buf });
      }
      if (files.length === 0) {
        window.alert("No approved ads found");
        return;
      }
      const blob = await makeZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportModal(false);
    } catch (err) {
      console.error("Export failed", err);
      window.alert("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const deleteAsset = async (asset) => {
    if (isDesigner && ["approved", "rejected"].includes(asset.status)) {
      window.alert("Designers cannot delete approved or rejected ads.");
      return;
    }
    const confirmDelete = window.confirm("Delete this asset?");
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, "adGroups", id, "assets", asset.id));
      try {
        await deleteDoc(doc(db, "adAssets", asset.id));
      } catch (err) {
        // optional root doc may not exist
      }
      if (asset.filename || asset.firebaseUrl) {
        try {
          const fileRef = ref(
            storage,
            asset.firebaseUrl ||
              `Campfire/Brands/${group?.brandCode}/Adgroups/${
                group?.name || id
              }/${asset.filename}`,
          );
          await deleteObject(fileRef);
        } catch (err) {
          console.error("Failed to delete storage file", err);
        }
      }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setInspectRecipe((prev) =>
        prev
          ? { ...prev, assets: prev.assets.filter((a) => a.id !== asset.id) }
          : prev,
      );
      setPreviewAsset((prev) => (prev?.id === asset.id ? null : prev));
    } catch (err) {
      console.error("Failed to delete asset", err);
    }
  };

  const deleteRecipe = async (recipeCode) => {
    const confirmDelete = window.confirm("Delete this recipe and all assets?");
    if (!confirmDelete) return;
    const groupAssets = assets.filter((a) => {
      const info = parseAdFilename(a.filename || "");
      return (info.recipeCode || "unknown") === recipeCode;
    });
    try {
      await Promise.all(
        groupAssets.map(async (a) => {
          await deleteDoc(doc(db, "adGroups", id, "assets", a.id));
          try {
            await deleteDoc(doc(db, "adAssets", a.id));
          } catch (_) {}
          if (a.filename || a.firebaseUrl) {
            try {
              const fileRef = ref(
                storage,
                a.firebaseUrl ||
                  `Campfire/Brands/${group?.brandCode}/Adgroups/${
                    group?.name || id
                  }/${a.filename}`,
              );
              await deleteObject(fileRef);
            } catch (err) {
              console.error("Failed to delete storage file", err);
            }
          }
        }),
      );
      setAssets((prev) =>
        prev.filter((a) => !groupAssets.some((g) => g.id === a.id)),
      );
    } catch (err) {
      console.error("Failed to delete recipe assets", err);
    }
  };

  const renderRecipeRow = (g, idx) => {
    const hasRevision = g.assets.some(
      (a) =>
        (a.version || parseAdFilename(a.filename || "").version || 1) > 1 ||
        a.status === "edit_requested",
    );

    const editAsset = g.assets.find(
      (a) => a.status === "edit_requested" && (a.comment || a.copyEdit),
    );

    const activeAds = g.assets.filter((a) => a.status !== "archived");

    const normalizedRecipe = normalizeRecipeCode(g.recipeCode);
    const storedAssignmentId = normalizedRecipe
      ? copyAssignments[normalizedRecipe]
      : "";
    const resolvedCopyCard =
      (storedAssignmentId && copyCardById[storedAssignmentId]) ||
      (copyCardsWithMeta.length > 0 ? copyCardsWithMeta[0] : null);
    const resolvedCopyId = resolvedCopyCard?.id || "";
    const assignedLetter = resolvedCopyCard?.letter || "";
    const isSavingAssignment = !!copyAssignmentSaving[normalizedRecipe];
    const hasOverride = g.assets.some(
      (a) =>
        a.platformCopyOverride &&
        (a.platformCopyOverride.primary ||
          a.platformCopyOverride.headline ||
          a.platformCopyOverride.description),
    );
    const copyDescription =
      resolvedCopyCard?.resolvedProduct ||
      getRecipeProductName(g.recipeCode) ||
      (copyCardsWithMeta.length > 0 ? "Generic" : "No platform copy");

    const isAlt = idx % 2 === 1;
    return (
      <tbody key={g.recipeCode}>
        <tr className={`recipe-row${isAlt ? " alt-row" : ""}`}>
          <td className="font-semibold flex items-center gap-2">
            Recipe {g.recipeCode}
            <IconButton
              aria-label="Inspect Ads"
              onClick={() => setInspectRecipe(g)}
            >
              <FiEye />
            </IconButton>
          </td>
          <td className="align-top">
            {activeAds.length === 0 ? (
              <span className="text-xs text-gray-500">No ads uploaded</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeAds.map((asset) => {
                  const videoSource = asset.cdnUrl || asset.firebaseUrl || "";
                  const isVideo = isVideoUrl(videoSource);
                  const previewImage =
                    asset.thumbnailUrl || (!isVideo ? videoSource : "");
                  const hasPreviewAsset = Boolean(
                    asset.thumbnailUrl || asset.firebaseUrl || asset.cdnUrl,
                  );
                  const aspectLabel = asset.aspectRatio
                    ? String(asset.aspectRatio).toUpperCase()
                    : "";
                  return (
                    <button
                      type="button"
                      key={asset.id || asset.filename}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasPreviewAsset) {
                          setPreviewAsset({ ...asset });
                        }
                      }}
                      disabled={!hasPreviewAsset}
                      className={`relative group w-16 h-16 flex items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent ${
                        hasPreviewAsset
                          ? "hover:ring-2 hover:ring-accent cursor-pointer"
                          : "opacity-60 cursor-not-allowed"
                      }`}
                      title={asset.filename || undefined}
                      aria-label={
                        hasPreviewAsset
                          ? `Preview ${asset.filename || "ad"}`
                          : "Preview unavailable"
                      }
                    >
                      {previewImage ? (
                        <OptimizedImage
                          pngUrl={previewImage}
                          alt={asset.filename || "Ad thumbnail"}
                          cacheKey={asset.id || previewImage}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="px-1 text-[10px] text-gray-600 text-center leading-tight">
                          No preview
                        </span>
                      )}
                      {isVideo && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 text-white">
                          <FiPlay />
                        </span>
                      )}
                      {aspectLabel && (
                        <span className="absolute bottom-0 left-0 right-0 text-[10px] font-semibold text-white bg-black bg-opacity-60 px-1 py-0.5 leading-none">
                          {aspectLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </td>
          <td className="align-top text-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`${
                    hasOverride
                      ? 'border-gray-300 bg-gray-100 text-gray-400'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-400/60 dark:bg-indigo-500/10 dark:text-indigo-200'
                  } inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold`}
                >
                  {assignedLetter || '—'}
                </span>
                {hasOverride ? (
                  <span className="text-xs text-gray-400">Copy edited in review</span>
                ) : copyCardsWithMeta.length > 0 ? (
                  <select
                    value={resolvedCopyId}
                    onChange={(event) =>
                      handleCopyAssignmentChange(g.recipeCode, event.target.value)
                    }
                    disabled={isSavingAssignment}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200"
                    aria-label="Select platform copy"
                  >
                    {copyCardsWithMeta.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.letter} — {card.resolvedProduct || 'Generic'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-400">No platform copy</span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-300">
                {isSavingAssignment ? 'Saving...' : copyDescription}
              </p>
            </div>
          </td>
          <td className="text-center">
            <StatusBadge status={getRecipeStatus(g.assets)} />
          </td>
          <td className="text-sm">
            {editAsset && (
              <>
                {editAsset.comment && (
                  <span className="block italic">{editAsset.comment}</span>
                )}
                {editAsset.copyEdit &&
                  renderCopyEditDiff(g.recipeCode, editAsset.copyEdit)}
              </>
            )}
          </td>
          <td className="relative text-right">
            <IconButton
              aria-label="Menu"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuRecipe((m) =>
                  m && m.recipeCode === g.recipeCode
                    ? null
                    : { ...g, hasRevision, rect },
                );
              }}
            >
              <FiMoreHorizontal size={20} />
            </IconButton>
            {menuRecipe && menuRecipe.recipeCode === g.recipeCode && (
              <ul
                ref={menuRef}
                className="fixed w-48 bg-white border rounded shadow-md z-50"
                style={{
                  top: menuRecipe.rect.bottom + 8,
                  right: window.innerWidth - menuRecipe.rect.right,
                }}
              >
                  <li>
                    <button
                      className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100"
                      onClick={() => {
                        if (menuRecipe.hasRevision) {
                          openRevision(menuRecipe.recipeCode);
                        }
                        setMenuRecipe(null);
                      }}
                      disabled={!menuRecipe.hasRevision}
                    >
                      <FiRefreshCw />
                      <span>Make Revisions</span>
                    </button>
                  </li>
                  <li>
                    <button
                      className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100"
                      onClick={() => {
                        openHistory(menuRecipe.recipeCode);
                        setMenuRecipe(null);
                      }}
                    >
                      <FiClock />
                      <span>History</span>
                    </button>
                  </li>
                  <li>
                    <button
                      className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100"
                      onClick={() => {
                        const rawId = menuRecipe.recipeCode;
                        const normId = normalizeId(rawId);
                        setMetadataRecipe(
                          recipesMeta[rawId] ||
                            recipesMeta[String(rawId).toLowerCase()] ||
                            recipesMeta[normId] || { id: rawId },
                        );
                        setMenuRecipe(null);
                      }}
                    >
                      <FiFileText />
                      <span>Metadata</span>
                    </button>
                  </li>
                  {!isDesigner && (
                    <li>
                      <button
                        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600"
                        onClick={() => {
                          deleteRecipe(menuRecipe.recipeCode);
                          setMenuRecipe(null);
                        }}
                      >
                        <FiTrash />
                        <span>Delete</span>
                      </button>
                    </li>
                  )}
                </ul>
              )}
          </td>
        </tr>
      </tbody>
    );
  };

  if (!group) {
    return <LoadingOverlay />;
  }

  const blockerTab =
    group.status === 'blocked' ? (
      <TabButton active={tab === 'blocker'} onClick={() => setTab('blocker')}>
        <FiAlertTriangle size={18} />
        Blocker
      </TabButton>
    ) : null;

  const renderTabNavigation = () => {
    if (isClientPortalUser) {
      return (
        <>
          {blockerTab}
          <TabButton active={tab === 'brief'} onClick={() => setTab('brief')}>
            <FiFileText size={18} />
            Brief
          </TabButton>
          <TabButton active={tab === 'ads'} onClick={() => setTab('ads')}>
            <FiEye size={18} />
            Ads
          </TabButton>
          <TabButton active={tab === 'copy'} onClick={() => setTab('copy')}>
            <FiType size={18} />
            Platform Copy
          </TabButton>
          <TabButton active={tab === 'feedback'} onClick={() => setTab('feedback')}>
            <FiMessageSquare size={18} />
            Feedback
          </TabButton>
        </>
      );
    }

    return (
      <>
        {blockerTab}
        <TabButton active={tab === 'stats'} onClick={() => setTab('stats')}>
          <FiBarChart2 size={18} />
          Stats
        </TabButton>
        <TabButton active={tab === 'brief'} onClick={() => setTab('brief')}>
          <FiFileText size={18} />
          Brief
        </TabButton>
        {canManageCopy && (
          <TabButton active={tab === 'copy'} onClick={() => setTab('copy')}>
            <FiType size={18} />
            Platform Copy
          </TabButton>
        )}
        <TabButton active={tab === 'assets'} onClick={() => setTab('assets')}>
          <FiFolder size={18} />
          Brand Assets
        </TabButton>
        <TabButton active={tab === 'ads'} onClick={() => setTab('ads')}>
          <FiEye size={18} />
          Ads
        </TabButton>
        {(isAdmin || isEditor || isDesigner || isManager) && (
          <TabButton active={tab === 'feedback'} onClick={() => setTab('feedback')}>
            <FiMessageSquare size={18} />
            Feedback
          </TabButton>
        )}
      </>
    );
  };

  const renderActionButtons = () => {
    if (isAdmin || userRole === 'agency' || isDesigner) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          {group.status === 'archived' && isAdmin && (
            <IconButton
              onClick={restoreGroup}
              aria-label="Restore Group"
              className="bg-transparent"
            >
              <FiRotateCcw size={20} />
            </IconButton>
          )}
          {tab === 'ads' && (group.status !== 'archived' || isAdmin) && (
            <>
              <input
                id="upload-input"
                type="file"
                multiple
                onChange={(e) => {
                  const sel = e.target.files;
                  handleUpload(sel);
                  e.target.value = null;
                }}
                className="hidden"
              />
              <IconButton
                onClick={() => document.getElementById('upload-input').click()}
                className="bg-transparent"
              >
                <FiUpload size={20} />
                Upload
              </IconButton>
            </>
          )}
          {(isAdmin || userRole === 'agency') && (
            <IconButton
              onClick={resetGroup}
              aria-label="Reset"
              className="bg-transparent"
            >
              <FiRefreshCw size={20} />
            </IconButton>
          )}
          {(isAdmin || userRole === 'agency' || isDesigner) && (
            <IconButton
              onClick={markDesigned}
              disabled={
                designLoading ||
                assets.length === 0 ||
                group.status === 'designed'
              }
              className="bg-transparent"
              aria-label="Designed"
            >
              <FiCheckCircle size={20} />
            </IconButton>
          )}
          {(isAdmin || userRole === 'agency') && (
            <>
              <IconButton
                as={Link}
                to={`/review/${id}`}
                aria-label="Review"
                className="bg-transparent"
              >
                <FiBookOpen size={20} />
              </IconButton>
              <IconButton
                onClick={handleShare}
                aria-label="Share"
                className="bg-transparent"
              >
                <FiShare2 size={20} />
              </IconButton>
              {isAdmin && (
                <IconButton
                  onClick={() => setClientModal(true)}
                  aria-label="Send to Projects"
                  className="bg-transparent"
                >
                  <FiSend size={20} />
                </IconButton>
              )}
              {(isAdmin || isManager) && (
                <>
                  <IconButton
                    onClick={() => setExportModal(true)}
                    aria-label="Export Approved"
                    className="bg-transparent"
                  >
                    <FiDownload size={20} />
                  </IconButton>
                  {hasScrubbed && (
                    <IconButton
                      onClick={undoScrubReviewHistory}
                      aria-label="Undo Scrub"
                      className="bg-transparent"
                    >
                      <FiRotateCw size={20} />
                    </IconButton>
                  )}
                  <IconButton
                    onClick={scrubReviewHistory}
                    aria-label="Scrub Review History"
                    className="bg-transparent"
                  >
                    <Bubbles size={20} />
                  </IconButton>
                  <IconButton
                    onClick={archiveGroup}
                    aria-label="Archive"
                    className="bg-transparent"
                  >
                    <FiArchive size={20} />
                  </IconButton>
                </>
              )}
            </>
          )}
        </div>
      );
    }

    if (isClientPortalUser) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton onClick={handleShare} aria-label="Share" className="bg-transparent">
            <FiShare2 size={20} />
          </IconButton>
          <IconButton
            as={Link}
            to={`/review/${id}`}
            aria-label="Review"
            className="bg-transparent"
          >
            <FiBookOpen size={20} />
          </IconButton>
          <IconButton
            onClick={() => setExportModal(true)}
            aria-label="Download Approved"
            className="bg-transparent"
          >
            <FiDownload size={20} />
          </IconButton>
        </div>
      );
    }

    if (userRole === 'editor') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            onClick={() => setShowGallery(true)}
            aria-label="See Gallery"
            className="bg-transparent"
          >
            <FiGrid size={20} />
          </IconButton>
        </div>
      );
    }

    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        No quick actions available for your role.
      </p>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex items-center gap-2">
            <Link to={backPath} className="btn-arrow" aria-label="Back">
              &lt;
            </Link>
            <h1 className="flex-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {group.name}
            </h1>
            {userRole === "project-manager" && (
              <Link
                to={ganttPath}
                className="btn-secondary"
                aria-label="View Gantt Chart"
              >
                Gantt
              </Link>
            )}
          </div>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="md:col-span-2 xl:col-span-3">
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Brand
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {group.brandCode}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Status
                    </span>
                    <div className="text-sm">
                      {isAdmin || isEditor || isDesigner ? (
                        <select
                          aria-label="Status"
                          value={group.status}
                          onChange={handleStatusChange}
                          className={`status-select status-${(group.status || '').replace(/\s+/g, '_')}`}
                        >
                          {statusOptions.map((s) => (
                            <option
                              key={s}
                              value={s}
                              disabled={isDesigner && s === 'briefed'}
                              hidden={isDesigner && s === 'briefed'}
                            >
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={group.status} />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Due Date
                    </span>
                    {userRole === 'admin' || userRole === 'agency' ? (
                      <input
                        type="date"
                        value={
                          group.dueDate
                            ? group.dueDate.toDate().toISOString().slice(0, 10)
                            : ''
                        }
                        onChange={async (e) => {
                          const date = e.target.value
                            ? Timestamp.fromDate(new Date(e.target.value))
                            : null;
                          try {
                            await updateDoc(doc(db, 'adGroups', id), { dueDate: date });
                            setGroup((p) => ({ ...p, dueDate: date }));
                            if (group.requestId) {
                              try {
                                await updateDoc(doc(db, 'requests', group.requestId), {
                                  dueDate: date,
                                });
                              } catch (err) {
                                console.error('Failed to sync ticket due date', err);
                              }
                            }
                          } catch (err) {
                            console.error('Failed to update due date', err);
                          }
                        }}
                        className="border tag-pill px-2 py-1 text-sm"
                      />
                    ) : (
                      <span>
                        {group.dueDate
                          ? group.dueDate.toDate().toLocaleDateString()
                          : 'N/A'}
                      </span>
                    )}
                  </div>
                  {(isAdmin || isEditor) && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Review Type
                      </span>
                      <select
                        aria-label="Review Type"
                        value={group.reviewVersion || 1}
                        onChange={handleReviewTypeChange}
                        className="border p-1 text-sm"
                      >
                        <option value={1}>Legacy</option>
                        <option value={2}>2.0</option>
                        <option value={3}>Brief</option>
                      </select>
                    </div>
                  )}
                  {(brandHasAgency || userRole === 'admin') && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Month
                      </span>
                      <input
                        type="month"
                        value={group.month || ''}
                        onChange={async (e) => {
                          const value = e.target.value;
                          try {
                            if (value) {
                              await updateDoc(doc(db, 'adGroups', id), { month: value });
                              setGroup((p) => ({ ...p, month: value }));
                              if (group.requestId) {
                                try {
                                  await updateDoc(doc(db, 'requests', group.requestId), { month: value });
                                } catch (err) {
                                  console.error('Failed to sync ticket month', err);
                                }
                              }
                            } else {
                              await updateDoc(doc(db, 'adGroups', id), { month: deleteField() });
                              setGroup((p) => {
                                const u = { ...p };
                                delete u.month;
                                return u;
                              });
                              if (group.requestId) {
                                try {
                                  await updateDoc(doc(db, 'requests', group.requestId), { month: deleteField() });
                                } catch (err) {
                                  console.error('Failed to sync ticket month', err);
                                }
                              }
                            }
                          } catch (err) {
                            console.error('Failed to update month', err);
                          }
                        }}
                        className="border tag-pill px-2 py-1 text-sm"
                      />
                    </div>
                  )}
                </div>
                {(!isClientPortalUser || isProjectManager) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Editor
                      </span>
                      {canManageStaff ? (
                        <select
                          aria-label="Editor Assignment"
                          value={group.editorId || ''}
                          onChange={async (e) => {
                            const value = e.target.value || null;
                            try {
                              await updateDoc(doc(db, 'adGroups', id), { editorId: value });
                              setGroup((p) => ({ ...p, editorId: value }));
                            } catch (err) {
                              console.error('Failed to update editor', err);
                            }
                          }}
                          className="border p-1 rounded"
                        >
                          <option value="">Unassigned</option>
                          {editors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{editorName || 'Unassigned'}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Editor Due Date
                      </span>
                      {canManageStaff ? (
                        <input
                          type="date"
                          value={
                            group.editorDueDate
                              ? (group.editorDueDate.toDate
                                  ? group.editorDueDate.toDate().toISOString().slice(0, 10)
                                  : new Date(group.editorDueDate).toISOString().slice(0, 10))
                              : ''
                          }
                          onChange={async (e) => {
                            const date = e.target.value
                              ? Timestamp.fromDate(new Date(e.target.value))
                              : null;
                            try {
                              await updateDoc(doc(db, 'adGroups', id), { editorDueDate: date });
                              setGroup((p) => ({ ...p, editorDueDate: date }));
                            } catch (err) {
                              console.error('Failed to update editor due date', err);
                            }
                          }}
                          className="border tag-pill px-2 py-1 text-sm"
                        />
                      ) : (
                        <span>
                          {group.editorDueDate
                            ? (group.editorDueDate.toDate
                                ? group.editorDueDate.toDate().toLocaleDateString()
                                : new Date(group.editorDueDate).toLocaleDateString())
                            : 'N/A'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Designer
                      </span>
                      {canManageStaff ? (
                        <select
                          aria-label="Designer Assignment"
                          value={group.designerId || ''}
                          onChange={async (e) => {
                            const value = e.target.value || null;
                            try {
                              await updateDoc(doc(db, 'adGroups', id), { designerId: value });
                              setGroup((p) => ({ ...p, designerId: value }));
                            } catch (err) {
                              console.error('Failed to update designer', err);
                            }
                          }}
                          className="border p-1 rounded"
                        >
                          <option value="">Unassigned</option>
                          {designers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{designerName || 'Unassigned'}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Design Due Date
                      </span>
                      {canManageStaff ? (
                        <input
                          type="date"
                          value={
                            group.designDueDate
                              ? (group.designDueDate.toDate
                                  ? group.designDueDate.toDate().toISOString().slice(0, 10)
                                  : new Date(group.designDueDate).toISOString().slice(0, 10))
                              : ''
                          }
                          onChange={async (e) => {
                            const date = e.target.value
                              ? Timestamp.fromDate(new Date(e.target.value))
                              : null;
                            try {
                              await updateDoc(doc(db, 'adGroups', id), { designDueDate: date });
                              setGroup((p) => ({ ...p, designDueDate: date }));
                            } catch (err) {
                              console.error('Failed to update design due date', err);
                            }
                          }}
                          className="border tag-pill px-2 py-1 text-sm"
                        />
                      ) : (
                        <span>
                          {group.designDueDate
                            ? (group.designDueDate.toDate
                                ? group.designDueDate.toDate().toLocaleDateString()
                                : new Date(group.designDueDate).toLocaleDateString())
                            : 'N/A'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {group.status === 'archived' && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                    This ad group is archived and read-only.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 p-3 dark:border-[var(--border-color-default)] md:col-span-2 xl:col-span-1">
              <div className="flex flex-wrap gap-2">
                {renderTabNavigation()}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 p-3 text-sm text-gray-600 dark:border-[var(--border-color-default)] dark:text-gray-300 md:col-span-2 xl:col-span-1">
              {renderActionButtons()}
            </div>
          </section>

          {uploading && (
            <p className="text-sm text-gray-600 dark:text-gray-300">Uploading...</p>
          )}

      {showStats && (
        <>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card">
              <p className="stat-card-title">Recipes</p>
              <p className="stat-card-value">{recipeCount}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-title">Ad Units</p>
              <p className="stat-card-value">{unitCount}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card status-pending">
              <p className="stat-card-title">Pending</p>
              <p className="stat-card-value">{unitStatusCounts.pending}</p>
            </div>
            <div className="stat-card status-approved">
              <p className="stat-card-title">Approved</p>
              <p className="stat-card-value">{unitStatusCounts.approved}</p>
            </div>
            <div className="stat-card status-rejected">
              <p className="stat-card-title">Rejected</p>
              <p className="stat-card-value">{unitStatusCounts.rejected}</p>
            </div>
            <div className="stat-card status-edit_requested">
              <p className="stat-card-title">Edit</p>
              <p className="stat-card-value">{unitStatusCounts.edit_requested}</p>
            </div>
          </div>
        </>
      )}

      {(tableVisible || (showStats && specialGroups.length > 0)) && (
        <Table
          columns={["18%", "28%", "12%", "14%", "18%", "10%"]}
          className="min-w-full"
        >
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Ads</th>
              <th>Copy</th>
              <th>Status</th>
              <th>Edit Request</th>
              <th></th>
            </tr>
          </thead>
          {(tableVisible
            ? [...specialGroups, ...normalGroups]
            : showStats
              ? specialGroups
              : []
          ).map((g, idx) => renderRecipeRow(g, idx))}
        </Table>
      )}

      <div className="flex my-4">
        {!usesTabs && (
          <>
            <IconButton
              onClick={() => setShowTable((p) => !p)}
            >
              {showTable ? "Hide Table" : "Show All Ads"}
            </IconButton>
            {savedRecipes.length > 0 && (
              <IconButton
                onClick={() => setShowRecipesTable((p) => !p)}
                className="ml-2"
              >
                {showRecipesTable ? "Hide Brief" : "See Brief"}
              </IconButton>
            )}
          </>
        )}
        {usesTabs && tab === "ads" && group.status !== "archived" && canUploadAds && (
          <button
            onClick={() => document.getElementById("upload-input").click()}
            className="btn-primary px-2 py-0.5 flex items-center gap-1 ml-2"
          >
            <FiUpload />
            Upload Ads
          </button>
        )}
      </div>


      {recipesTableVisible && (
        <div className="my-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Brief Note</h3>
                  {canEditBriefNote && !editingNotes && (
                    <IconButton
                      onClick={() => {
                        setNotesInput(group?.notes || '');
                        setEditingNotes(true);
                      }}
                    >
                      {group?.notes ? 'Edit Note' : 'Add Note'}
                    </IconButton>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-100"
                      rows={3}
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={saveNotes} className="btn-primary px-3 py-1 text-sm">
                        Save
                      </button>
                      <IconButton onClick={() => setEditingNotes(false)}>Cancel</IconButton>
                    </div>
                  </div>
                ) : group?.notes ? (
                  <p className="whitespace-pre-line rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-200">
                    {group.notes}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {canEditBriefNote
                      ? 'Add context for the team by creating a brief note.'
                      : 'No brief note has been provided yet.'}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Brief Assets</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {briefAssets.length > 0 && (
                      <IconButton onClick={downloadBriefAll}>
                        <FiDownload />
                        Download All
                      </IconButton>
                    )}
                    {canAddBriefAssets && (
                      <>
                        <input
                          id="brief-upload"
                          type="file"
                          multiple
                          onChange={(e) => {
                            handleBriefUpload(e.target.files);
                            e.target.value = null;
                          }}
                          className="hidden"
                        />
                        <IconButton onClick={() => document.getElementById('brief-upload').click()}>
                          <FiUpload />
                          Add Assets
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={`flex flex-wrap gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500 transition-colors dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] ${briefDrag ? 'ring-2 ring-accent/50' : ''}`}
                  onDragOver={canAddBriefAssets ? (e) => {
                    e.preventDefault();
                    setBriefDrag(true);
                  } : undefined}
                  onDragLeave={canAddBriefAssets ? () => setBriefDrag(false) : undefined}
                  onDrop={canAddBriefAssets ? (e) => {
                    e.preventDefault();
                    setBriefDrag(false);
                    handleBriefUpload(e.dataTransfer.files);
                  } : undefined}
                >
                  {briefAssets.length > 0 ? (
                    briefAssets.map((a) => (
                      <div key={a.id} className="asset-card group cursor-pointer">
                        {(() => {
                          const ext = fileExt(a.filename || '');
                          if (a.firebaseUrl && ext === 'svg') {
                            const img = (
                              <img
                                src={a.firebaseUrl}
                                alt={a.filename}
                                className="max-h-32 max-w-[10rem] object-contain"
                              />
                            );
                            return (
                              <a href={a.firebaseUrl} download>
                                {img}
                              </a>
                            );
                          }
                          if (
                            a.firebaseUrl &&
                            !['ai', 'pdf'].includes(ext) &&
                            !['otf', 'ttf', 'woff', 'woff2'].includes(ext)
                          ) {
                            const img = (
                              <OptimizedImage
                                pngUrl={a.firebaseUrl}
                                alt={a.filename}
                                className="max-h-32 max-w-[10rem] object-contain"
                              />
                            );
                            return (
                              <a href={a.firebaseUrl} download>
                                {img}
                              </a>
                            );
                          }
                          return (
                            <a href={a.firebaseUrl} download>
                              <PlaceholderIcon ext={ext} />
                            </a>
                          );
                        })()}
                        {a.note && (
                          <div className="absolute bottom-1 right-1 rounded-full bg-accent p-1 text-white">
                            <FiFileText size={14} />
                          </div>
                        )}
                        {userRole === 'admin' && (
                          <div className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-black bg-opacity-60 p-1 text-xs text-white group-hover:flex">
                            <a
                              href={a.firebaseUrl}
                              download
                              className="btn-secondary px-1 py-0.5"
                            >
                              Download
                            </a>
                            <label className="btn-secondary px-1 py-0.5 cursor-pointer">
                              Replace
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  replaceBriefAsset(a, e.target.files[0]);
                                  e.target.value = null;
                                }}
                              />
                            </label>
                            <button
                              onClick={() => addBriefAssetNote(a)}
                              className="btn-secondary px-1 py-0.5"
                            >
                              Note
                            </button>
                            <button
                              onClick={() => deleteBriefAsset(a)}
                              className="btn-delete px-1 py-0.5"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {userRole === 'designer' && a.note && (
                          <div className="absolute inset-0 hidden whitespace-pre-wrap break-words items-center justify-center bg-black/60 p-1 text-center text-xs text-white group-hover:flex">
                            {a.note}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="w-full text-center text-sm text-gray-500 dark:text-gray-400">
                      {canAddBriefAssets
                        ? 'Drag and drop files here or use Add Assets to upload brief materials.'
                        : 'No brief assets have been uploaded.'}
                    </p>
                  )}
                </div>
              </div>

              {savedRecipes.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)]">
                  <RecipePreview
                    onSave={saveRecipes}
                    initialResults={savedRecipes}
                    showOnlyResults
                    onSelectChange={toggleRecipeSelect}
                    onRecipesClick={() => setShowRecipes(true)}
                    externalOnly
                    hideActions={isClientPortalUser}
                  />
                </div>
              )}
              {['admin', 'editor', 'project-manager'].includes(userRole) && savedRecipes.length === 0 && (
                <div className="flex justify-start">
                  <IconButton onClick={() => setShowRecipes(true)}>
                    <FaMagic /> Briefs
                  </IconButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {canManageCopy && tab === 'copy' && (
        <div className="my-4">
          {copyCards.length > 0 ? (
            <CopyRecipePreview
              onSave={saveCopyCards}
              initialResults={copyCards}
              showOnlyResults
              onCopyClick={() => setShowCopyModal(true)}
              brandCode={group?.brandCode}
              hideBrandSelect
            />
          ) : (
            <div className="mt-4">
              <IconButton onClick={() => setShowCopyModal(true)}>
                <FiType /> Platform Copy
              </IconButton>
            </div>
          )}
        </div>
      )}

      {(isAdmin || isEditor || isDesigner || isManager || isClientPortalUser) &&
        tab === 'feedback' && (
        <div className="my-4 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Feedback summary
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {feedbackSummaryUpdatedAt
                    ? `Updated ${feedbackSummaryUpdatedAt.toLocaleString()}`
                    : 'Generate a snapshot summary of client feedback.'}
                </p>
              </div>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={handleUpdateSummary}
                disabled={updatingFeedbackSummary}
              >
                {updatingFeedbackSummary ? 'Updating…' : 'Update summary'}
              </Button>
            </div>
            <div className="px-5 pb-5">
              {feedbackSummary ? (
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
                  {renderedSummary}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-300">
                  No summary yet. Click “Update summary” to generate one.
                </p>
              )}
              {feedbackSummaryError ? (
                <p className="mt-3 text-sm text-red-600">{feedbackSummaryError}</p>
              ) : null}
            </div>
          </div>
          <FeedbackPanel
            entries={displayedFeedbackEntries}
            onOpenAsset={openFeedbackAsset}
            scopeOptions={feedbackScopeOptions}
            selectedScope={feedbackScope}
            onScopeChange={setFeedbackScope}
            loading={isFeedbackLoading}
          />
        </div>
      )}

      {group.status === 'blocked' && tab === 'blocker' && (
        <div className="my-4">
          <textarea
            value={blockerText}
            onChange={(e) => setBlockerText(e.target.value)}
            rows={4}
            className="w-full mb-2"
          />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  await updateDoc(doc(db, 'adGroups', id), { blocker: blockerText });
                  setGroup((p) => ({ ...p, blocker: blockerText }));
                } catch (err) {
                  console.error('Failed to save blocker', err);
                }
              }}
            >
              Save
            </button>
            <button
              className="btn-secondary"
              onClick={() => setBlockerText(group.blocker || '')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadSummary && (
        <Modal sizeClass="max-w-xl">
          <h3 className="mb-2 font-semibold">Missing Aspect Ratios</h3>
          <table className="w-full mb-4 text-sm">
            <thead>
              <tr>
                <th className="text-left p-1">Recipe</th>
                <th className="text-left p-1">Missing Ratios</th>
                <th className="text-left p-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(uploadSummary.missing).map(([recipe, ratios]) => (
                <tr key={recipe} className="border-t">
                  <td className="p-1">{recipe}</td>
                  <td className="p-1">{ratios.join(', ')}</td>
                  <td className="p-1">
                    <label className="mr-2">
                      <input
                        type="radio"
                        name={`act-${recipe}`}
                        checked={uploadSummary.choices[recipe] === 'carry'}
                        onChange={() =>
                          setUploadSummary((p) => ({
                            ...p,
                            choices: { ...p.choices, [recipe]: 'carry' },
                          }))
                        }
                      />{' '}
                      Carry forward previous version
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={`act-${recipe}`}
                        checked={uploadSummary.choices[recipe] === 'supply'}
                        onChange={() =>
                          setUploadSummary((p) => ({
                            ...p,
                            choices: { ...p.choices, [recipe]: 'supply' },
                          }))
                        }
                      />{' '}
                      I\'ll supply new files
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center mb-4">
            <input
              id="apply-all"
              type="checkbox"
              className="mr-2"
              checked={uploadSummary.applyAll}
              onChange={(e) => {
                const checked = e.target.checked;
                setUploadSummary((p) => ({
                  ...p,
                  applyAll: checked,
                  choices: Object.fromEntries(
                    Object.keys(p.missing).map((k) => [k, checked ? 'carry' : p.choices[k]]),
                  ),
                }));
              }}
            />
            <label htmlFor="apply-all">Apply to all</label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary px-2 py-0.5"
              onClick={() => setUploadSummary(null)}
            >
              Cancel
            </button>
            <button
              className="btn-primary px-2 py-0.5"
              onClick={confirmUpload}
              disabled={Object.keys(uploadSummary.missing).some((k) => !uploadSummary.choices[k])}
            >
              Continue
            </button>
          </div>
        </Modal>
      )}

      {revisionModal && (
        <Modal sizeClass="max-w-3xl">
          {(() => {
            hasApprovedV2 = revisionModal.assets.some(
              (x) =>
                (x.version || parseAdFilename(x.filename || '').version || 1) > 1 &&
                x.status === 'approved',
            );
            return null;
          })()}
          <h3 className="mb-2 font-semibold">Recipe {revisionModal.recipeCode} Revision</h3>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-auto max-h-[25rem]">
              {revisionModal.assets.map((a, idx) => (
                a.placeholder ? (
                  <div
                    key={"ph" + idx}
                    className="w-full h-40 flex flex-col items-center justify-center bg-gray-200 text-gray-600 cursor-pointer"
                    onClick={() => document.getElementById('rev-upload').click()}
                  >
                    <FiPlus className="text-2xl" />
                    <span>Upload Revision</span>
                    <input
                      id="rev-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        uploadRevision(revisionModal.assets[0], e.target.files);
                        e.target.value = null;
                      }}
                    />
                  </div>
                ) : (
                  <div key={a.id} className="relative">
                    <span className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs px-1 rounded">
                      V{a.version || parseAdFilename(a.filename || '').version || 1}
                    </span>
                    {((a.version || parseAdFilename(a.filename || '').version || 1) > 1) && (isDesigner || isManager) && a.status !== 'approved' && (
                      <label className="absolute top-1 right-1 bg-white bg-opacity-80 text-xs px-1 rounded cursor-pointer">
                        Replace
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            uploadRevision(a, e.target.files);
                            e.target.value = null;
                          }}
                        />
                      </label>
                    )}
                    {((a.version || parseAdFilename(a.filename || '').version || 1) > 1) && isDesigner && a.status === 'approved' && (
                      <span className="absolute top-1 right-1 bg-gray-300 text-xs px-1 rounded opacity-70">
                        Replace
                      </span>
                    )}
                    {isVideoUrl(a.firebaseUrl) ? (
                      <VideoPlayer
                        src={a.firebaseUrl}
                        poster={a.thumbnailUrl}
                        className="w-full object-contain max-h-[25rem]"
                      />
                    ) : (
                      <OptimizedImage
                        pngUrl={a.thumbnailUrl || a.firebaseUrl}
                        alt={a.filename}
                        className="w-full object-contain max-h-[25rem]"
                      />
                    )}
                  </div>
                )
              ))}
            </div>
            <div className="w-full md:w-60 overflow-auto max-h-[25rem]">
              <ul className="space-y-2">
                {revisionModal.history.map((h, idx) => (
                  <li key={idx} className="border-b pb-1 last:border-none text-sm">
                    <div className="flex justify-between items-baseline">
                      <span className="font-medium">{h.email}</span>
                      {h.lastUpdatedAt && (
                        <span className="text-xs text-gray-500">
                          {h.lastUpdatedAt.toDate
                            ? h.lastUpdatedAt.toDate().toLocaleString()
                            : new Date(h.lastUpdatedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={h.status} className="mt-1" />
                    {h.comment && <p className="italic">{h.comment}</p>}
                    {h.copyEdit && (
                      <p className="italic">
                        Edit: {renderCopyEditDiff(
                          revisionModal.recipeCode,
                          h.copyEdit,
                          h.origCopy,
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <label className="block text-sm mt-2">
            Copy
            <textarea
              className="mt-1 w-full border rounded p-1 text-black dark:text-black"
              value={revisionModal.copy}
              onChange={(e) =>
                setRevisionModal({ ...revisionModal, copy: e.target.value })
              }
              disabled={isDesigner}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <IconButton onClick={closeModals}>Close</IconButton>
            {isDesigner && hasApprovedV2 ? (
              <button className="btn-primary px-3 py-1 opacity-60 cursor-not-allowed" disabled>
                Version Approved
              </button>
            ) : (
              <button onClick={saveRevisionReady} className="btn-primary px-3 py-1">
                Ready
              </button>
            )}
          </div>
        </Modal>
      )}

      {inspectRecipe && (
        <Modal sizeClass="max-w-2xl w-full">
          <h3 className="mb-2 font-semibold">
            Recipe {inspectRecipe.recipeCode} Ads
          </h3>
          <div className="overflow-x-auto">
            <Table columns={["60%", "20%", "20%"]} className="min-w-full">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inspectRecipe.assets.map((a) => {
                  const designerEditable =
                    isDesigner && DESIGNER_EDITABLE_STATUSES.includes(a.status);
                  const statusOptions = isAdmin
                    ? [
                        "pending",
                        "ready",
                        "approved",
                        "rejected",
                        "edit_requested",
                        "archived",
                      ]
                    : DESIGNER_EDITABLE_STATUSES;
                  const designerDeleteDisabled =
                    isDesigner && ["approved", "rejected"].includes(a.status);
                  const hasPreview = Boolean(
                    a.firebaseUrl || a.thumbnailUrl || a.cdnUrl,
                  );
                  return (
                    <tr key={a.id}>
                      <td className="break-all">{a.filename}</td>
                      <td className="text-center">
                        {isAdmin || designerEditable ? (
                          <select
                            value={a.status}
                            onChange={(e) => updateAssetStatus(a.id, e.target.value)}
                            className={`status-select status-${a.status.replace(/\s+/g, '_')}`}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={a.status} />
                        )}
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <IconButton
                            onClick={() =>
                              hasPreview && setPreviewAsset({ ...a })
                            }
                            aria-label="Preview"
                            disabled={!hasPreview}
                            className={!hasPreview ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            <FiEye />
                          </IconButton>
                          <IconButton
                            onClick={() => openAssetHistory(a)}
                            aria-label="History"
                          >
                            <FiClock />
                          </IconButton>
                          <IconButton
                            onClick={() => deleteAsset(a)}
                            aria-label="Delete"
                            disabled={designerDeleteDisabled}
                            className={
                              designerDeleteDisabled
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }
                          >
                            <FiTrash />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="mt-3 flex justify-end">
            <IconButton onClick={closeModals}>Close</IconButton>
          </div>
        </Modal>
      )}

      {previewAsset && (
        <Modal sizeClass="max-w-3xl w-full">
          <h3 className="mb-2 font-semibold break-all">
            {previewAsset.filename || "Ad Preview"}
          </h3>
          {previewAsset.status && (
            <div className="mb-3">
              <StatusBadge status={previewAsset.status} />
            </div>
          )}
          <div className="flex justify-center bg-gray-100 rounded-lg p-4">
            {previewUrl ? (
              previewIsVideo ? (
                <VideoPlayer
                  src={previewUrl}
                  className="max-h-[70vh] w-full max-w-full object-contain"
                />
              ) : (
                <OptimizedImage
                  pngUrl={previewUrl}
                  alt={previewAsset.filename || "Ad Preview"}
                  cacheKey={previewAsset.firebaseUrl || previewUrl}
                  className="max-h-[70vh] w-full object-contain"
                />
              )
            ) : (
              <span className="text-sm text-gray-500">No preview available.</span>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <IconButton onClick={() => setPreviewAsset(null)}>Close</IconButton>
          </div>
        </Modal>
      )}

      {historyRecipe && (
        <Modal sizeClass="max-w-md">
          <h3 className="mb-2 font-semibold">
            Recipe {historyRecipe.recipeCode} History
          </h3>
          <ul className="mb-2 space-y-2 max-h-[60vh] overflow-auto">
            {historyRecipe.assets.map((a, idx) => (
              <li key={idx} className="border-b pb-2 last:border-none flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium">
                    {a.lastUpdatedAt
                      ? a.lastUpdatedAt.toDate
                        ? a.lastUpdatedAt.toDate().toLocaleString()
                        : new Date(a.lastUpdatedAt).toLocaleString()
                      : ""}{" "}
                    - {a.email}
                  </div>
                  <div className="text-sm">Status: {a.status}</div>
                  {a.comment && (
                    <div className="text-sm italic">Note: {a.comment}</div>
                  )}
                  {(() => {
                    const diff = renderCopyEditDiff(
                      historyRecipe.recipeCode,
                      a.copyEdit,
                      a.origCopy,
                    );
                    return diff ? (
                      <div className="text-sm italic">Edit Request: {diff}</div>
                    ) : null;
                  })()}
                </div>
                {isAdmin && (
                  <IconButton
                    onClick={() => deleteHistoryEntry(a.assetId, a.id)}
                    aria-label="Delete"
                  >
                    <FiTrash />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <IconButton onClick={() => setHistoryRecipe(null)}>Close</IconButton>
          </div>
        </Modal>
      )}

      {historyAsset && (
        <Modal sizeClass="max-w-md">
          <h3 className="mb-2 font-semibold">Ad {historyAsset.filename} History</h3>
          <ul className="mb-2 space-y-2 max-h-[60vh] overflow-auto">
            {historyAsset.assets.map((a, idx) => (
              <li key={idx} className="border-b pb-2 last:border-none flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium">
                  {a.lastUpdatedAt
                    ? a.lastUpdatedAt.toDate
                      ? a.lastUpdatedAt.toDate().toLocaleString()
                      : new Date(a.lastUpdatedAt).toLocaleString()
                    : ""}{" "}
                    - {a.email}
                  </div>
                  <div className="text-sm">Status: {a.status}</div>
                  {a.comment && (
                    <div className="text-sm italic">Note: {a.comment}</div>
                  )}
                  {(() => {
                    const diff = renderCopyEditDiff(
                      historyAsset.recipeCode,
                      a.copyEdit,
                      a.origCopy,
                    );
                    return diff ? (
                      <div className="text-sm italic">Edit Request: {diff}</div>
                    ) : null;
                  })()}
                </div>
                {isAdmin && (
                  <IconButton
                    onClick={() => deleteHistoryEntry(historyAsset.assetId, a.id)}
                    aria-label="Delete"
                  >
                    <FiTrash />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <IconButton onClick={() => setHistoryAsset(null)}>Close</IconButton>
          </div>
        </Modal>
      )}

      {metadataRecipe && (
        <Modal sizeClass="max-w-lg">
          <h3 className="mb-2 font-semibold">Metadata for Recipe {metadataRecipe.id}</h3>
          <div className="space-y-2">
            {metadataRecipe.components && (
              <div className="text-sm">
                {Object.entries(metadataRecipe.components).map(([k, v]) => {
                  const raw =
                    typeof v === "object" && v !== null
                      ? JSON.stringify(v)
                      : String(v);
                  const isLink = /^https?:/i.test(raw);
                  return (
                    <div key={k}>
                      <span className="font-semibold mr-1">{k}:</span>
                      <ExpandableText
                        value={raw}
                        maxLength={isLink ? 20 : 40}
                        isLink={isLink}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <label className="block text-sm">
              Copy
              <textarea
                className="mt-1 w-full border rounded p-1 text-black dark:text-black"
                value={metadataForm.copy}
                onChange={(e) =>
                  setMetadataForm({ ...metadataForm, copy: e.target.value })
                }
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <IconButton onClick={closeModals}>Cancel</IconButton>
            <button onClick={saveMetadata} className="btn-primary px-3 py-1">
              Save
            </button>
          </div>
        </Modal>
      )}

      {exportModal && (
        <Modal sizeClass="max-w-sm w-full">
          <h3 className="mb-2 font-semibold">Export Approved Ads</h3>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium mb-1">Group By</p>
                <label className="mr-2 text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={groupBy.includes("offer")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setGroupBy((p) => [...p, "offer"]);
                      } else {
                        setGroupBy((p) => p.filter((g) => g !== "offer"));
                      }
                    }}
                  />
                  Offer
                </label>
                <label className="mr-2 text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={groupBy.includes("angle")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setGroupBy((p) => [...p, "angle"]);
                      } else {
                        setGroupBy((p) => p.filter((g) => g !== "angle"));
                      }
                    }}
                  />
                  Angle
                </label>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={groupBy.includes("audience")}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setGroupBy((p) => [...p, "audience"]);
                      } else {
                        setGroupBy((p) => p.filter((g) => g !== "audience"));
                      }
                    }}
                  />
                  Audience
                </label>
              </div>
              <label className="block text-sm">
                Max Ads per Group
                <select
                  className="mt-1 w-full border rounded p-1 text-black dark:text-black"
                  value={maxAds}
                  onChange={(e) => setMaxAds(Number(e.target.value))}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
              <p className="text-sm">Preview Groups: {previewGroups}</p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <IconButton onClick={() => setExportModal(false)}>Cancel</IconButton>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary px-3 py-1"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
          </div>
        </Modal>
      )}

      {showRecipes && (
        <Modal sizeClass="max-w-[50rem] w-full overflow-auto max-h-[90vh] relative">
          <IconButton
            onClick={() => setShowRecipes(false)}
            className="absolute top-2 right-2"
          >
            Close
          </IconButton>
          <RecipePreview
            onSave={saveRecipes}
            brandCode={group?.brandCode}
            hideBrandSelect
            externalOnly
            showBriefExtras
          />
        </Modal>
      )}

      {showCopyModal && (
        <Modal sizeClass="max-w-[50rem] w-full max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Platform Copy</h2>
            <div className="flex gap-2">
              <button
                onClick={() => saveCopyCards(modalCopies, { append: true })}
                className={`btn-primary px-3 py-1 ${copyChanges ? '' : 'opacity-50 cursor-not-allowed'}`}
                disabled={!copyChanges}
              >
                Save
              </button>
              <IconButton onClick={() => setShowCopyModal(false)}>Close</IconButton>
            </div>
          </div>
          <p className="text-sm mb-2">
            These lines appear as the primary text, headline, and description on your Meta ads. Feel free to tweak or remove any of the options.
          </p>
          <div className="overflow-auto flex-1">
            <CopyRecipePreview
              onSave={(copies) => saveCopyCards(copies, { append: true })}
              brandCode={group?.brandCode}
              hideBrandSelect
              onCopiesChange={updateModalCopies}
            />
          </div>
        </Modal>
      )}

      {clientModal && (
        <Modal sizeClass="max-w-md w-full">
          <h2 className="text-lg font-semibold mb-4">Select Client</h2>
          <div className="mb-4 max-h-60 overflow-auto">
            {clients.map((c) => (
              <button
                key={c.id}
                className="block w-full text-left px-3 py-2 mb-2 rounded hover:bg-gray-100"
                onClick={() => handleSendToProjects(c.id)}
              >
                {c.fullName || c.email || c.id}
              </button>
            ))}
            {clients.length === 0 && (
              <p className="text-sm">No clients found.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setClientModal(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {showGallery && (
        <GalleryModal ads={assets} onClose={() => setShowGallery(false)} />
      )}

      {shareModal && (
        <ShareLinkModal
          groupId={id}
          visibility={group?.visibility}
          requireAuth={group?.requireAuth}
          requirePassword={group?.requirePassword}
          password={group?.password}
          onClose={() => setShareModal(false)}
          onUpdate={(u) => setGroup((p) => ({ ...p, ...u }))}
        />
      )}

      {usesTabs
        ? tab === "assets" && (
            <BrandAssetsLayout
              brandCode={group?.brandCode}
              guidelinesUrl={brandGuidelines}
              brandNotes={brandNotes}
            />
          )
        : showBrandAssets && (
            <BrandAssets
              brandCode={group?.brandCode}
              onClose={() => setShowBrandAssets(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdGroupDetail;
