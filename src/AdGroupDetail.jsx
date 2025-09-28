// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useEffect, useState, useRef, useMemo } from "react";
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
import IconButton from "./components/IconButton.jsx";
import TabButton from "./components/TabButton.jsx";
import Table from "./components/common/Table";
import stripVersion from "./utils/stripVersion";
import summarizeByRecipe from "./utils/summarizeByRecipe";
import FeedbackPanel from "./components/FeedbackPanel.jsx";
import detectMissingRatios from "./utils/detectMissingRatios";
import notifySlackStatusChange from "./utils/notifySlackStatusChange";

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

const normalizeId = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^0+/, "")
    .toLowerCase();

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
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [modalCopies, setModalCopies] = useState([]);
  const [showBrandAssets, setShowBrandAssets] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [feedback, setFeedback] = useState([]);
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
  const isManager =
    userRole === "manager" ||
    userRole === "editor" ||
    userRole === "project-manager";
  const canManageStaff = isAdmin || (isManager && !isEditor);
  const isClient = userRole === "client";
  const usesTabs = isAdmin || isDesigner || isManager || isClient;
  const tableVisible = usesTabs ? tab === "ads" : showTable;
  const recipesTableVisible = usesTabs ? tab === "brief" : showRecipesTable;
  const showStats = usesTabs ? (!isClient && tab === "stats") : !showTable;

  useEffect(() => {
    if (!isClient) return;
    if (!['brief', 'ads', 'copy', 'feedback'].includes(tab)) {
      setTab('brief');
    }
  }, [isClient, tab]);

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

  const renderCopyEditDiff = (recipeCode, edit, origOverride) => {
    const orig = origOverride ?? (recipesMeta[recipeCode]?.copy || "");
    if (!edit || edit === orig) return null;
    const diff = diffWords(orig, edit);
    return diff.map((p, i) => {
      const text = p.text ?? p.value ?? "";
      const type = p.type ?? "same";
      const space = i < diff.length - 1 ? " " : "";
      if (type === "same") return text + space;
      if (type === "removed")
        return (
          <span key={i} className="text-red-600 line-through">
            {text}
            {space}
          </span>
        );
      return (
        <span key={i} className="text-green-600 italic">
          {text}
          {space}
        </span>
      );
    });
  };

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

  const summarize = (list) => summarizeByRecipe(list);

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
          };
        });
        setRecipesMeta(data);
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "adGroups", id, "copyCards"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCopyCards(list);
      },
    );
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
      setModalCopies(copyCards);
    }
  }, [showCopyModal]);

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
          const data = snap.docs[0].data();
          setBrandName(data.name || group.brandCode);
          setBrandGuidelines(data.guidelinesUrl || "");
          setBrandHasAgency(Boolean(data.agencyId));
        } else {
          setBrandName(group.brandCode);
          setBrandGuidelines("");
          setBrandHasAgency(false);
        }
      } catch (err) {
        console.error("Failed to fetch brand name", err);
        setBrandName(group.brandCode);
        setBrandGuidelines("");
        setBrandHasAgency(false);
      }
    };
    loadBrand();
  }, [group?.brandCode]);

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

    if (!["designed", "reviewed"].includes(currentStatus)) {
      return;
    }

    notifySlackStatusChange({
      brandCode: group.brandCode,
      adGroupId: id,
      adGroupName: group.name || "",
      status: currentStatus,
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


  const statusCounts = useMemo(() => {
    const counts = {
      pending: 0,
      ready: 0,
      approved: 0,
      rejected: 0,
      edit_requested: 0,
    };
    assets.forEach((a) => {
      if (counts[a.status] !== undefined) counts[a.status] += 1;
    });
    return counts;
  }, [assets]);

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

  const saveCopyCards = async (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    try {
      if (showCopyModal && copyCards.length > 0) {
        const confirmReplace = window.confirm(
          'Replace existing saved copy with new generation?',
        );
        if (!confirmReplace) return;
      }

      const existingIds = copyCards.map((c) => c.id);
      const newIds = list.map((c) => c.id).filter(Boolean);
      const deletions = existingIds.filter((id) => !newIds.includes(id));
      await Promise.all(
        deletions.map((cid) => deleteDoc(doc(db, 'adGroups', id, 'copyCards', cid))),
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
            return setDoc(doc(db, 'adGroups', id, 'copyCards', c.id), data, {
              merge: true,
            });
          }
          return addDoc(collection(db, 'adGroups', id, 'copyCards'), data);
        }),
      );
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
      batch.update(doc(db, "adGroups", id), { status: "designed" });
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
      setGroup((prev) => ({ ...prev, status: "designed" }));
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
    try {
      await updateDoc(doc(db, 'adGroups', id), { status: newStatus });
      setGroup((p) => ({ ...p, status: newStatus }));
    } catch (err) {
      console.error('Failed to update status', err);
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

  return (
    <div className="min-h-screen p-4 ">
      <div className="flex items-center mb-2 gap-2">
        <Link to={backPath} className="btn-arrow" aria-label="Back">
          &lt;
        </Link>
        <h1 className="text-2xl mb-0 flex-1">{group.name}</h1>
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
      <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
        Brand: {group.brandCode}
        <span className="hidden sm:inline">|</span>
        Status:
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
        <span className="hidden sm:inline">|</span>
        Due Date:
        {userRole === "admin" || userRole === "agency" ? (
          <input
            type="date"
            value={
              group.dueDate
                ? group.dueDate.toDate().toISOString().slice(0, 10)
                : ""
            }
            onChange={async (e) => {
              const date = e.target.value
                ? Timestamp.fromDate(new Date(e.target.value))
                : null;
              try {
                await updateDoc(doc(db, "adGroups", id), { dueDate: date });
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
                console.error("Failed to update due date", err);
              }
            }}
          className="border tag-pill px-2 py-1 text-sm"
          />
        ) : (
          <span>
            {group.dueDate
              ? group.dueDate.toDate().toLocaleDateString()
              : "N/A"}
          </span>
          )}
        {(isAdmin || isEditor) && (
          <>
            <span className="hidden sm:inline">|</span>
            <label className="flex items-center gap-1">
              <span className="hidden sm:inline">Review Type:</span>
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
            </label>
          </>
        )}
        {(brandHasAgency || userRole === 'admin') && (
          <>
            <span className="hidden sm:inline">|</span>
            Month:
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
          </>
        )}
      </p>
      {!isClient && (
        <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
          Designer:
          {canManageStaff ? (
          <select
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
        <span className="hidden sm:inline">|</span>
        Design Due Date:
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
        <span className="hidden sm:inline">|</span>
        Editor:
        {canManageStaff ? (
          <select
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
        <span className="hidden sm:inline">|</span>
        Editor Due Date:
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
        </p>
      )}
      {group.status === "archived" && (
        <p className="text-red-500 text-sm mb-2">
          This ad group is archived and read-only.
        </p>
      )}

      <div className="text-sm text-gray-500 mb-4 flex flex-wrap items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {isClient ? (
            <>
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
          ) : (
            <>
              <TabButton active={tab === 'stats'} onClick={() => setTab('stats')}>
                <FiBarChart2 size={18} />
                Stats
              </TabButton>
              <TabButton active={tab === 'brief'} onClick={() => setTab('brief')}>
                <FiFileText size={18} />
                Brief
              </TabButton>
              {(isAdmin || isManager) && (
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
              {group.status === 'blocked' && (
                <TabButton active={tab === 'blocker'} onClick={() => setTab('blocker')}>
                  <FiAlertTriangle size={18} />
                  Blocker
                </TabButton>
              )}
            </>
          )}
        </div>
        {(isAdmin || userRole === "agency" || isDesigner) ? (
          <div className="flex flex-wrap gap-2">
            {group.status === "archived" && isAdmin && (
              <IconButton
                onClick={restoreGroup}
                aria-label="Restore Group"
                className="bg-transparent"
              >
                <FiRotateCcw size={20} />
              </IconButton>
            )}
            {tab === "ads" && (group.status !== "archived" || isAdmin) && (
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
                  onClick={() => document.getElementById("upload-input").click()}
                  className="bg-transparent"
                >
                  <FiUpload size={20} />
                  Upload
                </IconButton>
              </>
            )}
            {(isAdmin || userRole === "agency") && (
              <IconButton
                onClick={resetGroup}
                aria-label="Reset"
                className="bg-transparent"
              >
                <FiRefreshCw size={20} />
              </IconButton>
            )}
            {(isAdmin || userRole === "agency" || isDesigner) && (
              <IconButton
                onClick={markDesigned}
                disabled={
                  designLoading ||
                  assets.length === 0 ||
                  group.status === "designed"
                }
                className="bg-transparent"
                aria-label="Designed"
              >
                <FiCheckCircle size={20} />
              </IconButton>
            )}
            {(isAdmin || userRole === "agency") && (
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
        ) : isClient ? (
          <div className="flex flex-wrap gap-2">
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
        ) : userRole === "editor" || userRole === "project-manager" ? (
          <div className="flex flex-wrap gap-2">
            <IconButton
              onClick={() => setShowGallery(true)}
              aria-label="See Gallery"
              className="bg-transparent"
            >
              <FiGrid size={20} />
            </IconButton>
          </div>
        ) : null}
      </div>

      {uploading && (
        <span className="ml-2 text-sm text-gray-600">Uploading...</span>
      )}

      {showStats && (
        <>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card">
              <p className="stat-card-title">Recipes</p>
              <p className="stat-card-value">{recipeCount}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card-title">Total Ads</p>
              <p className="stat-card-value">{assets.length}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mb-4">
            <div className="stat-card status-pending">
              <p className="stat-card-title">Pending</p>
              <p className="stat-card-value">{statusCounts.pending}</p>
            </div>
            <div className="stat-card status-ready">
              <p className="stat-card-title">Ready</p>
              <p className="stat-card-value">{statusCounts.ready}</p>
            </div>
            <div className="stat-card status-approved">
              <p className="stat-card-title">Approved</p>
              <p className="stat-card-value">{statusCounts.approved}</p>
            </div>
            <div className="stat-card status-rejected">
              <p className="stat-card-title">Rejected</p>
              <p className="stat-card-value">{statusCounts.rejected}</p>
            </div>
            <div className="stat-card status-edit_requested">
              <p className="stat-card-title">Edit</p>
              <p className="stat-card-value">{statusCounts.edit_requested}</p>
            </div>
          </div>
        </>
      )}

      {(tableVisible || (showStats && specialGroups.length > 0)) && (
        <Table
          columns={["18%", "32%", "15%", "25%", "10%"]}
          className="min-w-full"
        >
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Ads</th>
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
        {usesTabs && tab === "ads" && group.status !== "archived" && (
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
          {userRole === "admin" ? (
            editingNotes ? (
              <>
                <h4 className="font-medium mb-1">Brief Note:</h4>
                <div className="mb-4">
                  <textarea
                    className="w-full border rounded p-2"
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={saveNotes}
                      className="btn-primary px-2 py-0.5"
                    >
                      Save
                    </button>
                    <IconButton onClick={() => setEditingNotes(false)}>
                      Cancel
                    </IconButton>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h4 className="font-medium mb-1">Brief Note:</h4>
                  <div
                    style={{ outline: '1px solid var(--border-color-default, #d1d5db)' }}
                  className="mb-4 whitespace-pre-line p-2 bg-white shadow rounded relative dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                  <button
                    onClick={() => {
                      setNotesInput(group?.notes || "");
                      setEditingNotes(true);
                    }}
                    className="absolute top-1 right-1 btn-secondary px-1 py-0.5 text-xs"
                  >
                    Edit
                  </button>
                  {group?.notes}
                </div>
              </>
            )
          ) : (
            group?.notes && (
              <>
                <h4 className="font-medium mb-1">Brief Note:</h4>
                <div
                  style={{ outline: '1px solid var(--border-color-default, #d1d5db)' }}
                  className="mb-4 whitespace-pre-line p-2 bg-white shadow rounded dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                >
                  {group.notes}
                </div>
              </>
            )
          )}
          {userRole === "admin" && !group?.notes && !editingNotes && (
            <div className="mb-4">
              <IconButton
                onClick={() => {
                  setNotesInput("");
                  setEditingNotes(true);
                }}
              >
                Add Note
              </IconButton>
            </div>
          )}
          {briefAssets.length > 0 && (
            <>
              <h4 className="font-medium mb-1">Brief Assets:</h4>
                <div
                  style={{ outline: '1px solid var(--border-color-default, #d1d5db)' }}
                  className={`flex flex-wrap gap-2 mb-4 p-2 bg-white shadow rounded relative ${briefDrag ? "bg-accent-10" : ""} dark:bg-[var(--dark-sidebar-bg)]`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setBriefDrag(true);
                }}
                onDragLeave={() => setBriefDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setBriefDrag(false);
                  handleBriefUpload(e.dataTransfer.files);
                }}
              >
                <div className="w-full flex justify-between mb-2">
                  <IconButton onClick={downloadBriefAll}>
                    <FiDownload />
                    Download All
                  </IconButton>
                  {userRole === "admin" && (
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
                      <IconButton
                        onClick={() =>
                          document.getElementById("brief-upload").click()
                        }
                      >
                        <FiUpload />
                        Upload
                      </IconButton>
                    </>
                  )}
                </div>
                {briefAssets.map((a) => (
                  <div key={a.id} className="asset-card group cursor-pointer">
                    {(() => {
                      const ext = fileExt(a.filename || "");
                      if (a.firebaseUrl && ext === "svg") {
                        const img = (
                          <img
                            src={a.firebaseUrl}
                            alt={a.filename}
                            className="object-contain max-w-[10rem] max-h-32"
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
                        !["ai", "pdf"].includes(ext) &&
                        !["otf", "ttf", "woff", "woff2"].includes(ext)
                      ) {
                        const img = (
                          <OptimizedImage
                            pngUrl={a.firebaseUrl}
                            alt={a.filename}
                            className="object-contain max-w-[10rem] max-h-32"
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
                      <div className="absolute bottom-1 right-1 bg-accent text-white rounded-full p-1">
                        <FiFileText size={14} />
                      </div>
                    )}
                    {userRole === "admin" && (
                      <div className="absolute inset-0 bg-black bg-opacity-60 hidden group-hover:flex flex-col items-center justify-center gap-1 text-white text-xs">
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
                    {userRole === "designer" && a.note && (
                      <div className="absolute inset-0 bg-black bg-opacity-60 hidden group-hover:flex items-center justify-center text-white text-xs p-1 text-center whitespace-pre-wrap">
                        {a.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {userRole === "admin" && briefAssets.length === 0 && (
            <div className="mb-4">
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
              <IconButton onClick={() => document.getElementById("brief-upload").click()}>
                <FiUpload /> Add Assets
              </IconButton>
            </div>
          )}
          {savedRecipes.length > 0 && (
            <RecipePreview
              onSave={saveRecipes}
              initialResults={savedRecipes}
              showOnlyResults
              onSelectChange={toggleRecipeSelect}
              onRecipesClick={() => setShowRecipes(true)}
              externalOnly
            />
          )}
          {(["admin", "editor", "project-manager"].includes(userRole)) &&
            savedRecipes.length === 0 && (
            <div className="mt-4">
              <IconButton onClick={() => setShowRecipes(true)}>
                <FaMagic /> Briefs
              </IconButton>
            </div>
          )}
        </div>
      )}

      {(isAdmin || isManager || isClient) && tab === 'copy' && (
        <div className="my-4">
          {copyCards.length > 0 ? (
            <CopyRecipePreview
              onSave={(isAdmin || isManager) ? saveCopyCards : undefined}
              initialResults={copyCards}
              showOnlyResults
              onCopyClick={(isAdmin || isManager) ? () => setShowCopyModal(true) : undefined}
              brandCode={group?.brandCode}
              hideBrandSelect
            />
          ) : (
            (isAdmin || isManager) ? (
              <div className="mt-4">
                <IconButton onClick={() => setShowCopyModal(true)}>
                  <FiType /> Platform Copy
                </IconButton>
              </div>
            ) : (
              <p className="mt-4">No platform copy available.</p>
            )
          )}
        </div>
      )}

      {(isAdmin || isEditor || isDesigner || isManager || isClient) && tab === 'feedback' && (
        <div className="my-4">
          <FeedbackPanel entries={feedback} />
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
                onClick={() => saveCopyCards(modalCopies)}
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
              onSave={saveCopyCards}
              brandCode={group?.brandCode}
              hideBrandSelect
              onCopiesChange={setModalCopies}
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
        ?
            tab === "assets" && (
              <BrandAssetsLayout
                brandCode={group?.brandCode}
                guidelinesUrl={brandGuidelines}
              />
            )
        :
            showBrandAssets && (
              <BrandAssets
                brandCode={group?.brandCode}
                onClose={() => setShowBrandAssets(false)}
              />
            )}
    </div>
  );
};

export default AdGroupDetail;
