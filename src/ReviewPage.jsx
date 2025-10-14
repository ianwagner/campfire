import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase/config";
import Review from "./Review";
import LoadingOverlay from "./LoadingOverlay";
import ensurePublicDashboardSlug from "./utils/ensurePublicDashboardSlug.js";
import useMonthlyBrief from "./useMonthlyBrief.js";
import {
  getMonthlyBriefBadge,
  MONTHLY_BRIEF_BADGE_TONE_CLASSES,
  MONTHLY_BRIEF_MENU_LABEL,
} from "./monthlyBriefCopy.js";
import { FiEdit3 } from "react-icons/fi";

const ReviewPage = ({
  userRole = null,
  brandCodes = [],
  user = null,
  authLoading = false,
  authError = "",
}) => {
  const { groupId } = useParams();
  const location = useLocation();
  const [reviewerName, setReviewerName] = useState("");
  const [tempName, setTempName] = useState("");
  const [agencyId, setAgencyId] = useState(null);
  const [brandDashboardSlug, setBrandDashboardSlug] = useState("");
  const [brandId, setBrandId] = useState(null);
  const [groupPassword, setGroupPassword] = useState(null);
  const [visibility, setVisibility] = useState(null);
  const [requireAuth, setRequireAuth] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [groupAccessEvaluated, setGroupAccessEvaluated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordOk, setPasswordOk] = useState(false);
  const reviewRef = useRef(null);
  const isAnonymousReviewer = Boolean(user?.isAnonymous);
  const allowPublicListeners =
    groupAccessEvaluated && !accessBlocked && (!requirePassword || passwordOk);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    if (view === 'gallery') {
      reviewRef.current?.openGallery();
    } else if (view === 'copy') {
      reviewRef.current?.openCopy();
    }
  }, [location.search]);

  useEffect(() => {
    if (!groupId) {
      setAgencyId(null);
      setBrandId(null);
      return undefined;
    }
    let cancelled = false;
    const loadAgency = async () => {
      try {
        const groupSnap = await getDoc(doc(db, "adGroups", groupId));
        if (!groupSnap.exists()) {
          if (!cancelled) {
            setAgencyId(null);
            setBrandDashboardSlug("");
            setBrandId(null);
          }
          return;
        }
        const code = groupSnap.data().brandCode;
        if (!code) {
          if (!cancelled) {
            setAgencyId(null);
            setBrandDashboardSlug("");
          }
          return;
        }
        const q = query(collection(db, "brands"), where("code", "==", code));
        const bSnap = await getDocs(q);
        if (!bSnap.empty) {
          const brandDoc = bSnap.docs[0];
          const brandData = brandDoc.data();
          let slug = (brandData.publicDashboardSlug || "").trim();
          if (!slug) {
            try {
              slug = await ensurePublicDashboardSlug(db, brandDoc.id);
            } catch (slugErr) {
              console.error("Failed to ensure public dashboard slug", slugErr);
            }
          }
          if (!cancelled) {
            setAgencyId(brandData.agencyId || null);
            setBrandDashboardSlug((slug || brandData.code || "").trim());
            setBrandId(brandDoc.id);
          }
        } else if (!cancelled) {
          setAgencyId(null);
          setBrandDashboardSlug("");
          setBrandId(null);
        }
      } catch (err) {
        console.error("Failed to fetch agency", err);
        if (!cancelled) {
          setAgencyId(null);
          setBrandDashboardSlug("");
          setBrandId(null);
        }
      }
    };
    loadAgency();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    setGroupAccessEvaluated(false);
    if (!groupId) {
      setGroupPassword(null);
      setVisibility(null);
      setAccessBlocked(false);
      setGroupAccessEvaluated(true);
      return;
    }
    const loadGroup = async () => {
      try {
        const snap = await getDoc(doc(db, "adGroups", groupId));
        if (!snap.exists()) {
          setAccessBlocked(true);
          setGroupPassword(null);
          setVisibility(null);
          setRequireAuth(false);
          setRequirePassword(false);
          setGroupAccessEvaluated(true);
          return;
        }
        const data = snap.data();
        setGroupPassword(data.password || null);
        setVisibility(data.visibility || "private");
        setRequireAuth(!!data.requireAuth);
        setRequirePassword(!!data.requirePassword);
        const blocked =
          data.visibility !== "public" ||
          (data.requireAuth && (!user || user.isAnonymous));
        setAccessBlocked(blocked);
        setGroupAccessEvaluated(true);
      } catch (err) {
        console.error("Failed to fetch group info", err);
        setAccessBlocked(true);
        setGroupPassword(null);
        setVisibility(null);
        setRequireAuth(false);
        setRequirePassword(false);
        setGroupAccessEvaluated(true);
      }
    };
    loadGroup();
  }, [groupId, user]);

  useEffect(() => {
    if (groupPassword === null || accessBlocked) return;
    const stored =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(`reviewPassword-${groupId}`)
        : null;
    if (!requirePassword || stored === groupPassword) {
      setPasswordOk(true);
    }
  }, [groupPassword, requirePassword, groupId, accessBlocked]);

  useEffect(() => {
    if (!user) return;
    if (user.isAnonymous) {
      const stored =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("reviewerName")
          : "";
      if (stored) {
        setReviewerName(stored);
        setTempName(stored);
      }
    } else {
      setReviewerName(user.displayName || "");
    }
  }, [user]);

  useEffect(() => {
    if (user?.isAnonymous && reviewerName) {
      localStorage.setItem("reviewerName", reviewerName);
    }
  }, [reviewerName, user]);

  if (authError) {
    return <div className="p-4 text-center text-red-500">{authError}</div>;
  }

  if (authLoading) {
    return <LoadingOverlay />;
  }

  if (!groupAccessEvaluated) {
    return <LoadingOverlay />;
  }

  if (accessBlocked) {
    return (
      <div className="p-4 text-center">This link is currently private.</div>
    );
  }

  if (requirePassword && !passwordOk) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-2">
        <label className="text-lg" htmlFor="reviewPassword">
          Group Password
        </label>
        <input
          id="reviewPassword"
          type="password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          className="w-full max-w-xs p-2 border rounded"
        />
        <button
          onClick={() => {
            if (passwordInput === groupPassword) {
              localStorage.setItem(`reviewPassword-${groupId}`, groupPassword);
              setPasswordOk(true);
            } else {
              window.alert("Incorrect password");
            }
          }}
          className="btn-primary"
          disabled={!passwordInput.trim()}
        >
          Enter
        </button>
      </div>
    );
  }

  if (user?.isAnonymous && !reviewerName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-2">
        <label className="text-lg" htmlFor="reviewerName">
          Your Name
        </label>
        <input
          id="reviewerName"
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          className="w-full max-w-xs p-2 border rounded"
        />
        <button
          onClick={() => setReviewerName(tempName.trim())}
          className="btn-primary"
          disabled={!tempName.trim()}
        >
          Continue
        </button>
      </div>
    );
  }

  const userObj = user?.isAnonymous
    ? { uid: user.uid || "public", email: "public@campfire" }
    : user;
  const shouldShowBriefChip = userRole === "client" && brandId && agencyId;
  const { period: reviewBriefPeriod, state: reviewBriefState } = useMonthlyBrief(
    shouldShowBriefChip ? agencyId : null,
    shouldShowBriefChip ? brandId : null,
    undefined
  );
  const reviewBriefBadge = shouldShowBriefChip ? getMonthlyBriefBadge(reviewBriefState) : null;
  const reviewBriefTone = reviewBriefBadge
    ? MONTHLY_BRIEF_BADGE_TONE_CLASSES[reviewBriefBadge.tone] || MONTHLY_BRIEF_BADGE_TONE_CLASSES.muted
    : null;

  return (
    <div className="min-h-screen relative">
      {shouldShowBriefChip && reviewBriefBadge && (
        <Link
          to={`/brief/${reviewBriefPeriod}`}
          className="absolute top-6 right-6 z-30"
          aria-label={`${MONTHLY_BRIEF_MENU_LABEL} — ${reviewBriefBadge.label}`}
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-slate-900/80 shadow-md backdrop-blur">
            <FiEdit3 className="text-sm text-gray-700 dark:text-gray-200" aria-hidden="true" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {MONTHLY_BRIEF_MENU_LABEL}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                reviewBriefTone || 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {reviewBriefBadge.label}
            </span>
          </span>
        </Link>
      )}
      <Review
        ref={reviewRef}
        user={userObj}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={user?.isAnonymous ? null : userRole}
        brandCodes={user?.isAnonymous ? [] : brandCodes}
        agencyId={agencyId}
        brandDashboardSlug={brandDashboardSlug}
        allowPublicListeners={allowPublicListeners}
        isPublicReviewer={Boolean(user?.isAnonymous)}
      />
    </div>
  );
};

export default ReviewPage;
