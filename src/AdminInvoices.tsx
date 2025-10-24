import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase/config";
import LoadingOverlay from "./LoadingOverlay";
import Button from "./components/Button.jsx";
import FormField from "./components/FormField.jsx";
import MonthSelector from "./components/MonthSelector.jsx";
import debugLog from "./utils/debugLog";

const UNKNOWN_BRAND_LABEL = "Unassigned";

type InvoiceStatus = "draft" | "sent" | "reconciled";
type ContractMode = "production" | "brief" | "combined";

type InvoiceEntry = {
  brandCode: string;
  deliveredCount: number;
};

type InvoiceRecord = {
  id: string;
  monthKey: string;
  contractMode: ContractMode;
  generatedAt?: Timestamp | null;
  generatedBy?: string;
  status: InvoiceStatus;
  entries: InvoiceEntry[];
  sentAt?: Timestamp | null;
  sentBy?: string;
  reconciledAt?: Timestamp | null;
  reconciledBy?: string;
  reconciledEntries?: InvoiceEntry[];
  brandCodes: string[];
};

type InvoiceDeltaRow = {
  brandCode: string;
  snapshotCount: number;
  currentCount: number;
  delta: number;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const invoiceDocId = (monthKey: string, mode: ContractMode) => {
  const suffix = mode === "combined" ? "all" : mode;
  return `${monthKey}-${suffix}`;
};

const normalizeContractModeValue = (value: unknown): ContractMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "brief" || normalized === "briefs") return "brief";
  if (normalized === "production") return "production";
  if (normalized === "combined" || normalized === "all" || normalized === "both") return "combined";
  return null;
};

const readContractModeFromData = (data: DocumentData): ContractMode | null =>
  normalizeContractModeValue(
    data.contractMode ??
      data.contract_mode ??
      data.contractType ??
      data.contract_type ??
      data.mode ??
      data.type
  );

const contractCoversMonth = (contract: BrandContract, monthKey: string) => {
  const startStr = typeof contract.startDate === "string" ? contract.startDate.slice(0, 7) : "";
  if (!startStr) return false;

  const normalizeDate = (value: string) => {
    const date = new Date(`${value}-01T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const target = normalizeDate(monthKey);
  const start = normalizeDate(startStr);
  let end: Date | null = null;

  const endStr = typeof contract.endDate === "string" ? contract.endDate.slice(0, 7) : "";
  if (endStr) {
    end = normalizeDate(endStr);
  } else if (contract.renews || contract.repeat) {
    end = new Date(start);
    end.setMonth(end.getMonth() + 60);
  } else {
    end = new Date(start);
  }

  if (!end) return false;
  return target >= start && target <= end;
};

type BrandContract = {
  startDate?: string;
  endDate?: string;
  renews?: boolean;
  repeat?: boolean;
  mode: ContractMode;
};

type BrandDirectoryItem = {
  id: string;
  code: string;
  name?: string;
  agencyId?: string;
  contracts: BrandContract[];
};

type AgencyDirectoryItem = {
  id: string;
  name: string;
};

const toMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

const formatMonthLabel = (monthKey: string) => {
  if (!monthKey) return "";
  const parts = monthKey.split("-");
  if (parts.length !== 2) return monthKey;
  const [year, month] = parts;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
};

const formatTimestamp = (value?: Timestamp | null) => {
  if (!value) return null;
  try {
    return value.toDate().toLocaleString();
  } catch (err) {
    debugLog("Failed to format timestamp", err);
    return null;
  }
};

const normalizeBrandCode = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return UNKNOWN_BRAND_LABEL;
};

const sanitizeBrandCode = (value: unknown): string | null => {
  const normalized = normalizeBrandCode(value);
  if (!normalized || normalized === UNKNOWN_BRAND_LABEL) {
    return null;
  }
  return normalized;
};

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const readDeliveredCount = (data: DocumentData): number => {
  const candidates = [
    data.deliveredCount,
    data.delivered,
    data.deliveryCount,
    data.totalDelivered,
    data.total,
    data.count,
  ];

  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && !Number.isNaN(num)) {
      return num;
    }
  }

  if (data.metrics && typeof data.metrics === "object" && data.metrics !== null) {
    const metrics = data.metrics as Record<string, unknown>;
    const metricCandidates = [
      metrics.deliveredCount,
      metrics.delivered,
      metrics.totalDelivered,
      metrics.count,
      metrics.total,
    ];
    for (const candidate of metricCandidates) {
      const num = Number(candidate);
      if (Number.isFinite(num) && !Number.isNaN(num)) {
        return num;
      }
    }
  }

  return 0;
};

type AggregateOptions = {
  allowedBrands?: Set<string> | null;
  contractModes?: Set<ContractMode> | null;
};

const aggregateDeliveredCounts = (
  docs: QueryDocumentSnapshot<DocumentData>[],
  invoiceEntries: InvoiceEntry[] = [],
  options: AggregateOptions = {}
): InvoiceEntry[] => {
  const totals = new Map<string, number>();
  const { allowedBrands = null, contractModes = null } = options;

  const allowBrand = (brand: string) => {
    if (!brand) return false;
    if (!allowedBrands || allowedBrands.size === 0) return true;
    return allowedBrands.has(brand);
  };

  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const brandCode = normalizeBrandCode(data.brandCode ?? data.brand_code);
    if (!allowBrand(brandCode)) {
      return;
    }
    const modeFromDoc = readContractModeFromData(data);
    if (contractModes && contractModes.size > 0) {
      if (modeFromDoc) {
        if (!contractModes.has(modeFromDoc)) {
          return;
        }
      } else if (!contractModes.has("production") && !contractModes.has("brief")) {
        return;
      }
    }
    const delivered = readDeliveredCount(data);
    totals.set(brandCode, (totals.get(brandCode) ?? 0) + delivered);
  });

  invoiceEntries.forEach((entry) => {
    const brand = entry?.brandCode ? entry.brandCode : UNKNOWN_BRAND_LABEL;
    if (!allowBrand(brand)) {
      return;
    }
    if (!totals.has(brand)) {
      const delivered = Number(entry?.deliveredCount ?? entry?.delivered ?? entry?.count ?? 0) || 0;
      totals.set(brand, delivered);
    }
  });

  if (allowedBrands && allowedBrands.size > 0) {
    allowedBrands.forEach((brand) => {
      if (!totals.has(brand)) {
        totals.set(brand, 0);
      }
    });
  }

  const aggregated = Array.from(totals.entries()).map(([brandCode, deliveredCount]) => ({
    brandCode,
    deliveredCount,
  }));

  aggregated.sort((a, b) => a.brandCode.localeCompare(b.brandCode));
  return aggregated;
};

const applyBrandFilter = (
  rows: InvoiceEntry[],
  allowedBrands: Set<string> | null,
  baselineEntries: InvoiceEntry[] = [],
  additionalCodes: string[] = []
): InvoiceEntry[] => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedBaseline = Array.isArray(baselineEntries) ? baselineEntries : [];
  const extras = Array.isArray(additionalCodes) ? additionalCodes : [];

  const map = new Map<string, number>();

  const includeBrand = (code: string) => {
    if (!code) return false;
    if (!allowedBrands || allowedBrands.size === 0) return true;
    return allowedBrands.has(code);
  };

  normalizedRows.forEach((row) => {
    const code = normalizeBrandCode(row?.brandCode);
    if (!includeBrand(code)) return;
    const delivered = Number(row?.deliveredCount ?? row?.delivered ?? row?.count ?? 0) || 0;
    map.set(code, delivered);
  });

  normalizedBaseline.forEach((entry) => {
    const code = normalizeBrandCode(entry?.brandCode);
    if (!includeBrand(code)) return;
    if (!map.has(code)) {
      const delivered = Number(entry?.deliveredCount ?? entry?.delivered ?? entry?.count ?? 0) || 0;
      map.set(code, delivered);
    }
  });

  extras.forEach((value) => {
    const code = normalizeBrandCode(value);
    if (!includeBrand(code)) return;
    if (!map.has(code)) {
      map.set(code, 0);
    }
  });

  const filtered = Array.from(map.entries()).map(([brandCode, deliveredCount]) => ({
    brandCode,
    deliveredCount,
  }));

  filtered.sort((a, b) => a.brandCode.localeCompare(b.brandCode));
  return filtered;
};

const parseInvoiceDocument = (id: string, data: DocumentData): InvoiceRecord => {
  const rawEntries = Array.isArray(data.entries) ? data.entries : [];
  const entries: InvoiceEntry[] = rawEntries
    .map((entry) => ({
      brandCode: normalizeBrandCode(entry?.brandCode),
      deliveredCount: Number(entry?.deliveredCount ?? entry?.delivered ?? entry?.count ?? 0) || 0,
    }))
    .sort((a, b) => a.brandCode.localeCompare(b.brandCode));

  const contractMode =
    normalizeContractModeValue(data.contractMode ?? data.contract_type ?? data.mode) ?? "production";

  const brandCodes = Array.isArray(data.brandCodes)
    ? Array.from(
        new Set(
          data.brandCodes
            .map((value: unknown) => normalizeBrandCode(value))
            .filter((code: string) => code && code !== UNKNOWN_BRAND_LABEL)
        )
      ).sort((a, b) => a.localeCompare(b))
    : [];

  return {
    id,
    monthKey: typeof data.monthKey === "string" ? data.monthKey : id,
    contractMode,
    generatedAt: data.generatedAt ?? null,
    generatedBy: typeof data.generatedBy === "string" ? data.generatedBy : undefined,
    status: data.status === "sent" || data.status === "reconciled" ? data.status : "draft",
    entries,
    sentAt: data.sentAt ?? null,
    sentBy: typeof data.sentBy === "string" ? data.sentBy : undefined,
    reconciledAt: data.reconciledAt ?? null,
    reconciledBy: typeof data.reconciledBy === "string" ? data.reconciledBy : undefined,
    reconciledEntries: Array.isArray(data.reconciledEntries)
      ? data.reconciledEntries.map((entry: Record<string, unknown>) => ({
          brandCode: normalizeBrandCode(entry?.brandCode),
          deliveredCount: Number(entry?.deliveredCount ?? entry?.delivered ?? entry?.count ?? 0) || 0,
        }))
      : undefined,
    brandCodes,
  };
};


const statusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-[var(--dark-sidebar-hover)] dark:text-gray-200",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  reconciled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const CONTRACT_LABELS: Record<ContractMode, string> = {
  combined: "All Contracts",
  production: "Production",
  brief: "Briefs",
};

const AdminInvoices: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(new Date()));
  const [contractMode, setContractMode] = useState<ContractMode>("combined");
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [allRows, setAllRows] = useState<InvoiceEntry[]>([]);
  const [currentRows, setCurrentRows] = useState<InvoiceEntry[]>([]);
  const [reconciliationRows, setReconciliationRows] = useState<InvoiceDeltaRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [brandDirectory, setBrandDirectory] = useState<BrandDirectoryItem[]>([]);
  const [agencyDirectory, setAgencyDirectory] = useState<AgencyDirectoryItem[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [selectedBrandCodes, setSelectedBrandCodes] = useState<string[]>([]);
  const [selectionValue, setSelectionValue] = useState<string>("");
  const [lastExportedAt, setLastExportedAt] = useState<Date | null>(null);

  const contractModeLabel = CONTRACT_LABELS[contractMode];
  const effectiveContractModes = useMemo<ContractMode[]>(() => {
    if (contractMode === "combined") {
      return ["production", "brief"] as ContractMode[];
    }
    return [contractMode];
  }, [contractMode]);
  const effectiveContractModeSet = useMemo(
    () => new Set<ContractMode>(effectiveContractModes),
    [effectiveContractModes]
  );

  useEffect(() => {
    let cancelled = false;

    const loadDirectories = async () => {
      setDirectoryLoading(true);
      try {
        const [brandSnap, agencySnap] = await Promise.all([
          getDocs(collection(db, "brands")),
          getDocs(collection(db, "agencies")),
        ]);

        if (cancelled) return;

        const brands: BrandDirectoryItem[] = brandSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as DocumentData;
            const code = sanitizeBrandCode(data.code ?? docSnap.id);
            if (!code) return null;
            const contractsRaw = Array.isArray(data.contracts) ? data.contracts : [];
            const contracts: BrandContract[] = contractsRaw.map((contract: Record<string, unknown>) => ({
              startDate: typeof contract?.startDate === "string" ? contract.startDate : "",
              endDate: typeof contract?.endDate === "string" ? contract.endDate : "",
              renews: Boolean(contract?.renews ?? contract?.renew),
              repeat: Boolean(contract?.repeat),
              mode: normalizeContractModeValue(contract?.mode) ?? "production",
            }));
            return {
              id: docSnap.id,
              code,
              name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : code,
              agencyId: typeof data.agencyId === "string" ? data.agencyId : undefined,
              contracts,
            } as BrandDirectoryItem;
          })
          .filter(Boolean) as BrandDirectoryItem[];

        const agencies: AgencyDirectoryItem[] = agencySnap.docs.map((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const name =
            typeof data.name === "string" && data.name.trim() ? data.name.trim() : docSnap.id;
          return { id: docSnap.id, name };
        });

        setBrandDirectory(brands);
        setAgencyDirectory(agencies);
      } catch (err) {
        console.error("Failed to load directory data", err);
        if (!cancelled) {
          setBrandDirectory([]);
          setAgencyDirectory([]);
        }
      } finally {
        if (!cancelled) {
          setDirectoryLoading(false);
        }
      }
    };

    loadDirectories();

    return () => {
      cancelled = true;
    };
  }, []);

  const brandByCode = useMemo(() => {
    const map = new Map<string, BrandDirectoryItem>();
    brandDirectory.forEach((brand) => {
      if (brand.code) {
        map.set(brand.code, brand);
      }
    });
    return map;
  }, [brandDirectory]);

  const agenciesById = useMemo(() => {
    const map = new Map<string, AgencyDirectoryItem>();
    agencyDirectory.forEach((agency) => {
      map.set(agency.id, agency);
    });
    return map;
  }, [agencyDirectory]);

  const contractEligibleBrands = useMemo(() => {
    const eligible = new Set<string>();
    if (!selectedMonth) {
      return eligible;
    }
    brandDirectory.forEach((brand) => {
      if (!brand.code) return;
      const hasActive = brand.contracts.some((contract) => {
        if (!contractCoversMonth(contract, selectedMonth)) {
          return false;
        }
        if (contract.mode === "combined") {
          return (
            effectiveContractModeSet.has("production") || effectiveContractModeSet.has("brief")
          );
        }
        return effectiveContractModeSet.has(contract.mode);
      });
      if (hasActive) {
        eligible.add(brand.code);
      }
    });
    return eligible;
  }, [brandDirectory, effectiveContractModeSet, selectedMonth]);

  const selectedBrandSet = useMemo(() => {
    const set = new Set<string>();
    selectedBrandCodes.forEach((code) => {
      const normalized = sanitizeBrandCode(code);
      if (normalized) {
        set.add(normalized);
      }
    });
    return set;
  }, [selectedBrandCodes]);

  const allowedBrandSet = useMemo(() => {
    if (selectedBrandSet.size > 0) {
      return selectedBrandSet;
    }
    if (contractEligibleBrands.size > 0) {
      return contractEligibleBrands;
    }
    return null;
  }, [contractEligibleBrands, selectedBrandSet]);

  const brandOptions = useMemo(
    () =>
      brandDirectory
        .map((brand) => ({
          value: `brand:${brand.code}`,
          label: brand.name ? `${brand.name} (${brand.code})` : brand.code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [brandDirectory]
  );

  const agencySelectionOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    brandDirectory.forEach((brand) => {
      if (!brand.agencyId) return;
      if (!map.has(brand.agencyId)) {
        map.set(brand.agencyId, new Set());
      }
      map.get(brand.agencyId)!.add(brand.code);
    });
    return Array.from(map.entries())
      .map(([agencyId, codes]) => {
        const agency = agenciesById.get(agencyId);
        const codeList = Array.from(codes).sort((a, b) => a.localeCompare(b));
        const name = agency?.name || agencyId;
        const label = `${name} · ${codeList.length} brand${codeList.length === 1 ? "" : "s"}`;
        return { value: `agency:${agencyId}`, label, brandCodes: codeList, name };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [agenciesById, brandDirectory]);

  const agencySelectionLookup = useMemo(() => {
    const map = new Map<string, { brandCodes: string[]; name: string }>();
    agencySelectionOptions.forEach((option) => {
      map.set(option.value, { brandCodes: option.brandCodes, name: option.name });
    });
    return map;
  }, [agencySelectionOptions]);

  const selectedBrandDetails = useMemo(
    () =>
      selectedBrandCodes
        .map((code) => {
          const normalized = sanitizeBrandCode(code);
          if (!normalized) return null;
          const brand = brandByCode.get(normalized);
          const brandLabel = brand?.name?.trim() || normalized;
          const agencyName = brand?.agencyId ? agenciesById.get(brand.agencyId)?.name : undefined;
          const displayLabel = agencyName
            ? `${brandLabel} (${normalized}) · ${agencyName}`
            : brand?.name
              ? `${brandLabel} (${normalized})`
              : normalized;
          return {
            code: normalized,
            brandLabel,
            agencyName,
            displayLabel,
            active: contractEligibleBrands.has(normalized),
          };
        })
        .filter(Boolean) as Array<{
          code: string;
          brandLabel: string;
          agencyName?: string;
          displayLabel: string;
          active: boolean;
        }>,
    [agenciesById, brandByCode, contractEligibleBrands, selectedBrandCodes]
  );

  const inactiveSelectedBrands = useMemo(
    () => selectedBrandDetails.filter((detail) => !detail.active).map((detail) => detail.displayLabel),
    [selectedBrandDetails]
  );

  const fetchInvoiceDoc = useCallback(
    async (monthKey: string, mode: ContractMode) => {
      const docId = invoiceDocId(monthKey, mode);
      const invoiceRef = doc(db, "invoices", docId);
      const snap = await getDoc(invoiceRef);
      if (snap.exists()) {
        return parseInvoiceDocument(snap.id, snap.data() as DocumentData);
      }
      if (mode === "production") {
        const legacyRef = doc(db, "invoices", monthKey);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          const record = parseInvoiceDocument(legacySnap.id, legacySnap.data() as DocumentData);
          return { ...record, contractMode: "production" as ContractMode };
        }
      }
      return null;
    },
    []
  );

  const fetchDeliveredRows = useCallback(
    async (
      monthKey: string,
      modes: ContractMode[],
      invoiceEntries: InvoiceEntry[] = [],
      allowedBrands: Set<string> | null = null
    ) => {
      const normalizedModes = new Set<ContractMode>();
      modes.forEach((mode) => {
        if (mode === "combined") {
          normalizedModes.add("production");
          normalizedModes.add("brief");
        } else {
          normalizedModes.add(mode);
        }
      });

      const adsRef = collection(db, "ads");
      const adsQuery = query(adsRef, where("monthKey", "==", monthKey));
      const adsSnap = await getDocs(adsQuery);
      return aggregateDeliveredCounts(adsSnap.docs, invoiceEntries, {
        allowedBrands,
        contractModes: normalizedModes.size > 0 ? normalizedModes : null,
      });
    },
    []
  );

  const loadSnapshot = useCallback(
    async (monthKey: string, mode: ContractMode, modes: ContractMode[]) => {
      const invoiceRecord = await fetchInvoiceDoc(monthKey, mode);
      const deliveredRows = await fetchDeliveredRows(
        monthKey,
        modes,
        invoiceRecord?.entries ?? [],
        null
      );
      return {
        invoiceRecord,
        deliveredRows: deliveredRows.length > 0 ? deliveredRows : invoiceRecord?.entries || [],
      };
    },
    [fetchDeliveredRows, fetchInvoiceDoc]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInfo(null);
    setReconciliationRows(null);

    loadSnapshot(selectedMonth, contractMode, effectiveContractModes)
      .then(({ invoiceRecord, deliveredRows }) => {
        if (!active) return;
        setInvoice(invoiceRecord);
        setAllRows(deliveredRows);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load invoice data", err);
        setError("Failed to load invoice data. Please try again.");
        setInvoice(null);
        setAllRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [contractMode, effectiveContractModes, loadSnapshot, selectedMonth]);

  useEffect(() => {
    if (!invoice) {
      setSelectedBrandCodes([]);
      return;
    }
    const codes = Array.isArray(invoice.brandCodes)
      ? Array.from(
          new Set(
            invoice.brandCodes
              .map((value) => sanitizeBrandCode(value))
              .filter((code): code is string => Boolean(code))
          )
        ).sort((a, b) => a.localeCompare(b))
      : [];
    setSelectedBrandCodes((prev) => (arraysEqual(prev, codes) ? prev : codes));
  }, [invoice]);

  useEffect(() => {
    const filtered = applyBrandFilter(
      allRows,
      allowedBrandSet,
      invoice?.entries ?? [],
      selectedBrandCodes
    );
    setCurrentRows(filtered);
  }, [allRows, allowedBrandSet, invoice?.entries, selectedBrandCodes]);

  useEffect(() => {
    setReconciliationRows(null);
  }, [contractMode, selectedBrandCodes, selectedMonth]);

  const totalDelivered = useMemo(
    () => currentRows.reduce((sum, row) => sum + (Number(row.deliveredCount) || 0), 0),
    [currentRows]
  );

  const savedTotal = useMemo(
    () => invoice?.entries.reduce((sum, entry) => sum + (Number(entry.deliveredCount) || 0), 0) ?? 0,
    [invoice]
  );

  const deltaTotal = useMemo(() => totalDelivered - savedTotal, [savedTotal, totalDelivered]);

  const exportableRows = useMemo(() => {
    if (invoice && invoice.entries.length > 0) {
      return invoice.entries;
    }
    return currentRows;
  }, [currentRows, invoice]);

  const hasExportableRows = exportableRows.length > 0;

  const scopeDescription = useMemo(
    () => (contractMode === "combined" ? "brief and production" : contractModeLabel.toLowerCase()),
    [contractMode, contractModeLabel]
  );

  const selectionSummaryLabel = useMemo(() => {
    if (selectedBrandDetails.length > 0) {
      const count = selectedBrandDetails.length;
      return `${count} selected brand${count === 1 ? "" : "s"}`;
    }
    if (contractEligibleBrands.size > 0) {
      return `active ${scopeDescription} contracts`;
    }
    return "all brands";
  }, [contractEligibleBrands, scopeDescription, selectedBrandDetails.length]);

  const comparisonRows = useMemo(() => {
    const map = new Map<
      string,
      {
        current: number;
        saved: number;
      }
    >();

    currentRows.forEach((row) => {
      const code = row.brandCode || UNKNOWN_BRAND_LABEL;
      const delivered = Number(row.deliveredCount) || 0;
      map.set(code, {
        current: delivered,
        saved: map.get(code)?.saved ?? 0,
      });
    });

    (invoice?.entries ?? []).forEach((entry) => {
      const code = entry.brandCode || UNKNOWN_BRAND_LABEL;
      const delivered = Number(entry.deliveredCount) || 0;
      const existing = map.get(code) ?? { current: 0, saved: 0 };
      existing.saved = delivered;
      map.set(code, existing);
    });

    return Array.from(map.entries())
      .map(([brandCode, value]) => ({
        brandCode,
        current: value.current,
        saved: value.saved,
        delta: value.current - value.saved,
      }))
      .sort((a, b) => a.brandCode.localeCompare(b.brandCode));
  }, [currentRows, invoice]);

  const reconciliationTotals = useMemo(() => {
    if (!reconciliationRows) return null;
    const snapshotTotal = reconciliationRows.reduce((sum, row) => sum + row.snapshotCount, 0);
    const currentTotal = reconciliationRows.reduce((sum, row) => sum + row.currentCount, 0);
    const deltaTotal = reconciliationRows.reduce((sum, row) => sum + row.delta, 0);
    return { snapshotTotal, currentTotal, deltaTotal };
  }, [reconciliationRows]);

  const userLabel = () => {
    const user = auth.currentUser;
    if (!user) return "system";
    return user.email || user.displayName || user.uid || "system";
  };

  const refreshInvoice = useCallback(
    async (monthKey: string, mode: ContractMode) => {
      const refreshed = await fetchInvoiceDoc(monthKey, mode);
      setInvoice(refreshed);
    },
    [fetchInvoiceDoc]
  );

  const handleAddSelection = (value: string) => {
    setSelectionValue("");
    if (!value) return;
    setError(null);
    setInfo(null);
    setReconciliationRows(null);

    if (value.startsWith("brand:")) {
      const code = sanitizeBrandCode(value.slice(6));
      if (!code) return;
      setSelectedBrandCodes((prev) => {
        if (prev.includes(code)) return prev;
        const next = [...prev, code].sort((a, b) => a.localeCompare(b));
        return next;
      });
      return;
    }

    if (value.startsWith("agency:")) {
      const match = agencySelectionLookup.get(value);
      if (!match || match.brandCodes.length === 0) {
        return;
      }
      setSelectedBrandCodes((prev) => {
        const next = [...prev];
        match.brandCodes.forEach((brandCode) => {
          const normalized = sanitizeBrandCode(brandCode);
          if (normalized && !next.includes(normalized)) {
            next.push(normalized);
          }
        });
        next.sort((a, b) => a.localeCompare(b));
        return next;
      });
    }
  };

  const handleRemoveBrand = (code: string) => {
    setSelectedBrandCodes((prev) => prev.filter((value) => value !== code));
    setError(null);
    setInfo(null);
    setReconciliationRows(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const allowedForSave =
        allowedBrandSet && allowedBrandSet.size > 0 ? new Set(allowedBrandSet) : null;
      const freshRows = await fetchDeliveredRows(
        selectedMonth,
        effectiveContractModes,
        invoice?.entries || [],
        allowedForSave
      );
      setAllRows(freshRows);
      setLastUpdated(new Date());

      const filteredRows = applyBrandFilter(
        freshRows,
        allowedForSave,
        invoice?.entries ?? [],
        selectedBrandCodes
      );

      const brandCodesToPersist = filteredRows.length
        ? filteredRows.map((row) => row.brandCode)
        : allowedForSave && allowedForSave.size > 0
          ? Array.from(allowedForSave).sort((a, b) => a.localeCompare(b))
          : selectedBrandCodes.length > 0
            ? [...selectedBrandCodes]
            : freshRows.map((row) => row.brandCode);

      const invoiceRef = doc(db, "invoices", invoiceDocId(selectedMonth, contractMode));
      const payload: Record<string, unknown> = {
        monthKey: selectedMonth,
        contractMode,
        generatedAt: serverTimestamp(),
        generatedBy: userLabel(),
        status: invoice?.status ?? "draft",
        entries: filteredRows,
        brandCodes: brandCodesToPersist,
      };
      await setDoc(invoiceRef, payload, { merge: true });
      await refreshInvoice(selectedMonth, contractMode);
      setReconciliationRows(null);
      setInfo("Invoice snapshot saved.");
    } catch (err) {
      console.error("Failed to save invoice", err);
      setError("Failed to save the invoice snapshot. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!invoice) {
      setError("Save the invoice snapshot before marking it as sent.");
      return;
    }
    setMarking(true);
    setError(null);
    setInfo(null);
    try {
      const invoiceRef = doc(db, "invoices", invoiceDocId(selectedMonth, contractMode));
      const brandCodesForSent = invoice.brandCodes.length
        ? invoice.brandCodes
        : selectedBrandCodes.length > 0
          ? [...selectedBrandCodes]
          : currentRows.map((row) => row.brandCode);
      const updates: Record<string, unknown> = {
        status: "sent",
        sentAt: serverTimestamp(),
        sentBy: userLabel(),
        contractMode,
        brandCodes: brandCodesForSent,
      };
      await updateDoc(invoiceRef, updates);
      await refreshInvoice(selectedMonth, contractMode);
      setInfo("Invoice marked as sent.");
    } catch (err) {
      console.error("Failed to mark invoice as sent", err);
      setError("Failed to mark invoice as sent. Please try again.");
    } finally {
      setMarking(false);
    }
  };

  const handleReconcile = async () => {
    if (!invoice) {
      setError("Save the invoice snapshot before reconciling.");
      return;
    }
    setReconciling(true);
    setError(null);
    setInfo(null);
    try {
      const baselineEntries =
        invoice.reconciledEntries && invoice.reconciledEntries.length > 0
          ? invoice.reconciledEntries
          : invoice.entries;
      const allowedForReconcile =
        allowedBrandSet && allowedBrandSet.size > 0 ? new Set(allowedBrandSet) : null;
      const freshRows = await fetchDeliveredRows(
        selectedMonth,
        effectiveContractModes,
        baselineEntries,
        allowedForReconcile
      );
      setAllRows(freshRows);
      setLastUpdated(new Date());

      const baselineFiltered = applyBrandFilter(
        baselineEntries,
        allowedForReconcile,
        [],
        selectedBrandCodes
      );
      const currentFiltered = applyBrandFilter(
        freshRows,
        allowedForReconcile,
        baselineEntries,
        selectedBrandCodes
      );

      const baselineMap = new Map<string, number>();
      baselineFiltered.forEach((entry) => {
        baselineMap.set(entry.brandCode || UNKNOWN_BRAND_LABEL, Number(entry.deliveredCount) || 0);
      });

      const currentMap = new Map<string, number>();
      currentFiltered.forEach((entry) => {
        currentMap.set(entry.brandCode || UNKNOWN_BRAND_LABEL, Number(entry.deliveredCount) || 0);
      });

      const brandCodes = new Set<string>([...baselineMap.keys(), ...currentMap.keys()]);
      const deltas: InvoiceDeltaRow[] = Array.from(brandCodes)
        .map((code) => {
          const snapshotCount = baselineMap.get(code) ?? 0;
          const currentCount = currentMap.get(code) ?? 0;
          return {
            brandCode: code,
            snapshotCount,
            currentCount,
            delta: currentCount - snapshotCount,
          };
        })
        .sort((a, b) => a.brandCode.localeCompare(b.brandCode));

      setReconciliationRows(deltas);

      const invoiceRef = doc(db, "invoices", invoiceDocId(selectedMonth, contractMode));
      await updateDoc(invoiceRef, {
        status: "reconciled",
        reconciledAt: serverTimestamp(),
        reconciledBy: userLabel(),
        reconciledEntries: currentFiltered,
        entries: currentFiltered,
        brandCodes: currentFiltered.map((entry) => entry.brandCode),
        contractMode,
      });
      await refreshInvoice(selectedMonth, contractMode);
      setInfo("Invoice reconciled with latest delivered counts.");
    } catch (err) {
      console.error("Failed to reconcile invoice", err);
      setError("Failed to reconcile the invoice. Please try again.");
    } finally {
      setReconciling(false);
    }
  };

  const handleExport = () => {
    if (!hasExportableRows) {
      setError("Save or refresh the invoice before exporting.");
      return;
    }

    setError(null);
    setInfo(null);

    const exportDate = new Date();
    const monthLabel = formatMonthLabel(selectedMonth) || selectedMonth;
    const scopeLabel =
      contractMode === "combined" ? "Briefs & Production" : CONTRACT_LABELS[contractMode];
    const filterMessage = selectedBrandDetails.length > 0
      ? `Filtered brands: ${selectedBrandDetails.map((detail) => detail.displayLabel).join(", ")}`
      : allowedBrandSet && allowedBrandSet.size > 0
        ? `Active contract filter (${scopeLabel})`
        : "All brands included";

    const totalLabel = exportableRows
      .reduce((sum, row) => sum + (Number(row.deliveredCount) || 0), 0)
      .toLocaleString();

    const rowsHtml = exportableRows
      .map((row, index) => {
        const delivered = Number(row.deliveredCount) || 0;
        const brand = row.brandCode || UNKNOWN_BRAND_LABEL;
        return `<tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(brand)}</td>
            <td style="text-align:right;">${delivered.toLocaleString()}</td>
          </tr>`;
      })
      .join("");

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Studio Tak Invoice — ${escapeHtml(monthLabel)}</title>
          <style>
            :root { color-scheme: light; }
            * { box-sizing: border-box; }
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; margin: 0; color: #111827; background: #ffffff; }
            h1 { font-size: 28px; margin: 0 0 4px 0; }
            h2 { font-size: 16px; margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
            .meta { margin: 4px 0; font-size: 14px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
            th { text-transform: uppercase; font-size: 12px; letter-spacing: 0.06em; color: #6b7280; }
            tfoot td { font-weight: 600; }
            .total { text-align: right; }
            footer { margin-top: 32px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <header>
            <h1>Studio Tak Invoice</h1>
            <p class="meta">Invoice month: ${escapeHtml(monthLabel)}</p>
            <p class="meta">Exported: ${escapeHtml(exportDate.toLocaleString())}</p>
            <p class="meta">Scope: ${escapeHtml(scopeLabel)}</p>
            <p class="meta">${escapeHtml(filterMessage)}</p>
          </header>
          <h2>Delivered Ads</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 64px;">#</th>
                <th>Brand</th>
                <th style="text-align:right;">Delivered</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="3">No delivered ads recorded for this invoice.</td></tr>'}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td>Total Delivered</td>
                <td class="total">${totalLabel}</td>
              </tr>
            </tfoot>
          </table>
          <footer>
            Generated from the Campfire admin tools · Studio Tak
          </footer>
        </body>
      </html>`;

    const exportWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!exportWindow) {
      setError("Enable pop-ups to export the invoice.");
      return;
    }

    exportWindow.document.write(html);
    exportWindow.document.close();

    try {
      exportWindow.focus();
      setTimeout(() => {
        try {
          exportWindow.print();
        } catch (err) {
          debugLog("Unable to trigger print dialog", err);
        }
      }, 300);
    } catch (err) {
      debugLog("Unable to focus export window", err);
    }

    setLastExportedAt(exportDate);
  };

  const statusBadge = invoice ? (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[invoice.status]}`}>
      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
    </span>
  ) : (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles.draft}`}>
      Draft
    </span>
  );

  const disableMarkAsSent = !invoice || invoice.status === "sent" || invoice.status === "reconciled";
  const disableReconcile = !invoice || invoice.entries.length === 0 || currentRows.length === 0;

  const renderReconciliationRows = (rows: InvoiceDeltaRow[]) => {
    if (!rows || rows.length === 0) {
      return (
        <tr>
          <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={4}>
            No differences found while reconciling this month.
          </td>
        </tr>
      );
    }

    return rows.map((row) => {
      const deltaClass =
        row.delta === 0
          ? "text-gray-500 dark:text-gray-300"
          : row.delta > 0
            ? "text-emerald-600 dark:text-emerald-300"
            : "text-rose-600 dark:text-rose-300";
      const sign = row.delta > 0 ? "+" : "";
      return (
        <tr key={row.brandCode} className="even:bg-gray-50 dark:even:bg-[var(--dark-sidebar-hover)]">
          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{row.brandCode}</td>
          <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
            {row.snapshotCount.toLocaleString()}
          </td>
          <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
            {row.currentCount.toLocaleString()}
          </td>
          <td className={`px-4 py-3 text-right text-sm font-medium ${deltaClass}`}>
            {`${sign}${row.delta.toLocaleString()}`}
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <LoadingOverlay visible={loading} text="Loading invoice data..." />
      <div className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {statusBadge}
                    <span className="hidden md:inline-block text-gray-400 dark:text-gray-500">•</span>
                    <span>
                      {contractMode === "combined"
                        ? "Brief & production contracts"
                        : `${contractModeLabel} contracts`}
                    </span>
                  </div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    Studio Tak Invoices
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Prepare condensed, export-ready invoices across briefs and production partners.
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                    {invoice?.generatedAt && (
                      <span>
                        Saved {formatTimestamp(invoice.generatedAt)}
                        {invoice?.generatedBy ? ` by ${invoice.generatedBy}` : ""}
                      </span>
                    )}
                    {invoice?.sentAt && (
                      <span>
                        · Sent {formatTimestamp(invoice.sentAt)}
                        {invoice?.sentBy ? ` by ${invoice.sentBy}` : ""}
                      </span>
                    )}
                    {invoice?.reconciledAt && (
                      <span>
                        · Reconciled {formatTimestamp(invoice.reconciledAt)}
                        {invoice?.reconciledBy ? ` by ${invoice.reconciledBy}` : ""}
                      </span>
                    )}
                    {lastUpdated && <span>· Snapshot refreshed {lastUpdated.toLocaleString()}</span>}
                    {lastExportedAt && <span>· Last export {lastExportedAt.toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button variant="accent" onClick={handleExport} disabled={!hasExportableRows}>
                    Export Invoice
                  </Button>
                  <Button variant="accent" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Snapshot"}
                  </Button>
                  <Button variant="neutral" onClick={handleMarkAsSent} disabled={disableMarkAsSent || marking}>
                    {marking ? "Marking..." : "Mark as Sent"}
                  </Button>
                  <Button
                    variant="accent"
                    onClick={handleReconcile}
                    disabled={disableReconcile || reconciling}
                    className="!border-emerald-500 !bg-emerald-500 hover:!bg-emerald-600 focus-visible:!ring-emerald-500 disabled:!bg-emerald-400"
                  >
                    {reconciling ? "Reconciling..." : "Reconcile"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Invoice month" className="text-gray-700 dark:text-gray-200">
                  <MonthSelector
                    value={selectedMonth}
                    onChange={(value) => setSelectedMonth(value)}
                    className="w-full"
                    inputClassName="w-full text-sm"
                  />
                </FormField>
                <FormField label="Contract scope" className="text-gray-700 dark:text-gray-200">
                  <select
                    value={contractMode}
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                      setContractMode(event.target.value as ContractMode);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                    <option value="combined">All contracts (briefs + production)</option>
                    <option value="production">Production only</option>
                    <option value="brief">Briefs only</option>
                  </select>
                </FormField>
                <FormField
                  label="Add brands or agencies"
                  className="text-gray-700 dark:text-gray-200 md:col-span-3"
                >
                  <select
                    value={selectionValue}
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                      const value = event.target.value;
                      setSelectionValue(value);
                      handleAddSelection(value);
                    }}
                    disabled={directoryLoading}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/20 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                    <option value="">Select a brand or agency...</option>
                    {agencySelectionOptions.length > 0 && (
                      <optgroup label="Agencies">
                        {agencySelectionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {brandOptions.length > 0 && (
                      <optgroup label="Brands">
                        {brandOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </FormField>
              </div>
              {directoryLoading && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading agencies and brands...</p>
              )}
              <div className="flex flex-wrap gap-2">
                {selectedBrandDetails.length > 0 ? (
                  selectedBrandDetails.map((detail) => {
                    const chipClass = detail.active
                      ? "border-[var(--accent-color)] bg-white text-gray-900 shadow-sm dark:border-[var(--accent-color)]/60 dark:bg-[var(--dark-sidebar-bg)] dark:text-gray-100"
                      : "border-amber-200 bg-amber-50 text-amber-800 shadow-sm dark:border-amber-400/60 dark:bg-amber-400/10 dark:text-amber-100";
                    const statusDotClass = detail.active
                      ? "bg-[var(--accent-color)]"
                      : "bg-amber-500 dark:bg-amber-300";
                    const brandNameClass = detail.active
                      ? "text-[0.75rem] font-semibold text-gray-900 dark:text-gray-100"
                      : "text-[0.75rem] font-semibold text-amber-800 dark:text-amber-100";
                    const metaClass = detail.active
                      ? "text-[0.65rem] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      : "text-[0.65rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-200/80";
                    return (
                      <span
                        key={detail.code}
                        className={`group inline-flex items-center gap-3 rounded-full border px-3 py-1.5 text-xs transition focus-within:ring-2 focus-within:ring-[var(--accent-color)]/30 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-[var(--accent-color)]/40 dark:focus-within:ring-offset-[var(--dark-sidebar)] ${chipClass}`}
                      >
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass}`} aria-hidden="true" />
                        <span className="flex flex-col leading-tight">
                          <span className={brandNameClass}>{detail.brandLabel}</span>
                          <span className={metaClass}>
                            {detail.code}
                            {detail.agencyName ? ` · ${detail.agencyName}` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBrand(detail.code)}
                          className={`ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-current transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)] ${
                            detail.active
                              ? "bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10"
                              : "bg-amber-100/70 hover:bg-amber-200/60 dark:bg-white/5 dark:hover:bg-white/10"
                          }`}
                          aria-label={`Remove ${detail.displayLabel}`}
                        >
                          <svg
                            viewBox="0 0 12 12"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 3l6 6M9 3L3 9"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="sr-only">Remove</span>
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {contractEligibleBrands.size > 0
                      ? `All active ${scopeDescription} contracts are included.`
                      : "All brands are included."}
                  </span>
                )}
              </div>
              {inactiveSelectedBrands.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200">
                  <p className="mb-0">
                    No active contracts this month for {inactiveSelectedBrands.join(", ")}.
                  </p>
                </div>
              )}
            </div>
          </section>

          {(error || info) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
                error
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/20 dark:text-rose-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-200"
              }`}
            >
              {error || info}
            </div>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Delivered Ads — {formatMonthLabel(selectedMonth)}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Snapshot for {scopeDescription} contracts covering {selectionSummaryLabel}.
                </p>
              </div>
              <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                <div>Current total: {totalDelivered.toLocaleString()}</div>
                {invoice && (
                  <>
                    <div>Saved total: {savedTotal.toLocaleString()}</div>
                    <div>
                      Delta: {deltaTotal >= 0 ? "+" : ""}
                      {deltaTotal.toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            </header>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-[var(--border-color-default)]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                <thead className="bg-gray-50 dark:bg-[var(--dark-sidebar-hover)]">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                    >
                      Brand Code
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                    >
                      Current Delivered
                    </th>
                    {invoice && (
                      <>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                        >
                          Saved Snapshot
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                        >
                          Delta
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                  {comparisonRows.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                        colSpan={invoice ? 4 : 2}
                      >
                        No delivered ads found for this selection.
                      </td>
                    </tr>
                  ) : (
                    comparisonRows.map((row) => {
                      const deltaClass =
                        row.delta === 0
                          ? "text-gray-500 dark:text-gray-300"
                          : row.delta > 0
                            ? "text-emerald-600 dark:text-emerald-300"
                            : "text-rose-600 dark:text-rose-300";
                      const sign = row.delta > 0 ? "+" : "";
                      return (
                        <tr key={row.brandCode} className="even:bg-gray-50 dark:even:bg-[var(--dark-sidebar-hover)]">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {row.brandCode}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                            {row.current.toLocaleString()}
                          </td>
                          {invoice && (
                            <>
                              <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">
                                {row.saved.toLocaleString()}
                              </td>
                              <td className={`px-4 py-3 text-right text-sm font-medium ${deltaClass}`}>
                                {`${sign}${row.delta.toLocaleString()}`}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {reconciliationRows && (
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reconciliation Results</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Latest delivered counts compared against the saved snapshot for this contract type.
                  </p>
                </div>
                {reconciliationTotals && (
                  <div className="text-right text-sm text-gray-600 dark:text-gray-300">
                    <div>Snapshot total: {reconciliationTotals.snapshotTotal.toLocaleString()}</div>
                    <div>Current total: {reconciliationTotals.currentTotal.toLocaleString()}</div>
                    <div>
                      Delta: {reconciliationTotals.deltaTotal >= 0 ? "+" : ""}
                      {reconciliationTotals.deltaTotal.toLocaleString()}
                    </div>
                  </div>
                )}
              </header>
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-[var(--border-color-default)]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                  <thead className="bg-gray-50 dark:bg-[var(--dark-sidebar-hover)]">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                      >
                        Brand Code
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                      >
                        Saved Snapshot
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                      >
                        Current Delivered
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300"
                      >
                        Delta
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                    {renderReconciliationRows(reconciliationRows)}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminInvoices;
