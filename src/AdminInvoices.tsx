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
import debugLog from "./utils/debugLog";

const UNKNOWN_BRAND_LABEL = "Unassigned";

type InvoiceStatus = "draft" | "sent" | "reconciled";

type InvoiceEntry = {
  brandCode: string;
  deliveredCount: number;
};

type InvoiceRecord = {
  id: string;
  monthKey: string;
  generatedAt?: Timestamp | null;
  generatedBy?: string;
  status: InvoiceStatus;
  entries: InvoiceEntry[];
  sentAt?: Timestamp | null;
  sentBy?: string;
  reconciledAt?: Timestamp | null;
  reconciledBy?: string;
  reconciledEntries?: InvoiceEntry[];
};

type InvoiceDeltaRow = {
  brandCode: string;
  snapshotCount: number;
  currentCount: number;
  delta: number;
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

const aggregateDeliveredCounts = (
  docs: QueryDocumentSnapshot<DocumentData>[],
  invoiceEntries: InvoiceEntry[] = []
): InvoiceEntry[] => {
  const totals = new Map<string, number>();

  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const brandCode = normalizeBrandCode(data.brandCode ?? data.brand_code);
    const delivered = readDeliveredCount(data);
    totals.set(brandCode, (totals.get(brandCode) ?? 0) + delivered);
  });

  invoiceEntries.forEach((entry) => {
    const brand = entry?.brandCode ? entry.brandCode : UNKNOWN_BRAND_LABEL;
    if (!totals.has(brand)) {
      totals.set(brand, 0);
    }
  });

  const aggregated = Array.from(totals.entries()).map(([brandCode, deliveredCount]) => ({
    brandCode,
    deliveredCount,
  }));

  aggregated.sort((a, b) => a.brandCode.localeCompare(b.brandCode));
  return aggregated;
};

const parseInvoiceDocument = (id: string, data: DocumentData): InvoiceRecord => {
  const rawEntries = Array.isArray(data.entries) ? data.entries : [];
  const entries: InvoiceEntry[] = rawEntries
    .map((entry) => ({
      brandCode: normalizeBrandCode(entry?.brandCode),
      deliveredCount: Number(entry?.deliveredCount ?? entry?.delivered ?? entry?.count ?? 0) || 0,
    }))
    .sort((a, b) => a.brandCode.localeCompare(b.brandCode));

  return {
    id,
    monthKey: typeof data.monthKey === "string" ? data.monthKey : id,
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
  };
};

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  reconciled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const AdminInvoices: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(new Date()));
  const [currentRows, setCurrentRows] = useState<InvoiceEntry[]>([]);
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [reconciliationRows, setReconciliationRows] = useState<InvoiceDeltaRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchInvoiceDoc = useCallback(async (monthKey: string) => {
    const invoiceRef = doc(db, "invoices", monthKey);
    const snap = await getDoc(invoiceRef);
    if (!snap.exists()) return null;
    return parseInvoiceDocument(snap.id, snap.data() as DocumentData);
  }, []);

  const fetchDeliveredRows = useCallback(
    async (monthKey: string, invoiceEntries: InvoiceEntry[] = []) => {
      const adsRef = collection(db, "ads");
      const adsQuery = query(adsRef, where("monthKey", "==", monthKey));
      const adsSnap = await getDocs(adsQuery);
      return aggregateDeliveredCounts(adsSnap.docs, invoiceEntries);
    },
    []
  );

  const loadSnapshot = useCallback(
    async (monthKey: string) => {
      const adsRef = collection(db, "ads");
      const adsQuery = query(adsRef, where("monthKey", "==", monthKey));
      const [invoiceRecord, adsSnap] = await Promise.all([
        fetchInvoiceDoc(monthKey),
        getDocs(adsQuery),
      ]);

      const deliveredRows = aggregateDeliveredCounts(
        adsSnap.docs,
        invoiceRecord?.entries ?? []
      );

      return {
        invoiceRecord,
        deliveredRows: deliveredRows.length > 0 ? deliveredRows : invoiceRecord?.entries || [],
      };
    },
    [fetchInvoiceDoc]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInfo(null);
    setReconciliationRows(null);

    loadSnapshot(selectedMonth)
      .then(({ invoiceRecord, deliveredRows }) => {
        if (!active) return;
        setInvoice(invoiceRecord);
        setCurrentRows(deliveredRows);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load invoice data", err);
        setError("Failed to load invoice data. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedMonth, loadSnapshot]);

  const totalDelivered = useMemo(
    () => currentRows.reduce((sum, row) => sum + (Number(row.deliveredCount) || 0), 0),
    [currentRows]
  );

  const savedTotal = useMemo(
    () => invoice?.entries.reduce((sum, entry) => sum + (Number(entry.deliveredCount) || 0), 0) ?? 0,
    [invoice]
  );

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
    async (monthKey: string) => {
      const refreshed = await fetchInvoiceDoc(monthKey);
      setInvoice(refreshed);
    },
    [fetchInvoiceDoc]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const freshRows = await fetchDeliveredRows(selectedMonth, invoice?.entries || []);
      setCurrentRows(freshRows);
      setLastUpdated(new Date());

      const invoiceRef = doc(db, "invoices", selectedMonth);
      const payload: Record<string, unknown> = {
        monthKey: selectedMonth,
        generatedAt: serverTimestamp(),
        generatedBy: userLabel(),
        status: invoice?.status ?? "draft",
        entries: freshRows,
      };
      await setDoc(invoiceRef, payload, { merge: true });
      await refreshInvoice(selectedMonth);
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
      const invoiceRef = doc(db, "invoices", selectedMonth);
      const updates: Record<string, unknown> = {
        status: "sent",
        sentAt: serverTimestamp(),
        sentBy: userLabel(),
      };
      await updateDoc(invoiceRef, updates);
      await refreshInvoice(selectedMonth);
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
      const freshRows = await fetchDeliveredRows(selectedMonth, baselineEntries);
      setCurrentRows(freshRows);
      setLastUpdated(new Date());

      const baseline = new Map<string, number>();
      baselineEntries.forEach((entry) => {
        const code = entry.brandCode || UNKNOWN_BRAND_LABEL;
        baseline.set(code, Number(entry.deliveredCount) || 0);
      });

      const currentMap = new Map<string, number>();
      freshRows.forEach((entry) => {
        const code = entry.brandCode || UNKNOWN_BRAND_LABEL;
        currentMap.set(code, Number(entry.deliveredCount) || 0);
      });

      const brandCodes = new Set<string>([...baseline.keys(), ...currentMap.keys()]);
      const deltas: InvoiceDeltaRow[] = Array.from(brandCodes)
        .map((code) => {
          const snapshotCount = baseline.get(code) ?? 0;
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

      const invoiceRef = doc(db, "invoices", selectedMonth);
      const updates: Record<string, unknown> = {
        status: "reconciled",
        reconciledAt: serverTimestamp(),
        reconciledBy: userLabel(),
        reconciledEntries: freshRows,
        entries: freshRows,
      };
      await updateDoc(invoiceRef, updates);
      await refreshInvoice(selectedMonth);
      setInfo("Invoice reconciled with latest delivered counts.");
    } catch (err) {
      console.error("Failed to reconcile invoice", err);
      setError("Failed to reconcile the invoice. Please try again.");
    } finally {
      setReconciling(false);
    }
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
  const disableReconcile = !invoice || invoice.entries.length === 0;

  const renderTableRows = (rows: InvoiceEntry[]) => {
    if (!rows || rows.length === 0) {
      return (
        <tr>
          <td className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400" colSpan={2}>
            No delivered ads found for this month.
          </td>
        </tr>
      );
    }

    return rows.map((row) => (
      <tr key={row.brandCode} className="even:bg-slate-50 dark:even:bg-slate-900/40">
        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{row.brandCode}</td>
        <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
          {Number(row.deliveredCount || 0).toLocaleString()}
        </td>
      </tr>
    ));
  };

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
          ? "text-slate-500 dark:text-slate-300"
          : row.delta > 0
            ? "text-emerald-600 dark:text-emerald-300"
            : "text-rose-600 dark:text-rose-300";
      const sign = row.delta > 0 ? "+" : "";
      return (
        <tr key={row.brandCode} className="even:bg-slate-50 dark:even:bg-slate-900/40">
          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{row.brandCode}</td>
          <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
            {row.snapshotCount.toLocaleString()}
          </td>
          <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
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
    <div className="relative min-h-full w-full bg-slate-50/60 p-6 dark:bg-slate-950/60">
      <LoadingOverlay visible={loading} text="Loading invoice data..." />
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-white/90 p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-slate-700 md:flex-row md:items-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Invoices</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Generate monthly invoice snapshots from delivered ad counts and reconcile updates.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</span>
                {statusBadge}
              </span>
              {invoice?.generatedAt && (
                <span>
                  Generated {formatTimestamp(invoice.generatedAt)} by {invoice.generatedBy || "Unknown"}
                </span>
              )}
              {invoice?.sentAt && (
                <span>
                  · Sent {formatTimestamp(invoice.sentAt)}{invoice?.sentBy ? ` by ${invoice.sentBy}` : ""}
                </span>
              )}
              {invoice?.reconciledAt && (
                <span>
                  · Reconciled {formatTimestamp(invoice.reconciledAt)}
                  {invoice?.reconciledBy ? ` by ${invoice.reconciledBy}` : ""}
                </span>
              )}
              {lastUpdated && (
                <span>· Snapshot refreshed {lastUpdated.toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Invoice Month
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  saving
                    ? "cursor-not-allowed bg-accent/50 text-white"
                    : "bg-accent text-white hover:bg-accent/90"
                }`}
              >
                {saving ? "Saving..." : "Save Invoice"}
              </button>
              <button
                type="button"
                onClick={handleMarkAsSent}
                disabled={disableMarkAsSent || marking}
                className={`inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus:ring-offset-slate-900 ${
                  disableMarkAsSent || marking
                    ? "cursor-not-allowed text-slate-400 dark:text-slate-500"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {marking ? "Marking..." : "Mark as Sent"}
              </button>
              <button
                type="button"
                onClick={handleReconcile}
                disabled={disableReconcile || reconciling}
                className={`inline-flex items-center justify-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                  disableReconcile || reconciling
                    ? "cursor-not-allowed bg-emerald-500/40 text-white"
                    : "bg-emerald-500 text-white hover:bg-emerald-600"
                }`}
              >
                {reconciling ? "Reconciling..." : "Reconcile Invoice"}
              </button>
            </div>
          </div>
        </div>

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

        <section className="rounded-2xl bg-white/90 p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-slate-700">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Current Delivered Counts — {formatMonthLabel(selectedMonth)}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Snapshot generated from the ads collection grouped by brand and month.
              </p>
            </div>
            <div className="text-right text-sm text-slate-600 dark:text-slate-300">
              <div>Total delivered: {totalDelivered.toLocaleString()}</div>
            </div>
          </header>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                  >
                    Brand Code
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                  >
                    Delivered Ads
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {renderTableRows(currentRows)}
              </tbody>
            </table>
          </div>
        </section>

        {invoice && (
          <section className="rounded-2xl bg-white/90 p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-slate-700">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                  Saved Snapshot — {formatMonthLabel(invoice.monthKey)}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Stored invoice data captured when the snapshot was last saved.
                </p>
              </div>
              <div className="text-right text-sm text-slate-600 dark:text-slate-300">
                <div>Total delivered: {savedTotal.toLocaleString()}</div>
              </div>
            </header>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Brand Code
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Delivered Ads
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {renderTableRows(invoice.entries)}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {reconciliationRows && (
          <section className="rounded-2xl bg-white/90 p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-slate-700">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Reconciliation Results</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Latest delivered counts compared against the saved snapshot for this month.
                </p>
              </div>
              {reconciliationTotals && (
                <div className="text-right text-sm text-slate-600 dark:text-slate-300">
                  <div>Snapshot total: {reconciliationTotals.snapshotTotal.toLocaleString()}</div>
                  <div>Current total: {reconciliationTotals.currentTotal.toLocaleString()}</div>
                  <div>
                    Delta: {reconciliationTotals.deltaTotal >= 0 ? "+" : ""}
                    {reconciliationTotals.deltaTotal.toLocaleString()}
                  </div>
                </div>
              )}
            </header>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Brand Code
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Saved Snapshot
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Current Delivered
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                    >
                      Delta
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {renderReconciliationRows(reconciliationRows)}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default AdminInvoices;
