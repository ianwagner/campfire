import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import MonthTag from "./components/MonthTag.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import parseAdFilename from "./utils/parseAdFilename.js";

const GroupCard = ({ group }) => {
  const rotations = useMemo(
    () => group.previewAds.map(() => Math.random() * 10 - 5),
    [group.id, group.previewAds.length]
  );

  const showLogo =
    typeof group.showLogo === "boolean"
      ? group.showLogo
      : group.previewAds.length === 0;

  const firstPreview = group.previewAds[0] || {};
  const parsed = parseAdFilename(firstPreview.filename || "");
  const aspect = showLogo
    ? "1/1"
    : (firstPreview.aspectRatio || parsed.aspectRatio || "9x16").replace("x", "/");

  const containerStyle = showLogo
    ? { aspectRatio: aspect, background: "#f3f4f6" }
    : { aspectRatio: aspect };

  const totalUnits =
    typeof group.totalUnits === "number" && !Number.isNaN(group.totalUnits)
      ? group.totalUnits
      : group.previewAds.length;

  const updatedLabel = group.updatedAt
    ? group.updatedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      to={`/review/${group.id}`}
      className="group block rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      <div
        className="relative w-full overflow-hidden rounded-t-xl"
        style={containerStyle}
      >
        {showLogo && group.brandLogo ? (
          <OptimizedImage
            pngUrl={group.brandLogo}
            alt={`${group.name} logo`}
            className="absolute inset-0 h-full w-full object-contain p-6"
          />
        ) : showLogo ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-3xl font-semibold text-gray-500">
            {group.name.slice(0, 1).toUpperCase()}
          </div>
        ) : (
          group.previewAds.map((ad, idx) => (
            <OptimizedImage
              key={ad.id || idx}
              pngUrl={ad.thumbnailUrl || ad.firebaseUrl || ""}
              alt={group.name}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                transform: `rotate(${rotations[idx]}deg)`,
                zIndex: idx + 1,
                top: `${-idx * 4}px`,
                left: `${idx * 4}px`,
              }}
            />
          ))
        )}
      </div>
      <div className="p-5 text-center">
        <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
          {group.month && <MonthTag month={group.month} />}
          <span>{totalUnits} ad units</span>
          {group.status && <StatusBadge status={group.status} className="text-xs" />}
          {group.requirePassword && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Password required
            </span>
          )}
        </div>
        {updatedLabel && (
          <p className="mt-3 text-xs text-gray-500">Updated {updatedLabel}</p>
        )}
      </div>
    </Link>
  );
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

                const showLogo =
                  previewAds.length === 0 ||
                  previewAds.every((ad) => ad.status === "pending");

                let totalUnits = 0;
                try {
                  const countSnap = await getCountFromServer(
                    collection(db, "adGroups", docSnap.id, "adUnits")
                  );
                  totalUnits = countSnap.data().count || 0;
                } catch (err) {
                  console.error("Failed to count ad units", err);
                  const fallbackCandidates = [
                    data.adUnitCount,
                    data.totalAdUnits,
                    data.totalAds,
                    data.assetCount,
                  ];
                  const fallbackValue = fallbackCandidates.find(
                    (val) => typeof val === "number" && !Number.isNaN(val)
                  );
                  if (typeof fallbackValue === "number") {
                    totalUnits = fallbackValue;
                  } else {
                    try {
                      const assetCountSnap = await getCountFromServer(
                        collection(db, "adGroups", docSnap.id, "assets")
                      );
                      totalUnits = assetCountSnap.data().count || 0;
                    } catch (assetErr) {
                      console.error("Failed to count assets", assetErr);
                      totalUnits = previewAds.length;
                    }
                  }
                }

                const updatedAt =
                  (data.lastUpdated?.toDate && data.lastUpdated.toDate()) ||
                  (data.createdAt?.toDate && data.createdAt.toDate()) ||
                  null;

                return {
                  id: docSnap.id,
                  name: data.name || "Untitled Review",
                  month: data.month || "",
                  previewAds,
                  totalUnits,
                  updatedAt,
                  requirePassword: !!data.requirePassword,
                  brandLogo,
                  status: data.status || "",
                  showLogo,
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-600">
        Loading brand...
      </div>
    );
  }

  if (brandError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-center text-gray-700">
        {brandError}
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-center text-gray-700">
        We couldn&apos;t find a public dashboard for this brand.
      </div>
    );
  }

  const title = brand?.name || brand?.code || brandParam;
  const description = brand?.offering || brand?.tagline || "";

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previousTitle = document.title;
    document.title = title
      ? `${title} · Public Dashboard`
      : "Public Dashboard";
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-12 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
            {brandLogo && (
              <OptimizedImage
                pngUrl={brandLogo}
                alt={`${title} logo`}
                className="h-24 w-24 rounded-full border border-gray-200 bg-white object-contain p-4 shadow"
              />
            )}
            <div>
              <h1 className="text-3xl font-semibold text-gray-900">{title}</h1>
              {description && (
                <p className="mt-2 max-w-xl text-base text-gray-600">{description}</p>
              )}
              <p className="mt-3 text-sm uppercase tracking-wide text-gray-500">
                Public Dashboard
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {groupsError && (
          <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4 text-amber-700">
            {groupsError}
          </div>
        )}
        {groupsLoading ? (
          <p className="text-gray-600">Loading public reviews...</p>
        ) : groups.length === 0 ? (
          <p className="text-gray-600">No public reviews are available for this brand yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicBrandDashboard;
