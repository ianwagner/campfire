import React, { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  FiPlus,
  FiSave,
  FiPlay,
  FiSend,
  FiSearch,
  FiDownload,
} from "react-icons/fi";
import { db } from "./firebase/config";

const HTTP_METHODS = ["POST", "PUT", "PATCH", "DELETE", "GET"];
const AUTH_STRATEGIES = ["none", "api_key", "basic", "oauth2", "signed_payload"];
const AUTH_LOCATIONS = ["header", "query", "body"];

const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  initialIntervalMs: 1000,
  maxIntervalMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
};

function toIsoString(value, fallback = "") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return fallback;
}

function cloneRetryPolicy(policy = {}) {
  return {
    maxAttempts: Number(policy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts) || 0,
    initialIntervalMs:
      Number(policy.initialIntervalMs ?? DEFAULT_RETRY_POLICY.initialIntervalMs) || 0,
    maxIntervalMs: Number(policy.maxIntervalMs ?? DEFAULT_RETRY_POLICY.maxIntervalMs) || 0,
    backoffMultiplier:
      Number(policy.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier) || 0,
    jitter:
      typeof policy.jitter === "boolean"
        ? policy.jitter
        : Boolean(DEFAULT_RETRY_POLICY.jitter),
  };
}

function normalizeLatestExportAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") {
    return undefined;
  }
  return {
    ...attempt,
    startedAt: toIsoString(attempt.startedAt),
    completedAt: toIsoString(attempt.completedAt, undefined),
  };
}

function normalizeIntegration(docId, raw) {
  const now = new Date().toISOString();
  const mapping = raw?.mapping ?? {
    type: "jsonata",
    version: "1.0.0",
    expression: "",
  };

  return {
    id: raw?.id || docId,
    version: raw?.version || "1.0.0",
    name: raw?.name || "",
    slug: raw?.slug || docId,
    description: raw?.description || "",
    active: Boolean(raw?.active ?? true),
    baseUrl: raw?.baseUrl || "",
    endpointPath: raw?.endpointPath || "",
    method: raw?.method || "POST",
    timeoutMs: typeof raw?.timeoutMs === "number" ? raw.timeoutMs : undefined,
    idempotencyKeyPrefix: raw?.idempotencyKeyPrefix || "",
    auth: {
      strategy: raw?.auth?.strategy || "none",
      location: raw?.auth?.location,
      keyName: raw?.auth?.keyName || "",
      secret: raw?.auth?.secret,
      scopes: Array.isArray(raw?.auth?.scopes) ? raw.auth.scopes : undefined,
      metadata:
        raw?.auth?.metadata && typeof raw.auth.metadata === "object"
          ? raw.auth.metadata
          : undefined,
    },
    mapping: {
      type: mapping.type || "jsonata",
      version: mapping.version || "1.0.0",
      sourceUri: mapping.sourceUri || "",
      expression: mapping.expression || "",
      template: mapping.template,
      partials: mapping.partials,
      helpers: mapping.helpers,
      allowUndefined: Boolean(mapping.allowUndefined),
      delimiters: mapping.delimiters,
    },
    transformSpec:
      raw?.transformSpec === null
        ? null
        : raw?.transformSpec && typeof raw.transformSpec === "object" &&
          !Array.isArray(raw.transformSpec)
        ? raw.transformSpec
        : undefined,
    schemaRef: raw?.schemaRef ?? "",
    recipeTypeId:
      typeof raw?.recipeTypeId === "string"
        ? raw.recipeTypeId
        : raw?.recipeTypeId
        ? String(raw.recipeTypeId)
        : "",
    retryPolicy: cloneRetryPolicy(raw?.retryPolicy),
    headers:
      raw?.headers && typeof raw.headers === "object"
        ? Object.fromEntries(
            Object.entries(raw.headers).map(([key, value]) => [key, String(value)])
          )
        : {},
    latestExportAttempt: normalizeLatestExportAttempt(raw?.latestExportAttempt),
    createdAt: toIsoString(raw?.createdAt, now),
    updatedAt: toIsoString(raw?.updatedAt, now),
  };
}

function createNewIntegration() {
  const now = new Date().toISOString();
  return {
    id: "",
    version: "1.0.0",
    name: "",
    slug: "",
    description: "",
    active: true,
    baseUrl: "",
    endpointPath: "",
    method: "POST",
    timeoutMs: 30000,
    idempotencyKeyPrefix: "",
    auth: {
      strategy: "none",
      location: "header",
      keyName: "",
      secret: undefined,
      scopes: undefined,
      metadata: undefined,
    },
    mapping: {
      type: "jsonata",
      version: "1.0.0",
      sourceUri: "",
      expression: "",
      allowUndefined: false,
    },
    transformSpec: null,
    schemaRef: "",
    recipeTypeId: "",
    retryPolicy: { ...DEFAULT_RETRY_POLICY },
    headers: {},
    latestExportAttempt: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function rowsFromHeaders(headers = {}) {
  const entries = Object.entries(headers).filter(([key]) => key);
  if (entries.length === 0) {
    return [{ key: "", value: "" }];
  }
  return [...entries.map(([key, value]) => ({ key, value })), { key: "", value: "" }];
}

function rowsToHeaders(rows) {
  const result = {};
  rows.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    result[trimmedKey] = value ?? "";
  });
  return result;
}

function pruneUndefined(value) {
  if (Array.isArray(value)) {
    const pruned = value.map(pruneUndefined).filter((item) => item !== undefined);
    return pruned.length ? pruned : undefined;
  }
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      const pruned = pruneUndefined(val);
      if (pruned !== undefined) {
        result[key] = pruned;
      }
    });
    return Object.keys(result).length ? result : undefined;
  }
  return value === undefined ? undefined : value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildIntegrationPayload(form, headerRows) {
  const now = new Date().toISOString();
  const headers = rowsToHeaders(headerRows);
  const authSecretName = form.auth?.secret?.name?.trim();
  const authSecretVersion = form.auth?.secret?.version?.trim();
  const recipeTypeId = form.recipeTypeId?.trim();

  const payload = {
    id: form.id.trim(),
    version: form.version?.trim() || "1.0.0",
    name: form.name.trim(),
    slug: form.slug?.trim() || form.id.trim(),
    description: form.description?.trim() || "",
    active: Boolean(form.active),
    baseUrl: form.baseUrl.trim(),
    endpointPath: form.endpointPath.trim(),
    method: form.method || "POST",
    timeoutMs:
      form.timeoutMs && Number(form.timeoutMs) > 0
        ? Number(form.timeoutMs)
        : undefined,
    idempotencyKeyPrefix: form.idempotencyKeyPrefix?.trim() || undefined,
    auth: {
      strategy: form.auth?.strategy || "none",
      location: form.auth?.location || undefined,
      keyName: form.auth?.keyName?.trim() || undefined,
      secret: authSecretName
        ? {
            name: authSecretName,
            ...(authSecretVersion ? { version: authSecretVersion } : {}),
          }
        : undefined,
      scopes:
        form.auth?.scopes && form.auth.scopes.length ? [...form.auth.scopes] : undefined,
      metadata:
        form.auth?.metadata && Object.keys(form.auth.metadata).length
          ? form.auth.metadata
          : undefined,
    },
    mapping: form.mapping,
    transformSpec:
      form.transformSpec === null
        ? null
        : form.transformSpec && typeof form.transformSpec === "object"
        ? form.transformSpec
        : undefined,
    schemaRef: form.schemaRef?.trim() ? form.schemaRef.trim() : null,
    recipeTypeId: recipeTypeId ? recipeTypeId : null,
    retryPolicy: {
      maxAttempts: Number(form.retryPolicy?.maxAttempts ?? 0) || 0,
      initialIntervalMs: Number(form.retryPolicy?.initialIntervalMs ?? 0) || 0,
      maxIntervalMs: Number(form.retryPolicy?.maxIntervalMs ?? 0) || 0,
      backoffMultiplier: Number(form.retryPolicy?.backoffMultiplier ?? 0) || 0,
      jitter: Boolean(form.retryPolicy?.jitter),
    },
    headers: Object.keys(headers).length ? headers : undefined,
    latestExportAttempt: form.latestExportAttempt || undefined,
    createdAt: form.createdAt || now,
    updatedAt: now,
  };

  const sanitized = pruneUndefined(payload) || {};
  sanitized.schemaRef = sanitized.schemaRef ?? null;
  return sanitized;
}

function formatRelative(date) {
  if (!date) return "Never";
  try {
    const target = new Date(date);
    if (Number.isNaN(target.getTime())) return date;
    const diffMs = Date.now() - target.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return target.toLocaleString();
  } catch (err) {
    return date;
  }
}

function formatJson(value, fallback = "") {
  if (value === undefined) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return fallback || String(value);
  }
}

const AdminIntegrations = () => {
  const [integrations, setIntegrations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [recipeTypesLoading, setRecipeTypesLoading] = useState(true);
  const [recipeTypesError, setRecipeTypesError] = useState(null);
  const [headerRows, setHeaderRows] = useState([{ key: "", value: "" }]);
  const [mappingDrafts, setMappingDrafts] = useState({
    jsonata: "",
    handlebars: "",
    literal: "{}",
  });
  const [literalError, setLiteralError] = useState(null);
  const [partialsInput, setPartialsInput] = useState("");
  const [partialsError, setPartialsError] = useState(null);
  const [helpersInput, setHelpersInput] = useState("");
  const [helpersError, setHelpersError] = useState(null);
  const [metadataInput, setMetadataInput] = useState("");
  const [metadataError, setMetadataError] = useState(null);
  const [transformSpecInput, setTransformSpecInput] = useState("");
  const [transformSpecError, setTransformSpecError] = useState(null);
  const [transformPreviewRows, setTransformPreviewRows] = useState(null);
  const [transformPreviewError, setTransformPreviewError] = useState(null);
  const [transformPreviewLoading, setTransformPreviewLoading] = useState(false);
  const [scopesInput, setScopesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [sampleReviewId, setSampleReviewId] = useState("");
  const [sampleData, setSampleData] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const loadRecipeTypes = async () => {
      try {
        const snapshot = await getDocs(collection(db, "recipeTypes"));
        if (!active) return;
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() || {}),
        }));
        items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
        setRecipeTypes(items);
        setRecipeTypesError(null);
      } catch (error) {
        if (!active) return;
        setRecipeTypes([]);
        setRecipeTypesError(
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        if (active) {
          setRecipeTypesLoading(false);
        }
      }
    };

    loadRecipeTypes();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "integrations"), (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return normalizeIntegration(docSnap.id, data);
      });
      items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setIntegrations(items);
      if (selectedId) {
        const current = items.find((item) => item.id === selectedId);
        if (current) {
          setForm(current);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedId]);

  useEffect(() => {
    if (!form) return;
    setHeaderRows(rowsFromHeaders(form.headers || {}));
    setMappingDrafts({
      jsonata: form.mapping?.type === "jsonata" ? form.mapping.expression || "" : form.mapping?.expression || "",
      handlebars: form.mapping?.type === "handlebars" ? form.mapping.template || "" : form.mapping?.template || "",
      literal: form.mapping?.type === "literal"
        ? formatJson(form.mapping.template, "{}")
        : formatJson(form.mapping?.template || {}, "{}"),
    });
    setLiteralError(null);
    setPartialsInput(
      form.mapping?.partials && Object.keys(form.mapping.partials).length
        ? JSON.stringify(form.mapping.partials, null, 2)
        : ""
    );
    setPartialsError(null);
    setHelpersInput(
      form.mapping?.helpers && Object.keys(form.mapping.helpers).length
        ? JSON.stringify(form.mapping.helpers, null, 2)
        : ""
    );
    setHelpersError(null);
    setScopesInput(Array.isArray(form.auth?.scopes) ? form.auth.scopes.join("\n") : "");
    setMetadataInput(
      form.auth?.metadata && Object.keys(form.auth.metadata).length
        ? JSON.stringify(form.auth.metadata, null, 2)
        : ""
    );
    setMetadataError(null);
    if (
      form.transformSpec &&
      typeof form.transformSpec === "object" &&
      !Array.isArray(form.transformSpec)
    ) {
      setTransformSpecInput(JSON.stringify(form.transformSpec, null, 2));
    } else {
      setTransformSpecInput("");
    }
    setTransformSpecError(null);
    setTransformPreviewRows(null);
    setTransformPreviewError(null);
    setTransformPreviewLoading(false);
  }, [form?.id]);

  useEffect(() => {
    setTransformPreviewRows(null);
    setTransformPreviewError(null);
    setTransformPreviewLoading(false);
  }, [sampleData]);

  const selectedIntegration = useMemo(() => {
    if (!selectedId) return null;
    return integrations.find((integration) => integration.id === selectedId) || null;
  }, [integrations, selectedId]);

  const handleSelectIntegration = (integration) => {
    setSelectedId(integration?.id || null);
    setForm(integration ? { ...integration } : null);
    setTestResult(null);
    setTestError(null);
    setValidationError(null);
  };

  const handleCreateNew = () => {
    const fresh = createNewIntegration();
    setSelectedId(null);
    setForm(fresh);
    setHeaderRows(rowsFromHeaders({}));
    setMappingDrafts({ jsonata: "", handlebars: "", literal: "{}" });
    setLiteralError(null);
    setPartialsInput("");
    setHelpersInput("");
    setMetadataInput("");
    setTransformSpecInput("");
    setTransformSpecError(null);
    setTransformPreviewRows(null);
    setTransformPreviewError(null);
    setTransformPreviewLoading(false);
    setScopesInput("");
    setTestResult(null);
    setTestError(null);
    setValidationError(null);
  };

  const ensureTrailingBlankRow = (rows) => {
    if (rows.length === 0 || rows[rows.length - 1].key || rows[rows.length - 1].value) {
      return [...rows, { key: "", value: "" }];
    }
    return rows;
  };

  const updateHeaderRow = (index, field, value) => {
    setHeaderRows((prev) => {
      const next = prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      );
      const trimmed = next.filter((row, idx) => idx === next.length - 1 || row.key || row.value);
      const normalized = ensureTrailingBlankRow(trimmed);
      setForm((current) =>
        current
          ? {
              ...current,
              headers: rowsToHeaders(normalized),
            }
          : current
      );
      return normalized;
    });
  };

  const removeHeaderRow = (index) => {
    setHeaderRows((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      const normalized = ensureTrailingBlankRow(next);
      setForm((current) =>
        current
          ? {
              ...current,
              headers: rowsToHeaders(normalized),
            }
          : current
      );
      return normalized;
    });
  };

  const handleMappingTypeChange = (type) => {
    if (!form) return;
    setForm((current) => {
      if (!current) return current;
      const base = {
        version: current.mapping?.version || "1.0.0",
        sourceUri: current.mapping?.sourceUri || "",
      };
      if (type === "jsonata") {
        return {
          ...current,
          mapping: {
            type,
            version: base.version,
            sourceUri: base.sourceUri,
            expression: mappingDrafts.jsonata || "",
            allowUndefined: Boolean(current.mapping?.allowUndefined),
          },
        };
      }
      if (type === "handlebars") {
        return {
          ...current,
          mapping: {
            type,
            version: base.version,
            sourceUri: base.sourceUri,
            template: mappingDrafts.handlebars || "",
            partials: current.mapping?.type === "handlebars" ? current.mapping.partials : undefined,
            helpers: current.mapping?.type === "handlebars" ? current.mapping.helpers : undefined,
          },
        };
      }
      if (type === "literal") {
        let template = {};
        try {
          template = mappingDrafts.literal ? JSON.parse(mappingDrafts.literal) : {};
          setLiteralError(null);
        } catch (error) {
          setLiteralError(
            error instanceof Error ? error.message : "Literal template must be valid JSON"
          );
          template = current.mapping?.type === "literal" ? current.mapping.template || {} : {};
        }
        return {
          ...current,
          mapping: {
            type,
            version: base.version,
            sourceUri: base.sourceUri,
            template,
            delimiters:
              current.mapping?.type === "literal" ? current.mapping.delimiters : undefined,
          },
        };
      }
      return current;
    });
  };

  const handleMappingEditorChange = (value) => {
    if (!form) return;
    const content = value ?? "";
    const type = form.mapping?.type || "jsonata";
    setMappingDrafts((prev) => ({ ...prev, [type]: content }));
    setForm((current) => {
      if (!current) return current;
      if (type === "jsonata") {
        return {
          ...current,
          mapping: {
            ...current.mapping,
            type,
            expression: content,
          },
        };
      }
      if (type === "handlebars") {
        return {
          ...current,
          mapping: {
            ...current.mapping,
            type,
            template: content,
          },
        };
      }
      if (type === "literal") {
        try {
          const parsed = content ? JSON.parse(content) : {};
          setLiteralError(null);
          return {
            ...current,
            mapping: {
              ...current.mapping,
              type,
              template: parsed,
            },
          };
        } catch (error) {
          setLiteralError(
            error instanceof Error ? error.message : "Literal template must be valid JSON"
          );
          return current;
        }
      }
      return current;
    });
  };

  const handleScopesChange = (value) => {
    setScopesInput(value);
    const scopes = value
      .split(/\r?\n|,/)
      .map((scope) => scope.trim())
      .filter(Boolean);
    setForm((current) =>
      current
        ? {
            ...current,
            auth: {
              ...current.auth,
              scopes: scopes.length ? scopes : undefined,
            },
          }
        : current
    );
  };

  const handleMetadataChange = (value) => {
    setMetadataInput(value);
    if (!value.trim()) {
      setMetadataError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              auth: { ...current.auth, metadata: undefined },
            }
          : current
      );
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Metadata must be a JSON object.");
      }
      setMetadataError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              auth: { ...current.auth, metadata: parsed },
            }
          : current
      );
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : String(error));
      setForm((current) =>
        current
          ? {
              ...current,
              auth: { ...current.auth, metadata: undefined },
            }
          : current
      );
    }
  };

  const handleTransformSpecChange = (value) => {
    setTransformSpecInput(value);
    if (!form) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setTransformSpecError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              transformSpec: null,
            }
          : current
      );
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Transform spec must be a JSON object.");
      }
      setTransformSpecError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              transformSpec: parsed,
            }
          : current
      );
    } catch (error) {
      setTransformSpecError(
        error instanceof Error ? error.message : "Transform spec must be valid JSON."
      );
      setForm((current) =>
        current
          ? {
              ...current,
              transformSpec: undefined,
            }
          : current
      );
    }
  };

  const buildTransformPreviewContext = () => {
    if (!sampleData) {
      return null;
    }

    const context = {};
    if (isPlainObject(sampleData.review)) {
      context.review = sampleData.review;
    }
    if (Array.isArray(sampleData.ads)) {
      context.ads = sampleData.ads;
    }
    if (isPlainObject(sampleData.brand)) {
      context.brand = sampleData.brand;
    }
    if (isPlainObject(sampleData.adGroup)) {
      context.adGroup = sampleData.adGroup;
    }
    if (Array.isArray(sampleData.recipes)) {
      context.recipes = sampleData.recipes;
    }
    if (isPlainObject(sampleData.client)) {
      context.client = sampleData.client;
    }
    if (isPlainObject(sampleData.recipeType)) {
      context.recipeType = sampleData.recipeType;
    }
    if (Array.isArray(sampleData.recipeFieldKeys)) {
      context.recipeFieldKeys = sampleData.recipeFieldKeys;
    }

    return context;
  };

  const runTransformPreview = async () => {
    if (!form) {
      return;
    }

    const specText = transformSpecInput.trim();
    if (!specText) {
      const message = "Transform spec cannot be empty.";
      setTransformSpecError(message);
      setTransformPreviewRows(null);
      setTransformPreviewError("Add a transform spec before previewing.");
      return;
    }

    if (transformSpecError) {
      setTransformPreviewError("Resolve transform spec errors before previewing.");
      return;
    }

    let parsedSpec;
    try {
      parsedSpec = JSON.parse(specText);
      if (!parsedSpec || typeof parsedSpec !== "object" || Array.isArray(parsedSpec)) {
        throw new Error("Transform spec must be a JSON object.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transform spec must be valid JSON.";
      setTransformSpecError(message);
      setTransformPreviewRows(null);
      setTransformPreviewError("Fix transform spec JSON before previewing.");
      return;
    }

    const context = buildTransformPreviewContext();
    if (!context) {
      setTransformPreviewRows(null);
      setTransformPreviewError("Load sample data before previewing the transform.");
      return;
    }

    setTransformPreviewLoading(true);
    setTransformPreviewError(null);
    try {
      const requestBody = {
        spec: parsedSpec,
        context,
      };
      if (isPlainObject(context.review)) {
        requestBody.review = context.review;
      }
      if (Array.isArray(context.ads)) {
        requestBody.ads = context.ads;
      }
      if (isPlainObject(context.brand)) {
        requestBody.brand = context.brand;
      }
      if (isPlainObject(context.adGroup)) {
        requestBody.adGroup = context.adGroup;
      }
      if (Array.isArray(context.recipes)) {
        requestBody.recipes = context.recipes;
      }
      const response = await fetch("/api/integrations/transform-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Transform preview failed (${response.status})`);
      }
      const data = await response.json();
      setTransformPreviewRows(Array.isArray(data.rows) ? data.rows : []);
      setTransformPreviewError(null);
    } catch (error) {
      setTransformPreviewRows(null);
      setTransformPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setTransformPreviewLoading(false);
    }
  };

  const handleDownloadTransform = () => {
    if (transformPreviewRows == null) {
      return;
    }
    try {
      const blob = new Blob([
        JSON.stringify(transformPreviewRows, null, 2),
      ], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "transform-preview.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setTransformPreviewError(
        error instanceof Error ? error.message : "Failed to download transform preview."
      );
    }
  };

  const handlePartialsChange = (value) => {
    setPartialsInput(value);
    if (!value.trim()) {
      setPartialsError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              mapping: { ...current.mapping, partials: undefined },
            }
          : current
      );
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Partials must be a JSON object of string templates.");
      }
      setPartialsError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              mapping: { ...current.mapping, partials: parsed },
            }
          : current
      );
    } catch (error) {
      setPartialsError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleHelpersChange = (value) => {
    setHelpersInput(value);
    if (!value.trim()) {
      setHelpersError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              mapping: { ...current.mapping, helpers: undefined },
            }
          : current
      );
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Helpers must be a JSON object mapping helper names to context paths.");
      }
      setHelpersError(null);
      setForm((current) =>
        current
          ? {
              ...current,
              mapping: { ...current.mapping, helpers: parsed },
            }
          : current
      );
    } catch (error) {
      setHelpersError(error instanceof Error ? error.message : String(error));
    }
  };
  const handleSave = async () => {
    if (!form) return;
    setSaveError(null);
    setValidationError(null);
    if (!form.id.trim()) {
      setValidationError("Integration ID is required.");
      return;
    }
    if (!form.name.trim()) {
      setValidationError("Integration name is required.");
      return;
    }
    if (!form.baseUrl.trim()) {
      setValidationError("Base URL is required.");
      return;
    }
    if (form.mapping?.type === "jsonata" && !(form.mapping.expression || "").trim()) {
      setValidationError("JSONata expression cannot be empty.");
      return;
    }
    if (form.mapping?.type === "handlebars" && !(form.mapping.template || "").trim()) {
      setValidationError("Handlebars template cannot be empty.");
      return;
    }
    if (form.mapping?.type === "literal" && literalError) {
      setValidationError("Resolve literal template errors before saving.");
      return;
    }
    if (partialsError || helpersError || metadataError) {
      setValidationError("Resolve JSON parsing errors before saving.");
      return;
    }
    if (transformSpecError) {
      setValidationError("Resolve transform spec JSON errors before saving.");
      return;
    }
    const payload = buildIntegrationPayload(form, headerRows);
    try {
      setSaving(true);
      await setDoc(doc(db, "integrations", payload.id), payload);
      setValidationError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadSample = async () => {
    const reviewId = sampleReviewId.trim();
    if (!reviewId) {
      setSampleError("Enter a review ID to load sample data.");
      return;
    }
    setSampleError(null);
    setSampleLoading(true);
    try {
      const response = await fetch("/api/integrations/sample-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Failed to load review ${reviewId}`);
      }
      const data = await response.json();
      setSampleData({
        review: data.review,
        ads: data.ads,
        client: data.client,
        brand: data.brand,
        adGroup: data.adGroup,
        recipes: data.recipes,
      });
      setSampleError(null);
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : String(error));
      setSampleData(null);
    } finally {
      setSampleLoading(false);
    }
  };

  const runIntegrationTest = async (mode) => {
    if (!form) return;
    const reviewId = sampleReviewId.trim();
    if (!reviewId) {
      setTestError("Enter a review ID before running tests.");
      return;
    }
    if (form.mapping?.type === "literal" && literalError) {
      setTestError("Resolve literal template JSON errors before testing.");
      return;
    }
    if (partialsError || helpersError || metadataError) {
      setTestError("Resolve JSON parsing errors before testing.");
      return;
    }
    if (transformSpecError) {
      setTestError("Resolve transform spec JSON errors before testing.");
      return;
    }
    setTestError(null);
    if (mode === "dry-run") {
      setPreviewLoading(true);
    } else {
      setLiveLoading(true);
    }
    try {
      const payload = buildIntegrationPayload(form, headerRows);
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration: payload,
          reviewId,
          mode,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Integration test failed (${response.status})`);
      }
      const data = await response.json();
      setTestResult({ mode, ...data });
      setSampleData(data.context);
      setTestError(null);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error));
      setTestResult(null);
    } finally {
      setPreviewLoading(false);
      setLiveLoading(false);
    }
  };

  const mappingLanguage = form?.mapping?.type === "literal"
    ? "json"
    : form?.mapping?.type === "handlebars"
    ? "handlebars"
    : "javascript";

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-80 w-full">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-lg font-semibold">Integrations</h2>
              <button
                type="button"
                onClick={handleCreateNew}
                className="inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
              >
                <FiPlus className="h-4 w-4" /> New
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-200">
              {integrations.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">No integrations yet.</div>
              ) : (
                integrations.map((integration) => {
                  const isActive = selectedId === integration.id;
                  const latest = integration.latestExportAttempt;
                  const statusLabel = latest
                    ? `${latest.status ?? "unknown"} • ${formatRelative(latest.completedAt || latest.startedAt)}`
                    : "Never ran";
                  return (
                    <button
                      key={integration.id}
                      type="button"
                      onClick={() => handleSelectIntegration(integration)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isActive ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900 truncate">
                            {integration.name || integration.id}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {integration.method} · {integration.baseUrl}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            integration.active
                              ? "text-emerald-600 bg-emerald-100"
                              : "text-slate-500 bg-slate-100"
                          } px-2 py-0.5 rounded-full`}
                        >
                          {integration.active ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{statusLabel}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h1 className="text-xl font-semibold">Integration Details</h1>
              <div className="flex items-center gap-2">
                {saveError && <span className="text-sm text-red-600">{saveError}</span>}
                {validationError && (
                  <span className="text-sm text-red-600">{validationError}</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!form || saving}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white ${
                    saving ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <FiSave className="h-4 w-4" />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {form ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Integration ID</label>
                    <input
                      type="text"
                      value={form.id}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, id: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      placeholder="unique-integration-id"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      placeholder="Integration name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Slug</label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, slug: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      placeholder="slug"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Recipe Type</label>
                    <select
                      value={form.recipeTypeId || ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, recipeTypeId: event.target.value }
                            : current
                        )
                      }
                      disabled={recipeTypesLoading}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="">Select a recipe type</option>
                      {recipeTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name || type.id}
                        </option>
                      ))}
                    </select>
                    {recipeTypesError && (
                      <p className="mt-1 text-xs text-red-600">{recipeTypesError}</p>
                    )}
                    {!recipeTypesLoading && !recipeTypesError && recipeTypes.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">No recipe types found.</p>
                    )}
                    {form.recipeTypeId &&
                      !recipeTypesLoading &&
                      !recipeTypesError &&
                      !recipeTypes.some((type) => type.id === form.recipeTypeId) && (
                        <p className="mt-1 text-xs text-amber-600">
                          Selected recipe type is no longer available.
                        </p>
                      )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, active: event.target.checked }))
                        }
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Enabled
                    </label>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Version</label>
                      <input
                        type="text"
                        value={form.version}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, version: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Base URL</label>
                    <input
                      type="text"
                      value={form.baseUrl}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      placeholder="https://partner.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Endpoint Path</label>
                    <input
                      type="text"
                      value={form.endpointPath}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, endpointPath: event.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      placeholder="/api/export"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Method</label>
                      <select
                        value={form.method}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, method: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      >
                        {HTTP_METHODS.map((method) => (
                          <option key={method}>{method}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Timeout (ms)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.timeoutMs ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setForm((current) => ({
                            ...current,
                            timeoutMs: value ? Number(value) : undefined,
                          }));
                        }}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Idempotency Key Prefix</label>
                    <input
                      type="text"
                      value={form.idempotencyKeyPrefix || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          idempotencyKeyPrefix: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500">Select or create an integration to begin.</div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Transform Spec</h2>
            <p className="text-sm text-slate-500 mb-4">
              Configure the partner-agnostic export schema. Each row is generated per recipe
              using dotted paths, date helpers, and image selection.
            </p>
            {form ? (
              <div>
                <textarea
                  value={transformSpecInput}
                  onChange={(event) => handleTransformSpecChange(event.target.value)}
                  className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring ${
                    transformSpecError
                      ? "border-red-500 focus:border-red-500"
                      : "border-slate-300 focus:border-blue-500"
                  }`}
                  rows={12}
                  spellCheck={false}
                  placeholder={`{
  "rows": {
    "source": "recipes",
    "fields": {
      "recipeCode": "recipe.recipeCode",
      "goLiveDate": { "path": "recipe.goLive", "format": "date" },
      "portraitUrl": { "image": "9x16" }
    }
  }
}`}
                />
                {transformSpecError && (
                  <p className="mt-2 text-xs text-red-600">{transformSpecError}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Preview results from the live review payload in the Preview &amp; Test section
                  below.
                </p>
              </div>
            ) : (
              <div className="text-slate-500">Select an integration to edit the transform spec.</div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Headers</h2>
              <div className="space-y-3">
                {headerRows.map((row, index) => {
                  const isLast = index === headerRows.length - 1;
                  return (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(event) => updateHeaderRow(index, "key", event.target.value)}
                        placeholder="Header name"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(event) => updateHeaderRow(index, "value", event.target.value)}
                        placeholder="Header value"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                      {!isLast && (
                        <button
                          type="button"
                          onClick={() => removeHeaderRow(index)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Authentication</h2>
              {form ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Strategy</label>
                      <select
                        value={form.auth?.strategy || "none"}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            auth: { ...current.auth, strategy: event.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      >
                        {AUTH_STRATEGIES.map((strategy) => (
                          <option key={strategy}>{strategy}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Location</label>
                      <select
                        value={form.auth?.location || "header"}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            auth: { ...current.auth, location: event.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      >
                        {AUTH_LOCATIONS.map((location) => (
                          <option key={location}>{location}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Key Name</label>
                    <input
                      type="text"
                      value={form.auth?.keyName || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          auth: { ...current.auth, keyName: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Secret Name</label>
                      <input
                        type="text"
                        value={form.auth?.secret?.name || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            auth: {
                              ...current.auth,
                              secret: {
                                name: event.target.value,
                                ...(current.auth?.secret?.version
                                  ? { version: current.auth.secret.version }
                                  : {}),
                              },
                            },
                          }))
                        }
                        placeholder="projects/.../secrets/..."
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Secret Version</label>
                      <input
                        type="text"
                        value={form.auth?.secret?.version || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            auth: {
                              ...current.auth,
                              secret: current.auth?.secret?.name
                                ? {
                                    name: current.auth.secret.name,
                                    version: event.target.value,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        placeholder="latest"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Scopes (one per line)</label>
                    <textarea
                      value={scopesInput}
                      onChange={(event) => handleScopesChange(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Metadata (JSON)</label>
                    <textarea
                      value={metadataInput}
                      onChange={(event) => handleMetadataChange(event.target.value)}
                      className={`mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring ${
                        metadataError ? "border-red-500 focus:border-red-500" : "border-slate-300 focus:border-blue-500"
                      }`}
                      rows={4}
                    />
                    {metadataError && (
                      <p className="mt-1 text-xs text-red-600">{metadataError}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-slate-500">Select an integration to configure authentication.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Mapping</h2>
                <p className="text-sm text-slate-500">Define how review data transforms into partner payloads.</p>
              </div>
              {form && form.mapping?.type === "jsonata" && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(form.mapping?.allowUndefined)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mapping: {
                          ...current.mapping,
                          allowUndefined: event.target.checked,
                        },
                      }))
                    }
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Allow undefined JSONata results
                </label>
              )}
            </div>
            {form ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Engine</label>
                    <select
                      value={form.mapping?.type || "jsonata"}
                      onChange={(event) => handleMappingTypeChange(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    >
                      <option value="jsonata">JSONata</option>
                      <option value="handlebars">Handlebars</option>
                      <option value="literal">Literal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Mapping Version</label>
                    <input
                      type="text"
                      value={form.mapping?.version || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          mapping: { ...current.mapping, version: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Source URI</label>
                    <input
                      type="text"
                      value={form.mapping?.sourceUri || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          mapping: { ...current.mapping, sourceUri: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                </div>
                <div>
                  <Editor
                    height="280px"
                    defaultLanguage={mappingLanguage}
                    value={mappingDrafts[form.mapping?.type || "jsonata"]}
                    onChange={handleMappingEditorChange}
                    theme="vs-light"
                    options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
                  />
                  {literalError && (
                    <p className="mt-1 text-xs text-red-600">{literalError}</p>
                  )}
                </div>
                {form.mapping?.type === "literal" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Start Delimiter</label>
                      <input
                        type="text"
                        value={form.mapping?.delimiters?.start || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            mapping: {
                              ...current.mapping,
                              delimiters: {
                                start: event.target.value,
                                end: current.mapping?.delimiters?.end || "",
                              },
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">End Delimiter</label>
                      <input
                        type="text"
                        value={form.mapping?.delimiters?.end || ""}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            mapping: {
                              ...current.mapping,
                              delimiters: {
                                start: current.mapping?.delimiters?.start || "",
                                end: event.target.value,
                              },
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                )}
                {form.mapping?.type === "handlebars" && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Partials (JSON)</label>
                      <textarea
                        value={partialsInput}
                        onChange={(event) => handlePartialsChange(event.target.value)}
                        className={`mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring ${
                          partialsError ? "border-red-500 focus:border-red-500" : "border-slate-300 focus:border-blue-500"
                        }`}
                        rows={6}
                      />
                      {partialsError && (
                        <p className="mt-1 text-xs text-red-600">{partialsError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Helpers (JSON)</label>
                      <textarea
                        value={helpersInput}
                        onChange={(event) => handleHelpersChange(event.target.value)}
                        className={`mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring ${
                          helpersError ? "border-red-500 focus:border-red-500" : "border-slate-300 focus:border-blue-500"
                        }`}
                        rows={6}
                      />
                      {helpersError && (
                        <p className="mt-1 text-xs text-red-600">{helpersError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500">Select an integration to edit mappings.</div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Retry Policy & Schema</h2>
              {form ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Max Attempts</label>
                      <input
                        type="number"
                        min={0}
                        value={form.retryPolicy?.maxAttempts ?? 0}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            retryPolicy: {
                              ...current.retryPolicy,
                              maxAttempts: Number(event.target.value || 0),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Initial Interval (ms)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.retryPolicy?.initialIntervalMs ?? 0}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            retryPolicy: {
                              ...current.retryPolicy,
                              initialIntervalMs: Number(event.target.value || 0),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Max Interval (ms)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.retryPolicy?.maxIntervalMs ?? 0}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            retryPolicy: {
                              ...current.retryPolicy,
                              maxIntervalMs: Number(event.target.value || 0),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Backoff Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={form.retryPolicy?.backoffMultiplier ?? 0}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            retryPolicy: {
                              ...current.retryPolicy,
                              backoffMultiplier: Number(event.target.value || 0),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(form.retryPolicy?.jitter)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          retryPolicy: {
                            ...current.retryPolicy,
                            jitter: event.target.checked,
                          },
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Enable jitter
                  </label>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Schema Reference</label>
                    <input
                      type="text"
                      value={form.schemaRef || ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          schemaRef: event.target.value,
                        }))
                      }
                      placeholder="firestore://schemas/..."
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-slate-500">Select an integration to configure retry policy.</div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Sample Data</h2>
              <div className="flex gap-2 mb-3">
                <div className="flex items-center border border-slate-300 rounded-md px-3 py-2 flex-1">
                  <FiSearch className="h-4 w-4 text-slate-500 mr-2" />
                  <input
                    type="text"
                    value={sampleReviewId}
                    onChange={(event) => setSampleReviewId(event.target.value)}
                    placeholder="Review ID"
                    className="flex-1 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-white bg-slate-700 hover:bg-slate-800"
                >
                  Load
                </button>
              </div>
              {sampleLoading && (
                <p className="text-xs text-slate-500 mb-2">Loading sample data…</p>
              )}
              {sampleError && <p className="text-sm text-red-600 mb-2">{sampleError}</p>}
              <div className="space-y-3 max-h-64 overflow-y-auto">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Review</h3>
                  <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {formatJson(sampleData?.review, "No review loaded.")}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Ads</h3>
                  <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {formatJson(sampleData?.ads, "[]")}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Client</h3>
                  <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {formatJson(sampleData?.client, "{}")}
                  </pre>
                </div>
                {sampleData?.recipeType && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Recipe Type</h3>
                    <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {formatJson(sampleData.recipeType, "{}")}
                    </pre>
                  </div>
                )}
                {Array.isArray(sampleData?.recipeFieldKeys) &&
                  sampleData.recipeFieldKeys.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Recipe Field Keys</h3>
                      <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                        {sampleData.recipeFieldKeys.join("\n")}
                      </pre>
                    </div>
                  )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Preview & Test</h2>
                <p className="text-sm text-slate-500">Dry-run executes mapping only. Live test dispatches with an X-Test header.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => runIntegrationTest("dry-run")}
                  disabled={previewLoading || !form}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white ${
                    previewLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <FiPlay className="h-4 w-4" />
                  {previewLoading ? "Previewing..." : "Dry Run"}
                </button>
                <button
                  type="button"
                  onClick={() => runIntegrationTest("live")}
                  disabled={liveLoading || !form}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white ${
                    liveLoading ? "bg-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  <FiSend className="h-4 w-4" />
                  {liveLoading ? "Sending..." : "Live Test"}
                </button>
              </div>
            </div>
            {testError && <p className="text-sm text-red-600 mb-3">{testError}</p>}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Transform &amp; Preview</h3>
                  <p className="text-xs text-slate-500">
                    Generate partner-agnostic rows from the loaded review snapshot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runTransformPreview}
                  disabled={transformPreviewLoading || !form || !sampleData}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white ${
                    transformPreviewLoading
                      ? "bg-indigo-400 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  <FiSearch className="h-4 w-4" />
                  {transformPreviewLoading ? "Generating..." : "Preview Transform"}
                </button>
              </div>
              {!sampleData && !sampleLoading && (
                <p className="mt-2 text-xs text-slate-500">
                  Load sample data to enable the transform preview.
                </p>
              )}
              {transformPreviewError && (
                <p className="mt-2 text-xs text-red-600">{transformPreviewError}</p>
              )}
              {transformPreviewRows !== null && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Preview Rows
                    </h4>
                    <button
                      type="button"
                      onClick={handleDownloadTransform}
                      className="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      <FiDownload className="h-3.5 w-3.5" />
                      Download JSON
                    </button>
                  </div>
                  <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {formatJson(transformPreviewRows, "[]")}
                  </pre>
                </div>
              )}
            </div>
            {testResult ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Payload Preview</h3>
                  <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                    {testResult.mapping?.preview || "No preview available."}
                  </pre>
                  {Array.isArray(testResult.mapping?.warnings) && testResult.mapping.warnings.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-amber-700">Warnings</h4>
                      <ul className="list-disc list-inside text-xs text-amber-700">
                        {testResult.mapping.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 text-xs text-slate-500">
                    Mapping duration: {Math.round(testResult.mapping?.durationMs ?? 0)}ms
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Request</h3>
                    <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {formatJson(testResult.request, "No request captured.")}
                    </pre>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Response</h3>
                    <pre className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {formatJson(testResult.dispatch, "No response captured.")}
                    </pre>
                    <div className="mt-2 text-xs text-slate-500">
                      Status: {testResult.dispatch?.status ?? "n/a"} · Duration: {Math.round(testResult.dispatch?.durationMs ?? 0)}ms
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500">Run a preview or live test to inspect payloads and responses.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminIntegrations;
