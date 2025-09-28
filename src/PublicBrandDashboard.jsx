import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  getCountFromServer,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase/config";
import OptimizedImage from "./components/OptimizedImage.jsx";
import ReviewGroupCard from "./components/ReviewGroupCard.jsx";

const statusBadgeLabels = {
  designed: "Ready for review",
  reviewed: "Reviewed",
};

const PublicBrandDashboard = () => {
  const { brandCode: brandParam = "" } = useParams();
  const codeCandidates = useMemo(() => {
    const trimmed = (brandParam || "").trim();
    if (!trimmed) return [];
    const variants = new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]);
    if (/\s/.test(trimmed)) {
      variants.add(trimmed.replace(/\s+/g, "").toUpperCase());
    }
    return Array.from(variants);
  }, [brandParam]);

  const [brand, setBrand] = useState(null);
  const [brandError, setBrandError] = useState("");
  const [brandLoading, setBrandLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadBrand = async () => {
      setBrand(null);
      setBrandError("");
      setNotFound(false);
      setBrandLoading(true);
      if (codeCandidates.length === 0) {
        setBrandLoading(false);
        setNotFound(true);
        return;
      }
      try {
        for (const code of codeCandidates) {
          const snap = await getDocs(
            query(collection(db, "brands"), where("code", "==", code), limit(1))
          );
          if (!snap.empty) {
            if (cancelled) return;
            const docSnap = snap.docs[0];
            setBrand({ id: docSnap.id, ...docSnap.data() });
            setBrandLoading(false);
            return;
          }
        }
        if (!cancelled) {
          setBrandLoading(false);
          setNotFound(true);
        }
      } catch (err) {
        console.error("Failed to load brand", err);
        if (!cancelled) {
          setBrandError("We couldn't load this brand right now. Please try again later.");
          setBrandLoading(false);
        }
      }
    };
    loadBrand();
    return () => {
      cancelled = true;
    };
  }, [codeCandidates]);

  useEffect(() => {
    if (!brand?.code) {
      setGroups([]);
      setGroupsError("");
      setGroupsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setGroupsLoading(true);
    setGroupsError("");
    const brandLogo = Array.isArray(brand.logos) && brand.logos.length > 0 ? brand.logos[0] : brand.logoUrl || "";
    const q = query(
      collection(db, "adGroups"),
      where("brandCode", "==", brand.code),
      where("visibility", "==", "public"),
      where("requireAuth", "==", false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const hydrate = async () => {
          try {
            const list = await Promise.all(
              snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                const counts = {
                  approved: data.approvedCount || 0,
                  reviewed: data.reviewedCount || 0,
                  edit: data.editCount || 0,
                  rejected: data.rejectedCount || 0,
                  archived: data.archivedCount || 0,
                };

                let previewSnap;
                try {
                  previewSnap = await getDocs(
                    query(
                      collection(db, "adGroups", docSnap.id, "assets"),
                      where("aspectRatio", "==", "1x1"),
                      limit(3)
                    )
                  );
                } catch (err) {
                  console.error("Failed to load preview assets", err);
                  previewSnap = { docs: [] };
                }

                const previewAds = previewSnap.docs.map((adDoc) => ({
                  id: adDoc.id,
                  ...adDoc.data(),
                }));

                let totalAds = 0;
                try {
                  const countSnap = await getCountFromServer(
                    collection(db, "adGroups", docSnap.id, "assets")
                  );
                  totalAds = countSnap.data().count || 0;
                } catch (err) {
                  console.error("Failed to count assets", err);
                  totalAds =
                    counts.approved +
                    counts.reviewed +
                    counts.edit +
                    counts.rejected +
                    counts.archived;
                }

                const updatedAt =
                  (data.lastUpdated?.toDate && data.lastUpdated.toDate()) ||
                  (data.createdAt?.toDate && data.createdAt.toDate()) ||
                  null;

                const showLogo =
                  previewAds.length === 0 ||
                  previewAds.every((ad) => ad.status === "pending");
                const statusLabel = statusBadgeLabels[data.status] || "";
                const badges = [];
                if (data.requirePassword) {
                  badges.push({ label: "Password required", variant: "warning" });
                }

                return {
                  id: docSnap.id,
                  name: data.name || "Untitled Review",
                  month: data.month || "",
                  previewAds,
                  totalAds,
                  updatedAt,
                  brandLogo,
                  showLogo,
                  statusLabel,
                  badges,
                };
              })
            );
            if (!cancelled) {
              list.sort((a, b) => {
                const aTime = a.updatedAt ? a.updatedAt.getTime() : 0;
                const bTime = b.updatedAt ? b.updatedAt.getTime() : 0;
                return bTime - aTime;
              });
              setGroups(list);
              setGroupsLoading(false);
            }
          } catch (err) {
            console.error("Failed to process public groups", err);
            if (!cancelled) {
              setGroups([]);
              setGroupsError("We couldn't load public reviews right now. Please refresh to try again.");
              setGroupsLoading(false);
            }
          }
        };
        hydrate();
      },
      (err) => {
        console.error("Failed to subscribe to public groups", err);
        if (!cancelled) {
          setGroups([]);
          setGroupsError("We couldn't load public reviews right now. Please refresh to try again.");
          setGroupsLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [brand]);

  const brandLogo = useMemo(() => {
    if (!brand) return "";
    if (Array.isArray(brand.logos) && brand.logos.length > 0) {
      return brand.logos[0];
    }
    return brand.logoUrl || "";
  }, [brand]);

  useEffect(() => {
    if (!brandLogo) return;
    setGroups((prev) => prev.map((group) => ({ ...group, brandLogo })));
  }, [brandLogo]);

  if (brandLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-600 dark:bg-[var(--dark-bg)] dark:text-gray-300">
        Loading brand...
      </div>
    );
  }

  if (brandError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-center text-gray-700 dark:bg-[var(--dark-bg)] dark:text-gray-200">
        {brandError}
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-center text-gray-700 dark:bg-[var(--dark-bg)] dark:text-gray-200">
        We couldn&apos;t find a public dashboard for this brand.
      </div>
    );
  }

  const title = brand?.name || brand?.code || brandParam;
  const sanitizedTitle = useMemo(() => {
    if (!title) return "";
    const cleaned = title.replace(/\bbrand\b/gi, "").trim();
    return cleaned || title;
  }, [title]);
  const description = brand?.offering || brand?.tagline || "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-12 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
            {brandLogo && (
              <OptimizedImage
                pngUrl={brandLogo}
                alt={`${title} logo`}
                className="h-24 w-24 rounded-full border border-gray-200 bg-white object-contain p-4 shadow dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]"
              />
            )}
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-[var(--dark-text)]">{sanitizedTitle}</h1>
              {description && (
                <p className="mt-2 max-w-xl text-base text-gray-600 dark:text-gray-300">{description}</p>
              )}
              <p className="mt-3 text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Public Review
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {groupsError && (
          <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {groupsError}
          </div>
        )}
        {groupsLoading ? (
          <p className="text-gray-600 dark:text-gray-300">Loading public reviews...</p>
        ) : groups.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-300">No public reviews are available for this brand yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <ReviewGroupCard
                key={group.id}
                group={group}
                badges={group.badges}
                statusLabel={group.statusLabel}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicBrandDashboard;
