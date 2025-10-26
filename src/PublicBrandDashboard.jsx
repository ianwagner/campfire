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
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, db } from "./firebase/config";
import OptimizedImage from "./components/OptimizedImage.jsx";
import ReviewGroupCard from "./components/ReviewGroupCard.jsx";
import ensurePublicDashboardSlug from "./utils/ensurePublicDashboardSlug.js";
import { FiMessageSquare, FiMoreHorizontal } from "react-icons/fi";
import OverflowMenu from "./components/OverflowMenu.jsx";
import HelpdeskModal from "./components/HelpdeskModal.jsx";
import NotificationDot from "./components/NotificationDot.jsx";
import getPrimaryLogoUrl from "./utils/getPrimaryLogoUrl.js";
import { toDateSafe, countUnreadHelpdeskTickets } from "./utils/helpdesk";
import normalizeBoolean from "./utils/normalizeBoolean.js";

const statusBadgeLabels = {
  designed: "Ready for Review",
  reviewed: "Revisions in Progress",
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
};

const PublicBrandDashboard = () => {
  const { brandSlug: routeParam = "" } = useParams();
  const normalizedParam = useMemo(() => (routeParam || "").trim(), [routeParam]);
  const slugCandidates = useMemo(() => {
    if (!normalizedParam) return [];
    return [normalizedParam.toLowerCase()];
  }, [normalizedParam]);
  const codeCandidates = useMemo(() => {
    if (!normalizedParam) return [];
    const variants = new Set([
      normalizedParam,
      normalizedParam.toUpperCase(),
      normalizedParam.toLowerCase(),
    ]);
    if (/\s/.test(normalizedParam)) {
      variants.add(normalizedParam.replace(/\s+/g, "").toUpperCase());
    }
    return Array.from(variants);
  }, [normalizedParam]);

  const [brand, setBrand] = useState(null);
  const [brandError, setBrandError] = useState("");
  const [brandLoading, setBrandLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsError, setGroupsError] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showHelpdeskModal, setShowHelpdeskModal] = useState(false);
  const [user, setUser] = useState(auth.currentUser || null);
  const [signingIn, setSigningIn] = useState(false);
  const [helpdeskTickets, setHelpdeskTickets] = useState([]);
  const [helpdeskReadVersion, setHelpdeskReadVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (signingIn || user) {
      return;
    }

    setSigningIn(true);
    signInAnonymously(auth)
      .catch((err) => {
        console.error("Failed to sign in anonymously for public brand dashboard", err);
      })
      .finally(() => {
        setSigningIn(false);
      });
  }, [user, signingIn]);

  useEffect(() => {
    let cancelled = false;
    const loadBrand = async () => {
      setBrand(null);
      setBrandError("");
      setNotFound(false);
      setBrandLoading(true);
      if (slugCandidates.length === 0 && codeCandidates.length === 0) {
        setBrandLoading(false);
        setNotFound(true);
        return;
      }
      try {
        const tryCandidates = async (field, candidates) => {
          for (const value of candidates) {
            const snap = await getDocs(
              query(collection(db, "brands"), where(field, "==", value), limit(1))
            );
            if (!snap.empty) {
              return snap.docs[0];
            }
          }
          return null;
        };

        let docSnap = await tryCandidates("publicDashboardSlug", slugCandidates);
        if (!docSnap) {
          docSnap = await tryCandidates("code", codeCandidates);
        }
        if (docSnap) {
          const docData = docSnap.data();
          let slug = (docData.publicDashboardSlug || "").trim();
          if (!slug) {
            try {
              slug = await ensurePublicDashboardSlug(db, docSnap.id);
            } catch (slugErr) {
              console.error("Failed to ensure public dashboard slug", slugErr);
            }
          }
          if (cancelled) return;
          setBrand({ id: docSnap.id, ...docData, publicDashboardSlug: slug || docData.publicDashboardSlug || "" });
          setBrandLoading(false);
          return;
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
  }, [codeCandidates, slugCandidates]);

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
    const initialBrandLogo = getPrimaryLogoUrl(brand.logos) || brand.logoUrl || "";
    const q = query(
      collection(db, "adGroups"),
      where("brandCode", "==", brand.code),
      where("visibility", "==", "public"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const hydrate = async () => {
          try {
            const list = await Promise.all(
              snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                if (normalizeBoolean(data.requireAuth)) {
                  return null;
                }
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
                let unitCount = null;
                try {
                  const unitCountSnap = await getCountFromServer(
                    collection(db, "adGroups", docSnap.id, "adUnits")
                  );
                  unitCount = unitCountSnap.data().count ?? 0;
                } catch (err) {
                  console.error("Failed to count ad units", err);
                }

                if (unitCount !== null) {
                  totalAds = unitCount;
                } else {
                  let recipeCount = null;
                  try {
                    const recipeCountSnap = await getCountFromServer(
                      collection(db, "adGroups", docSnap.id, "recipes")
                    );
                    recipeCount = recipeCountSnap.data().count ?? 0;
                  } catch (err) {
                    console.error("Failed to count recipes", err);
                  }

                  if (recipeCount !== null) {
                    totalAds = recipeCount;
                  } else {
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
                  }
                }

                const createdAt = toDate(data.createdAt);
                const updatedAt =
                  toDate(data.lastUpdated) || toDate(data.updatedAt) || createdAt;

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
                  createdAt,
                  brandLogo: initialBrandLogo,
                  showLogo,
                  status: data.status || "",
                  statusLabel,
                  badges,
                };
              })
            );
            if (!cancelled) {
              list.sort((a, b) => {
                const aPrimary = a.createdAt
                  ? a.createdAt.getTime()
                  : a.updatedAt
                  ? a.updatedAt.getTime()
                  : 0;
                const bPrimary = b.createdAt
                  ? b.createdAt.getTime()
                  : b.updatedAt
                  ? b.updatedAt.getTime()
                  : 0;
                if (bPrimary !== aPrimary) {
                  return bPrimary - aPrimary;
                }
                const aUpdated = a.updatedAt ? a.updatedAt.getTime() : 0;
                const bUpdated = b.updatedAt ? b.updatedAt.getTime() : 0;
                return bUpdated - aUpdated;
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

  const brandCode = brand?.code || "";
  const helpdeskUserId = user?.uid || "";

  useEffect(() => {
    if (!brandCode || !helpdeskUserId) {
      setHelpdeskTickets([]);
      return undefined;
    }

    const ticketsRef = collection(db, "requests");
    const helpdeskQuery = query(
      ticketsRef,
      where("type", "==", "helpdesk"),
      where("brandCode", "==", brandCode),
      where("participants", "array-contains", helpdeskUserId)
    );

    const unsubscribe = onSnapshot(
      helpdeskQuery,
      (snapshot) => {
        const openTickets = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((ticket) => {
            const status = String(ticket.status || "new")
              .trim()
              .toLowerCase();
            return status !== "done";
          })
          .sort((a, b) => {
            const aTime =
              toDateSafe(a.lastMessageAt || a.updatedAt || a.createdAt)?.getTime() || 0;
            const bTime =
              toDateSafe(b.lastMessageAt || b.updatedAt || b.createdAt)?.getTime() || 0;
            return bTime - aTime;
          });
        setHelpdeskTickets(openTickets);
      },
      (err) => {
        console.error("Failed to load helpdesk tickets for public dashboard", err);
        setHelpdeskTickets([]);
      }
    );

    return () => unsubscribe();
  }, [brandCode, helpdeskUserId]);

  const unreadHelpdeskCount = useMemo(
    () => countUnreadHelpdeskTickets(helpdeskTickets),
    [helpdeskTickets, helpdeskReadVersion]
  );
  const hasUnreadHelpdesk = unreadHelpdeskCount > 0;

  const brandLogo = useMemo(() => {
    if (!brand) return "";
    const primaryLogo = getPrimaryLogoUrl(brand.logos);
    return primaryLogo || brand.logoUrl || "";
  }, [brand]);

  useEffect(() => {
    if (!brandLogo) return;
    setGroups((prev) => prev.map((group) => ({ ...group, brandLogo })));
  }, [brandLogo]);

  const title = brand?.name || brand?.code || normalizedParam;
  const sanitizedTitle = useMemo(() => {
    if (!title) return "";
    const cleaned = title.replace(/\bbrand\b/gi, "").trim();
    return cleaned || title;
  }, [title]);

  const dashboardMenuActions = useMemo(
    () => [
      {
        key: "helpdesk",
        label: (
          <span className="flex w-full items-center justify-between">
            <span>Contact helpdesk</span>
            {hasUnreadHelpdesk ? (
              <NotificationDot size="sm" srText="Unread helpdesk messages" />
            ) : null}
          </span>
        ),
        onSelect: () => setShowHelpdeskModal(true),
        Icon: FiMessageSquare,
      },
    ],
    [setShowHelpdeskModal, hasUnreadHelpdesk]
  );
  const dashboardMenuButtonIcon = useMemo(
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
    [hasUnreadHelpdesk]
  );
  const dashboardMenuAriaLabel = hasUnreadHelpdesk
    ? "Open public dashboard actions menu (unread helpdesk messages)"
    : "Open public dashboard actions menu";
  const hasDashboardMenuActions = dashboardMenuActions.length > 0;

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)]">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="flex w-full flex-col gap-6 text-center md:flex-row md:items-start md:justify-between md:text-left">
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
              {brandLogo && (
                <OptimizedImage
                  pngUrl={brandLogo}
                  alt={`${title} logo`}
                  className="h-24 w-24 rounded-2xl border border-gray-200 bg-white object-contain p-4 shadow dark:border-gray-600 dark:bg-white"
                />
              )}
              <div>
                <h1 className="text-3xl font-semibold text-gray-900 dark:text-[var(--dark-text)]">{sanitizedTitle}</h1>
              </div>
            </div>
            {hasDashboardMenuActions && (
              <div className="flex w-full justify-end md:w-auto">
                <OverflowMenu
                  actions={dashboardMenuActions}
                  buttonAriaLabel={dashboardMenuAriaLabel}
                  buttonIcon={dashboardMenuButtonIcon}
                />
              </div>
            )}
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
      {showHelpdeskModal && (
        <HelpdeskModal
          brandCode={brandCode}
          user={user}
          onClose={() => setShowHelpdeskModal(false)}
          tickets={helpdeskTickets}
          onTicketViewed={() => setHelpdeskReadVersion((value) => value + 1)}
        />
      )}
    </div>
  );
};

export default PublicBrandDashboard;
