import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  onSnapshot,
  where,
} from "firebase/firestore";
import { db } from "./firebase/config";
import Review from "./Review";
import LoadingOverlay from "./LoadingOverlay";
import ThemeToggle from "./ThemeToggle";
import { FiGrid, FiType } from "react-icons/fi";

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
  const [groupPassword, setGroupPassword] = useState(null);
  const [visibility, setVisibility] = useState(null);
  const [requireAuth, setRequireAuth] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [groupAccessEvaluated, setGroupAccessEvaluated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordOk, setPasswordOk] = useState(false);
  const [copyCount, setCopyCount] = useState(0);
  const [adCount, setAdCount] = useState(0);
  const reviewRef = useRef(null);

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
      return;
    }
    const loadAgency = async () => {
      try {
        const groupSnap = await getDoc(doc(db, "adGroups", groupId));
        if (!groupSnap.exists()) {
          setAgencyId(null);
          return;
        }
        const code = groupSnap.data().brandCode;
        if (!code) {
          setAgencyId(null);
          return;
        }
        const q = query(collection(db, "brands"), where("code", "==", code));
        const bSnap = await getDocs(q);
        if (!bSnap.empty) {
          setAgencyId(bSnap.docs[0].data().agencyId || null);
        } else {
          setAgencyId(null);
        }
      } catch (err) {
        console.error("Failed to fetch agency", err);
        setAgencyId(null);
      }
    };
    loadAgency();
  }, [groupId]);

  useEffect(() => {
    if (
      !groupId ||
      !groupAccessEvaluated ||
      accessBlocked ||
      (requirePassword && !passwordOk)
    ) {
      setCopyCount(0);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'adGroups', groupId, 'copyCards'),
      (snap) => setCopyCount(snap.size),
    );
    return () => unsub();
  }, [
    groupId,
    groupAccessEvaluated,
    accessBlocked,
    requirePassword,
    passwordOk,
  ]);

  useEffect(() => {
    if (
      !groupId ||
      !groupAccessEvaluated ||
      accessBlocked ||
      (requirePassword && !passwordOk)
    ) {
      setAdCount(0);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'adGroups', groupId, 'assets'),
      (snap) => setAdCount(snap.size),
    );
    return () => unsub();
  }, [
    groupId,
    groupAccessEvaluated,
    accessBlocked,
    requirePassword,
    passwordOk,
  ]);

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

  const allowPublicListeners =
    groupAccessEvaluated && !accessBlocked && (!requirePassword || passwordOk);

  const userObj = user?.isAnonymous
    ? { uid: user.uid || "public", email: "public@campfire" }
    : user;

  return (
    <div className="min-h-screen relative">
      <div className="absolute top-2 right-2 flex gap-2 z-40">
        {user?.isAnonymous && <ThemeToggle />}
        {copyCount > 0 && (
          <button
            type="button"
            aria-label="See platform copy"
            onClick={() => reviewRef.current?.openCopy()}
            className="p-2 rounded"
          >
            <FiType />
          </button>
        )}
        {adCount > 0 && (
          <button
            type="button"
            aria-label="See gallery"
            onClick={() => reviewRef.current?.openGallery()}
            className="p-2 rounded"
          >
            <FiGrid />
          </button>
        )}
      </div>
      <Review
        ref={reviewRef}
        user={userObj}
        groupId={groupId}
        reviewerName={reviewerName}
        userRole={user?.isAnonymous ? null : userRole}
        brandCodes={user?.isAnonymous ? [] : brandCodes}
        agencyId={agencyId}
        allowPublicListeners={allowPublicListeners}
        isPublicReviewer={Boolean(user?.isAnonymous)}
      />
    </div>
  );
};

export default ReviewPage;
