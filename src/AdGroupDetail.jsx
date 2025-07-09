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
  FiUpload,
  FiBookOpen,
  FiFileText,
  FiFolder,
  FiArchive,
  FiDownload,
  FiRotateCcw,
  FiBarChart2,
  FiFile,
  FiPenTool,
  FiType,
} from "react-icons/fi";
import { FaMagic } from "react-icons/fa";
import RecipePreview from "./RecipePreview.jsx";
import CopyRecipePreview from "./CopyRecipePreview.jsx";
import BrandAssets from "./BrandAssets.jsx";
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
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase/config";
import useUserRole from "./useUserRole";
import { uploadFile } from "./uploadFile";
import ShareLinkModal from "./components/ShareLinkModal.jsx";
import parseAdFilename from "./utils/parseAdFilename";
import StatusBadge from "./components/StatusBadge.jsx";
import LoadingOverlay from "./LoadingOverlay";
import OptimizedImage from "./components/OptimizedImage.jsx";
import pickHeroAsset from "./utils/pickHeroAsset";
import computeGroupStatus from "./utils/computeGroupStatus";
import diffWords from "./utils/diffWords";
import Modal from "./components/Modal.jsx";
import IconButton from "./components/IconButton.jsx";
import TabButton from "./components/TabButton.jsx";

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

const normalizeId = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^0+/, "")
    .toLowerCase();

const AdGroupDetail = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [brandName, setBrandName] = useState("");
  const [assets, setAssets] = useState([]);
  const [briefAssets, setBriefAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [versionUploading, setVersionUploading] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [showTable, setShowTable] = useState(false);
  const [historyRecipe, setHistoryRecipe] = useState(null);
  const [historyAsset, setHistoryAsset] = useState(null);
  const [viewRecipe, setViewRecipe] = useState(null);
  const [recipesMeta, setRecipesMeta] = useState({});
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
  const [tab, setTab] = useState("stats");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [briefDrag, setBriefDrag] = useState(false);
  const [responses, setResponses] = useState([]);
  const countsRef = useRef(null);
  const { role: userRole } = useUserRole(auth.currentUser?.uid);
  const location = useLocation();
  const isDesigner = userRole === "designer";
  const isAdmin = userRole === "admin";
  const usesTabs = isAdmin || isDesigner;
  const tableVisible = usesTabs ? tab === "ads" : showTable;
  const recipesTableVisible = usesTabs ? tab === "brief" : showRecipesTable;
  const showStats = usesTabs ? tab === "stats" : !showTable;

  const renderCopyEditDiff = (recipeCode, edit) => {
    const orig = recipesMeta[recipeCode]?.copy || "";
    if (!edit || edit === orig) return null;
    const diff = diffWords(orig, edit);
    return diff.map((p, i) => {
      const space = i < diff.length - 1 ? " " : "";
      if (p.type === "same") return p.text + space;
      if (p.type === "removed")
        return (
          <span key={i} className="text-red-600 line-through">
            {p.text}
            {space}
          </span>
        );
      return (
        <span key={i} className="text-green-600 italic">
          {p.text}
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
      case "agency":
        base = "/agency/ad-groups";
        break;
      case "designer":
        base = "/dashboard/designer";
        break;
      case "client":
        base = "/dashboard/client";
        break;
      default:
        base = "/";
    }
    if (userRole === "agency" && location.search) {
      return base + location.search;
    }
    return base;
  }, [userRole, location.search]);

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

  const summarize = (list) => {
    let reviewed = 0;
    let approved = 0;
    let edit = 0;
    let rejected = 0;
    let thumbnail = "";
    list.forEach((a) => {
      if (!thumbnail && (a.thumbnailUrl || a.firebaseUrl)) {
        thumbnail = a.thumbnailUrl || a.firebaseUrl;
      }
      if (a.status !== "ready") reviewed += 1;
      if (a.status === "approved") approved += 1;
      if (a.status === "edit_requested") edit += 1;
      if (a.status === "rejected") rejected += 1;
    });
    return { reviewed, approved, edit, rejected, thumbnail };
  };

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
    const unsubResp = onSnapshot(
      query(
        collection(db, "adGroups", id, "responses"),
        orderBy("timestamp", "desc"),
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setResponses(list);
      },
    );
    return () => {
      unsub();
      unsubBrief();
      unsubResp();
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
          setBrandName(snap.docs[0].data().name || group.brandCode);
        } else {
          setBrandName(group.brandCode);
        }
      } catch (err) {
        console.error("Failed to fetch brand name", err);
        setBrandName(group.brandCode);
      }
    };
    loadBrand();
  }, [group?.brandCode]);

  useEffect(() => {
    if (group) {
      countsRef.current = {
        reviewed: group.reviewedCount || 0,
        approved: group.approvedCount || 0,
        edit: group.editCount || 0,
        rejected: group.rejectedCount || 0,
      };
    }
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const summary = summarize(assets);
    const prev = countsRef.current || {};
    const changed =
      summary.reviewed !== prev.reviewed ||
      summary.approved !== prev.approved ||
      summary.edit !== prev.edit ||
      summary.rejected !== prev.rejected ||
      (!group.thumbnailUrl && summary.thumbnail);
    if (changed) {
      const update = {
        reviewedCount: summary.reviewed,
        approvedCount: summary.approved,
        editCount: summary.edit,
        rejectedCount: summary.rejected,
        lastUpdated: serverTimestamp(),
        ...(group.thumbnailUrl
          ? {}
          : summary.thumbnail
            ? { thumbnailUrl: summary.thumbnail }
            : {}),
      };
      const newStatus = computeGroupStatus(assets, group.status);
      if (newStatus !== group.status) {
        update.status = newStatus;
      }
      updateDoc(doc(db, "adGroups", id), update).catch((err) =>
        console.error("Failed to update summary", err),
      );
      countsRef.current = summary;
      setGroup((p) => ({ ...p, ...update }));
    }
  }, [assets, group, id]);

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
    const unique = Array.from(new Set(list.map((a) => a.status)));
    return unique.length === 1 ? unique[0] : "mixed";
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

  const toggleRecipe = (code) => {
    setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));
  };

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
          } catch {
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
          } catch {
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

  const openView = (recipeCode) => {
    const list = assets.filter((a) => {
      const info = parseAdFilename(a.filename || "");
      return (info.recipeCode || "unknown") === recipeCode;
    });
    setViewRecipe({ recipeCode, assets: list });
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

  const closeModals = () => {
    setHistoryRecipe(null);
    setHistoryAsset(null);
    setViewRecipe(null);
    setMetadataRecipe(null);
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
    const confirmReset = window.confirm("Reset this group to pending?");
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
      batch.update(doc(db, "adGroups", id), { status: "pending" });
      await batch.commit();
      setAssets((prev) => prev.map((a) => ({ ...a, status: "pending" })));
      setGroup((p) => ({ ...p, status: "pending" }));
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
    } catch (err) {
      console.error("Failed to archive group", err);
    }
  };

  const restoreGroup = async () => {
    if (!group) return;
    try {
      await updateDoc(doc(db, "adGroups", id), {
        status: "pending",
        archivedAt: null,
        archivedBy: null,
      });
      setGroup((p) => ({ ...p, status: "pending" }));
    } catch (err) {
      console.error("Failed to restore group", err);
    }
  };

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    if (group?.status !== "in review" && group?.status !== "pending") {
      try {
        await updateDoc(doc(db, "adGroups", id), { status: "pending" });
        setGroup((p) => ({ ...p, status: "pending" }));
      } catch (err) {
        console.error("Failed to update group status", err);
      }
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
    setUploading(true);
    for (const file of files) {
      try {
        const url = await uploadFile(
          file,
          id,
          brandName || group?.brandCode,
          group?.name || id,
        );
        const info = parseAdFilename(file.name);
        let parentId = null;
        if (info.version && info.version > 1) {
          const base = file.name.replace(/_V\d+\.[^/.]+$/, "");
          const prev = assets.find(
            (a) => a.filename.replace(/_V\d+\.[^/.]+$/, "") === base,
          );
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
          status: "pending",
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

  const handleBriefUpload = async (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setUploading(true);
    for (const file of Array.from(selectedFiles)) {
      try {
        const url = await uploadFile(
          file,
          id,
          brandName || group?.brandCode,
          group?.name || id,
        );
        await addDoc(collection(db, "adGroups", id, "groupAssets"), {
          filename: file.name,
          firebaseUrl: url,
          uploadedAt: serverTimestamp(),
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
              `Campfire/Brands/${brandName || group?.brandCode}/Adgroups/${
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
        brandName || group?.brandCode,
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
        brandName || group?.brandCode,
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
      const newIds = list.map((r) => String(r.recipeNo));
      existingIds.forEach((rid) => {
        if (!newIds.includes(rid)) {
          batch.delete(doc(db, "adGroups", id, "recipes", rid));
        }
      });
      list.forEach((r) => {
        const docRef = doc(db, "adGroups", id, "recipes", String(r.recipeNo));
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
      if (group?.status === "pending") {
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

  const updateAssetStatus = async (assetId, status) => {
    try {
      await updateDoc(doc(db, "adGroups", id, "assets", assetId), {
        status,
      });
      const asset = assets.find((a) => a.id === assetId);
      if (status === "ready" && asset?.parentAdId) {
        await updateDoc(doc(db, "adGroups", id, "assets", asset.parentAdId), {
          status: "archived",
        });
      }

      if (asset) {
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
      }
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

  const markReady = async () => {
    setReadyLoading(true);
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
      batch.update(doc(db, "adGroups", id), { status: "ready" });
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
    } catch (err) {
      console.error("Failed to mark ready", err);
    } finally {
      setReadyLoading(false);
    }
  };

  const [shareModal, setShareModal] = useState(false);

  const handleShare = () => {
    setShareModal(true);
  };

  const sanitize = (str) =>
    (str || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "unknown";

  const computeExportGroups = () => {
    const approved = assets.filter((a) => a.status === "approved");
    const map = {};
    approved.forEach((a) => {
      const info = parseAdFilename(a.filename || "");
      const recipe = a.recipeCode || info.recipeCode;
      const meta = recipesMeta[recipe] || {};
      const keyParts = groupBy.map((k) => sanitize(meta[k]));
      const key = keyParts.join("|");
      if (!map[key]) map[key] = [];
      map[key].push({ asset: a, meta });
    });
    return Object.values(map);
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
      for (const list of groups) {
        if (list.length === 0) continue;
        const firstMeta = list[0].meta;
        const folder =
          groupBy.map((k) => sanitize(firstMeta[k])).join("-") || "group";
        const selected = list.slice(0, maxAds);
        for (const { asset } of selected) {
          const resp = await fetch(asset.firebaseUrl);
          const buf = await resp.arrayBuffer();
          files.push({ path: `${folder}/${asset.filename}`, data: buf });
        }
      }
      if (files.length === 0) {
        window.alert("No approved ads found");
        return;
      }
      const blob = await makeZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${group?.name || "export"}.zip`;
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
              `Campfire/Brands/${brandName || group?.brandCode}/Adgroups/${
                group?.name || id
              }/${asset.filename}`,
          );
          await deleteObject(fileRef);
        } catch (err) {
          console.error("Failed to delete storage file", err);
        }
      }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
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
                  `Campfire/Brands/${brandName || group?.brandCode}/Adgroups/${
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

  const renderRecipeRow = (g) => (
    <tbody key={g.recipeCode} className="table-row-group">
      <tr
        onClick={() => toggleRecipe(g.recipeCode)}
        className="cursor-pointer recipe-row"
      >
        <td colSpan="2" className="font-semibold relative">
          Recipe {g.recipeCode}
          <div
            className={`asset-panel absolute left-0 w-full ${
              expanded[g.recipeCode] ? "open" : ""
            }`}
          >
            <div className="overflow-x-auto table-container">
              <table className="ad-table min-w-max w-full">
                <tbody>
                  {g.assets.map((a) => (
                    <tr key={a.id} className="asset-row">
                      <td className="break-all">{a.filename}</td>
                      <td className="text-center">{a.version || 1}</td>
                      <td className="text-center">
                        <div className="flex flex-col items-center">
                          <StatusBadge status={a.status} />
                          {a.status === "edit_requested" && a.comment && (
                            <span className="italic text-xs">{a.comment}</span>
                          )}
                          {a.status === "edit_requested" &&
                            renderCopyEditDiff(g.recipeCode, a.copyEdit) && (
                              <span className="italic text-xs">
                                copy edit:{" "}
                                {renderCopyEditDiff(g.recipeCode, a.copyEdit)}
                              </span>
                            )}
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              openAssetHistory(a);
                            }}
                            aria-label="History"
                            className="px-1.5 text-xs"
                          >
                            <FiClock />
                          </IconButton>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAsset(a);
                            }}
                            className="btn-delete"
                            aria-label="Delete"
                          >
                            <FiTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </td>
        <td className="flex flex-col">
          {userRole === "designer" || userRole === "client" ? (
            getRecipeStatus(g.assets) === "pending" ? (
              <select
                className={`status-select status-pending`}
                value="pending"
                onChange={(e) => {
                  e.stopPropagation();
                  updateRecipeStatus(g.recipeCode, e.target.value);
                }}
              >
                <option value="pending">pending</option>
                <option value="ready">ready</option>
              </select>
            ) : (
              <StatusBadge status={getRecipeStatus(g.assets)} />
            )
          ) : (
            <select
              className={`status-select status-${getRecipeStatus(g.assets)}`}
              value={getRecipeStatus(g.assets)}
              onChange={(e) => {
                e.stopPropagation();
                updateRecipeStatus(g.recipeCode, e.target.value);
              }}
            >
              <option value="pending">pending</option>
              <option value="ready">ready</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="edit_requested">edit_requested</option>
              <option value="archived">archived</option>
              <option value="mixed" disabled>
                mixed
              </option>
            </select>
          )}
          {g.assets.find((a) => a.status === "edit_requested" && a.comment) && (
            <span className="italic text-xs mt-1 max-w-[20rem] block">
              {
                g.assets.find((a) => a.status === "edit_requested" && a.comment)
                  ?.comment
              }
            </span>
          )}
          {(() => {
            const ce = g.assets.find(
              (a) => a.status === "edit_requested" && a.copyEdit,
            );
            return (
              ce &&
              renderCopyEditDiff(g.recipeCode, ce.copyEdit) && (
                <span className="italic text-xs mt-1 max-w-[20rem] block">
                  copy edit: {renderCopyEditDiff(g.recipeCode, ce.copyEdit)}
                </span>
              )
            );
          })()}
        </td>
        <td className="text-center">
          <div className="flex items-center justify-center">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                openView(g.recipeCode);
              }}
              aria-label="View"
              className="px-1.5 text-xs mr-2"
            >
              <FiEye />
              <span className="ml-1">View</span>
            </IconButton>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                openHistory(g.recipeCode);
              }}
              aria-label="History"
              className="px-1.5 text-xs mr-2"
            >
              <FiClock />
              <span className="ml-1">History</span>
            </IconButton>
            {userRole === "admin" && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  const rawId = g.recipeCode;
                  const normId = normalizeId(rawId);
                  setMetadataRecipe(
                    recipesMeta[rawId] ||
                      recipesMeta[String(rawId).toLowerCase()] ||
                      recipesMeta[normId] || {
                        id: rawId,
                      },
                  );
                }}
                aria-label="Metadata"
                className="px-1.5 text-xs mr-2"
              >
                <FiBookOpen />
                <span className="ml-1">Metadata</span>
              </IconButton>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteRecipe(g.recipeCode);
              }}
              className="btn-delete text-xs"
              aria-label="Delete"
            >
              <FiTrash />
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  );

  if (!group) {
    return <LoadingOverlay />;
  }

  return (
    <div className="min-h-screen p-4 ">
      <div className="flex items-center mb-2">
        <Link to={backPath} className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
        <h1 className="text-2xl">{group.name}</h1>
      </div>
      <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
        Brand: {group.brandCode}
        <span className="hidden sm:inline">|</span>
        Status: <StatusBadge status={group.status} />
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
              } catch (err) {
                console.error("Failed to update due date", err);
              }
            }}
            className="border p-1 rounded"
          />
        ) : (
          <span>
            {group.dueDate
              ? group.dueDate.toDate().toLocaleDateString()
              : "N/A"}
          </span>
        )}
      </p>
      {group.status === "archived" && (
        <p className="text-red-500 text-sm mb-2">
          This ad group is archived and read-only.
        </p>
      )}

      <div className="text-sm text-gray-500 mb-4 flex flex-wrap items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === 'stats'} onClick={() => setTab('stats')}>
            <FiBarChart2 size={18} />
            Stats
          </TabButton>
          <TabButton active={tab === 'brief'} onClick={() => setTab('brief')}>
            <FiFileText size={18} />
            Brief
          </TabButton>
        {isAdmin && (
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
        </div>
        {(isAdmin || userRole === "agency" || isDesigner) && (
          <>
            {group.status === "archived" ? (
              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <IconButton
                    onClick={restoreGroup}
                    aria-label="Restore Group"
                    className="bg-transparent"
                  >
                    <FiRotateCcw size={20} />
                  </IconButton>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tab === "ads" && group.status !== "archived" && (
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
                  <>
                    <IconButton
                      onClick={resetGroup}
                      aria-label="Reset"
                      className="bg-transparent"
                    >
                      <FiRefreshCw size={20} />
                    </IconButton>
                    <IconButton
                      onClick={markReady}
                      disabled={
                        readyLoading ||
                        assets.length === 0 ||
                        group.status === "ready" ||
                        group.status === "in review"
                      }
                      className="bg-transparent"
                      aria-label="Ready"
                    >
                      <FiCheckCircle size={20} />
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
                      onClick={handleShare}
                      aria-label="Share"
                      className="bg-transparent"
                    >
                      <FiShare2 size={20} />
                    </IconButton>
                    {isAdmin && (
                      <>
                        <IconButton
                          onClick={() => setExportModal(true)}
                          aria-label="Export Approved"
                          className="bg-transparent"
                        >
                          <FiDownload size={20} />
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
            )}
          </>
        )}
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
        <div className="overflow-x-auto table-container">
          <table className="ad-table min-w-max">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            {(tableVisible
              ? [...specialGroups, ...normalGroups]
              : showStats
                ? specialGroups
                : []
            ).map((g) => renderRecipeRow(g))}
          </table>
        </div>
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

      {tab === "ads" && responses.length > 0 && (
        <div className="my-4">
          <h4 className="font-medium mb-1">Responses</h4>
          <ul className="space-y-2">
            {responses.map((r) => (
              <li
                key={r.id}
                className="border p-2 rounded bg-white shadow dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              >
                <div className="text-sm font-medium capitalize">
                  {r.response}
                </div>
                {r.comment && <div className="text-sm italic">{r.comment}</div>}
                {r.copyEdit && (
                  <div className="text-sm italic">copy edit: {r.copyEdit}</div>
                )}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {r.timestamp
                    ? r.timestamp.toDate
                      ? r.timestamp.toDate().toLocaleString()
                      : new Date(r.timestamp).toLocaleString()
                    : ""}{" "}
                  - {r.reviewerName || r.userEmail || r.userId || ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            />
          )}
          {userRole === "admin" && savedRecipes.length === 0 && (
            <div className="mt-4">
              <IconButton onClick={() => setShowRecipes(true)}>
                <FaMagic /> Recipes
              </IconButton>
            </div>
          )}
        </div>
      )}

      {isAdmin && tab === 'copy' && (
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

      {viewRecipe && (
        <Modal sizeClass="max-w-md">
          <h3 className="mb-2 font-semibold">Recipe {viewRecipe.recipeCode}</h3>
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-auto">
            {viewRecipe.assets.map((a) => (
              <OptimizedImage
                key={a.id}
                pngUrl={a.thumbnailUrl || a.firebaseUrl}
                alt={a.filename}
                className="w-full object-contain max-h-40"
              />
            ))}
          </div>
          <button onClick={closeModals} className="mt-2 btn-primary px-3 py-1">
            Close
          </button>
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
                    );
                    return diff ? (
                      <div className="text-sm italic">Edit Request: {diff}</div>
                    ) : null;
                  })()}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => deleteHistoryEntry(a.assetId, a.id)}
                    className="btn-delete"
                    aria-label="Delete"
                  >
                    <FiTrash />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={closeModals} className="btn-primary px-3 py-1">
            Close
          </button>
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
                    );
                    return diff ? (
                      <div className="text-sm italic">Edit Request: {diff}</div>
                    ) : null;
                  })()}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => deleteHistoryEntry(historyAsset.assetId, a.id)}
                    className="btn-delete"
                    aria-label="Delete"
                  >
                    <FiTrash />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={closeModals} className="btn-primary px-3 py-1">
            Close
          </button>
        </Modal>
      )}

      {metadataRecipe && (
        <Modal sizeClass="max-w-sm">
          <h3 className="mb-2 font-semibold">Metadata for Recipe {metadataRecipe.id}</h3>
          <div className="space-y-2">
            {metadataRecipe.components && (
              <div className="text-sm">
                {Object.entries(metadataRecipe.components).map(([k, v]) => (
                  <div key={k}>
                    <span className="font-semibold mr-1">{k}:</span>
                    {typeof v === "object" && v !== null
                      ? JSON.stringify(v)
                      : String(v)}
                  </div>
                ))}
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
            <BrandAssets brandCode={group?.brandCode} inline />
          )
        : showBrandAssets && (
            <BrandAssets
              brandCode={group?.brandCode}
              onClose={() => setShowBrandAssets(false)}
            />
          )}
    </div>
  );
};

export default AdGroupDetail;
