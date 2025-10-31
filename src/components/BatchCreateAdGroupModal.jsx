import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, addDoc, writeBatch, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FiLayers, FiPlus, FiX } from 'react-icons/fi';
import BriefStepSelect from './BriefStepSelect.jsx';
import useComponentTypes from '../useComponentTypes.js';
import { db, auth } from '../firebase/config';
import BrandCodeSelectionModal from './BrandCodeSelectionModal.jsx';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import selectRandomOption from '../utils/selectRandomOption.js';
import normalizeAssetType from '../utils/normalizeAssetType.js';
import parseContextTags from '../utils/parseContextTags.js';

const escapeRegExp = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const normalizeValueForDisplay = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          if (item.label) return item.label;
          if (item.name) return item.name;
          if (item.value) return item.value;
          if (item.url) return item.url;
          return JSON.stringify(item);
        }
        return String(item);
      })
      .filter((item) => item.length > 0)
      .join(', ');
  }
  if (typeof value === 'object') {
    if (value.label) return value.label;
    if (value.name) return value.name;
    if (value.value) return value.value;
    if (value.url) return value.url;
    return JSON.stringify(value);
  }
  return String(value);
};

const normalizeTextList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : normalizeValueForDisplay(item)))
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

const normalizeProductValues = (product) => {
  if (!product) return {};
  const source = product.values ? product.values : product;
  return {
    ...source,
    description: normalizeTextList(source.description),
    benefits: normalizeTextList(source.benefits),
  };
};

const similarityScore = (a, b) => {
  if (!a || !b) return 1;
  const aa = a.toString().toLowerCase();
  const bb = b.toString().toLowerCase();
  if (aa === bb) return 10;
  const setA = new Set(aa.split(/\s+/));
  const setB = new Set(bb.split(/\s+/));
  let intersection = 0;
  setA.forEach((w) => {
    if (setB.has(w)) intersection += 1;
  });
  const union = new Set([...setA, ...setB]);
  return Math.round((intersection / union.size) * 9) + 1;
};

const buildAssetLibraryMap = (sourceMap = {}, matchFields = []) => {
  const map = {};
  if (sourceMap && typeof sourceMap === 'object') {
    Object.entries(sourceMap).forEach(([key, value]) => {
      if (!value) return;
      if (typeof value === 'string') {
        map[key] = { header: value, score: 10 };
        return;
      }
      if (typeof value === 'object') {
        const header =
          (typeof value.header === 'string' && value.header) ||
          (typeof value.column === 'string' && value.column) ||
          (typeof value.field === 'string' && value.field) ||
          (typeof value.key === 'string' && value.key) ||
          '';
        const scoreValue =
          typeof value.score === 'number'
            ? value.score
            : typeof value.threshold === 'number'
              ? value.threshold
              : undefined;
        map[key] = { header };
        if (typeof scoreValue === 'number') {
          map[key].score = scoreValue;
        }
        return;
      }
      map[key] = { header: String(value), score: 10 };
    });
  }

  matchFields.forEach((field) => {
    if (!map[field]) {
      map[field] = { header: field, score: 10 };
    }
  });

  const defaults = [
    ['imageUrl', 'url'],
    ['imageName', 'name'],
    ['thumbnailUrl', 'thumbnailUrl'],
    ['context', 'description'],
    ['assetType', 'type'],
    ['product.name', 'product'],
    ['campaign.name', 'campaign'],
  ];
  defaults.forEach(([key, header]) => {
    if (!map[key]) {
      map[key] = { header };
    }
  });

  return map;
};

const getValueFromRow = (row, header) => {
  if (!row || typeof row !== 'object' || !header) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, header)) {
    return row[header];
  }
  const parts = header.split('.').filter(Boolean);
  if (parts.length <= 1) {
    return row[header];
  }
  let current = row;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
};

const collectFieldValues = (row, fieldKey, assetMap) => {
  if (!row || typeof row !== 'object') return [];
  const normalizedKey = typeof fieldKey === 'string' ? fieldKey : '';
  const lookupKeys = [
    normalizedKey,
    normalizedKey.replace(/\./g, '_'),
    normalizedKey.split('.').pop(),
    normalizedKey.replace(/\W+/g, ''),
    normalizedKey.replace(/\./g, ''),
    normalizedKey.toLowerCase(),
  ];
  const mapping = lookupKeys.reduce((acc, key) => {
    if (acc) return acc;
    if (key && assetMap[key]) return assetMap[key];
    return null;
  }, null);

  const candidates = new Set();
  const addCandidate = (candidate) => {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      candidates.add(candidate.trim());
    }
  };

  if (mapping) {
    if (typeof mapping === 'string') {
      addCandidate(mapping);
    } else if (typeof mapping === 'object') {
      addCandidate(mapping.header);
      addCandidate(mapping.column);
      addCandidate(mapping.field);
      if (Array.isArray(mapping.headers)) {
        mapping.headers.forEach(addCandidate);
      }
    }
  }

  addCandidate(normalizedKey);
  if (normalizedKey.includes('.')) {
    addCandidate(normalizedKey.replace(/\./g, '_'));
    const segments = normalizedKey.split('.');
    addCandidate(segments[segments.length - 1]);
  }

  addCandidate(normalizedKey.replace(/\W+/g, ''));
  addCandidate(normalizedKey.replace(/\./g, ''));
  addCandidate(normalizedKey.toLowerCase());

  const values = [];
  candidates.forEach((candidate) => {
    const value = getValueFromRow(row, candidate);
    if (value !== undefined) {
      values.push(value);
    }
  });
  return values;
};

const extractMappedValue = (row, fieldKey, assetMap) => {
  const values = collectFieldValues(row, fieldKey, assetMap);
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const formatted = normalizeValueForDisplay(value);
    if (formatted) return formatted;
  }
  return '';
};

const extractMappedList = (row, fieldKey, assetMap) => {
  const values = collectFieldValues(row, fieldKey, assetMap);
  const result = [];
  values.forEach((value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const formatted = normalizeValueForDisplay(item);
        if (typeof formatted === 'string' && formatted.length > 0) {
          formatted
            .split(/[;,|]/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
            .forEach((part) => result.push(part));
        }
      });
    } else if (typeof value === 'string') {
      value
        .split(/[;,|]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .forEach((part) => result.push(part));
    } else {
      const formatted = normalizeValueForDisplay(value);
      if (typeof formatted === 'string' && formatted.length > 0) {
        result.push(formatted);
      }
    }
  });
  return result;
};

const resolveAssetIdentifier = (row, assetMap, rowIndexMap = null) => {
  if (!row || typeof row !== 'object') return '';
  const candidates = [
    extractMappedValue(row, 'imageName', assetMap),
    extractMappedValue(row, 'imageUrl', assetMap),
    row.id,
    row.assetId,
    row.imageName,
    row.filename,
    row.url,
  ];
  const id = candidates.find((val) => typeof val === 'string' && val.trim().length > 0);
  if (id) return id.trim();
  if (rowIndexMap && rowIndexMap.has(row)) {
    return `asset-${rowIndexMap.get(row)}`;
  }
  return '';
};

const resolveAssetUrlFromRow = (row, assetMap) => {
  const candidates = [
    extractMappedValue(row, 'imageUrl', assetMap),
    row.adUrl,
    row.url,
    row.imageUrl,
    row.downloadUrl,
    row.downloadURL,
    row.fileUrl,
    row.firebaseUrl,
    row.cdnUrl,
  ];
  const url = candidates.find(
    (candidate) => typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim()),
  );
  return url ? url.trim() : '';
};

const resolveAssetThumbnailFromRow = (row, assetMap, fallbackUrl = '') => {
  const candidates = [
    extractMappedValue(row, 'thumbnailUrl', assetMap),
    row.thumbnailUrl,
    row.thumbnail,
    row.previewUrl,
    row.imageUrl,
    row.url,
    fallbackUrl,
  ];
  const thumbnail = candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0);
  return thumbnail || '';
};

const resolveAssetTypeFromRow = (row, assetMap) =>
  normalizeAssetType(
    extractMappedValue(row, 'assetType', assetMap) || row.assetType || row.type || '',
  );

const filterRowsByAssetType = (rowsList, typeFilter, assetMap) => {
  if (!typeFilter) return rowsList;
  const desired = normalizeAssetType(typeFilter);
  if (!desired) return rowsList;
  return rowsList.filter((row) => {
    const rowType = normalizeAssetType(
      extractMappedValue(row, 'assetType', assetMap) || row.assetType || row.type || '',
    );
    return rowType === desired;
  });
};

const doesRowMatchProduct = (row, productName, assetMap) => {
  if (!productName) return false;
  const normalizedTarget = productName.trim().toLowerCase();
  if (!normalizedTarget) return false;
  const values = [
    ...extractMappedList(row, 'product.name', assetMap),
    ...extractMappedList(row, 'product', assetMap),
  ];
  if (values.length === 0) return false;
  return values.some((val) => val.trim().toLowerCase() === normalizedTarget);
};

const buildInitialUsage = (rows, assetMap, rowIndexMap) => {
  const usage = {};
  rows.forEach((row) => {
    const id = resolveAssetIdentifier(row, assetMap, rowIndexMap);
    if (id && !(id in usage)) {
      usage[id] = 0;
    }
  });
  return usage;
};

const resolveBrandUsageKey = (row) => {
  if (!row) return 'default';
  const candidates = [row.brandCode, row.brand?.code, row.brand?.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim().toLowerCase();
    }
    if (candidate !== undefined && candidate !== null) {
      return String(candidate);
    }
  }
  return 'default';
};

const normalizeIdList = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
};

const areIdListsEqual = (a = [], b = []) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const deriveInstanceLabel = (instance, index = 0) => {
  if (!instance) return `Instance ${index + 1}`;
  return (
    instance.label ||
    instance.name ||
    instance.values?.name ||
    instance.values?.title ||
    instance.values?.label ||
    `Instance ${index + 1}`
  );
};

const extractOptionList = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const formatted = normalizeValueForDisplay(item);
        return typeof formatted === 'string' ? formatted.trim() : '';
      })
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  const formatted = normalizeValueForDisplay(value);
  return formatted ? [formatted.trim()] : [];
};

const gatherProductOptions = (component, brand, instances) => {
  const options = [];
  if (!component) return options;

  const relevant = Array.isArray(instances)
    ? instances.filter((inst) => inst.componentKey === component.key)
    : [];
  const brandSpecific = relevant.filter(
    (inst) => inst.relationships?.brandCode && inst.relationships.brandCode === brand.code,
  );
  const general = relevant.filter((inst) => !inst.relationships?.brandCode);
  const baseInstances = brandSpecific.length > 0 ? brandSpecific : general;

  baseInstances.forEach((inst, index) => {
    const values = normalizeProductValues(inst.values || {});
    const label = values.name || inst.values?.name || inst.label || `Product ${options.length + 1}`;
    options.push({
      id: inst.id ? `instance:${inst.id}` : `instance:${index}`,
      label,
      values,
      source: 'instance',
    });
  });

  const brandProducts = Array.isArray(brand?.products) ? brand.products : [];
  brandProducts.forEach((prod, index) => {
    if (prod?.archived) return;
    const values = normalizeProductValues(prod);
    const label = values.name || prod.name || `Product ${index + 1}`;
    options.push({
      id: `brand:${index}`,
      label,
      values,
      source: 'brand',
    });
  });

  return options;
};

const buildComponentData = (component, brand, instances, overrides = {}) => {
  if (!component) {
    return { display: '—', values: {}, meta: {} };
  }

  const attributes = Array.isArray(component.attributes) ? component.attributes : [];
  if (component.key === 'brand') {
    const values = {};
    const attributeOptions = attributes.map((attr) => {
      const raw = brand?.[attr.key];
      const formatted = normalizeValueForDisplay(raw);
      let options = Array.from(new Set(extractOptionList(raw)));
      if (options.length === 0 && formatted) {
        options = [formatted];
      }
      values[`${component.key}.${attr.key}`] = formatted;
      return {
        key: attr.key,
        label: attr.label,
        options,
      };
    });
    const displayParts = attributeOptions
      .filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
      .map((attr) => `${attr.label}: ${attr.options.join(', ')}`);
    return {
      display: displayParts.length > 0 ? displayParts.join('\n') : '—',
      values,
      meta: { type: 'brand', attributeOptions },
    };
  }

  if (component.key === 'product') {
    const options = overrides.productOptions || gatherProductOptions(component, brand, instances);
    if (options.length === 0) {
      return {
        display: '—',
        values: {},
        meta: { type: 'product', options: [], selectedIds: [], attributeOptions: [] },
      };
    }

    const overrideProvided = Array.isArray(overrides.selectedProductIds);
    let selectedIds = overrideProvided ? normalizeIdList(overrides.selectedProductIds) : [];
    const validIds = new Set(options.map((opt) => opt.id));
    selectedIds = selectedIds.filter((id) => validIds.has(id));

    if (!overrideProvided && selectedIds.length === 0 && options.length > 0) {
      selectedIds = options.map((opt) => opt.id);
    }

    const selectedOptions = options.filter((opt) => selectedIds.includes(opt.id));
    const primaryOption =
      selectedOptions[0] || (!overrideProvided && options.length > 0 ? options[0] : null);

    const aggregatedValues = {};
    const aggregationTargets =
      selectedOptions.length > 0
        ? selectedOptions
        : overrideProvided
        ? []
        : options;
    aggregationTargets.forEach((option) => {
      attributes.forEach((attr) => {
        const extracted = extractOptionList(option.values?.[attr.key]);
        if (extracted.length === 0) return;
        if (!aggregatedValues[attr.key]) aggregatedValues[attr.key] = new Set();
        extracted.forEach((val) => aggregatedValues[attr.key].add(val));
      });
    });

    const values = {};
    attributes.forEach((attr) => {
      values[`${component.key}.${attr.key}`] = normalizeValueForDisplay(
        primaryOption?.values?.[attr.key],
      );
    });

    const attributeOptions = attributes.map((attr) => {
      const optionsList = aggregatedValues[attr.key]
        ? Array.from(aggregatedValues[attr.key])
        : [];
      return {
        key: attr.key,
        label: attr.label,
        options: optionsList,
      };
    });

    const displayParts = attributeOptions
      .filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
      .map((attr) => `${attr.label}: ${attr.options.join('\n')}`);

    return {
      display: displayParts.length > 0 ? displayParts.join('\n\n') : '—',
      values,
      meta: { type: 'product', options, selectedIds, attributeOptions },
    };
  }

  const relevant = Array.isArray(instances)
    ? instances.filter((inst) => inst.componentKey === component.key)
    : [];
  const brandSpecific = relevant.filter(
    (inst) => inst.relationships?.brandCode && inst.relationships.brandCode === brand.code,
  );
  const effectiveInstances =
    brandSpecific.length > 0
      ? brandSpecific
      : relevant.filter((inst) => !inst.relationships?.brandCode);

  if (effectiveInstances.length === 0) {
    if (component.key === 'campaign' && Array.isArray(brand?.campaigns) && brand.campaigns.length > 0) {
      const aggregatedValues = {};
      brand.campaigns.forEach((campaign) => {
        const source = campaign.values ? campaign.values : campaign;
        attributes.forEach((attr) => {
          const extracted = extractOptionList(source[attr.key]);
          if (extracted.length === 0) return;
          if (!aggregatedValues[attr.key]) aggregatedValues[attr.key] = new Set();
          extracted.forEach((val) => aggregatedValues[attr.key].add(val));
        });
      });

      const values = {};
      const attributeOptions = attributes.map((attr) => {
        const optionsList = aggregatedValues[attr.key]
          ? Array.from(aggregatedValues[attr.key])
          : [];
        const joined = optionsList.join('\n');
        values[`${component.key}.${attr.key}`] = joined;
        return {
          key: attr.key,
          label: attr.label,
          options: optionsList,
        };
      });

      const displayParts = attributeOptions
        .filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
        .map((attr) => `${attr.label}: ${attr.options.join('\n')}`);

      return {
        display: displayParts.length > 0 ? displayParts.join('\n\n') : '—',
        values,
        meta: { type: component.key, attributeOptions, options: [], selectedIds: [] },
      };
    }

    return { display: '—', values: {}, meta: { type: component.key, attributeOptions: [], options: [], selectedIds: [] } };
  }

  const options = effectiveInstances.map((inst, index) => ({
    id: inst.id || `instance:${index}`,
    label: deriveInstanceLabel(inst, index),
    values: inst.values || {},
  }));

  const overrideProvided = Array.isArray(overrides.selectedInstanceIds);
  let selectedIds = overrideProvided ? normalizeIdList(overrides.selectedInstanceIds) : [];
  const validIds = new Set(options.map((opt) => opt.id));
  selectedIds = selectedIds.filter((id) => validIds.has(id));

  if (!overrideProvided && selectedIds.length === 0 && options.length > 0) {
    selectedIds = options.map((opt) => opt.id);
  }

  const selectedOptions = options.filter((opt) => selectedIds.includes(opt.id));
  const primaryOption =
    selectedOptions[0] || (!overrideProvided && options.length > 0 ? options[0] : null);

  const aggregatedValues = {};
  const aggregationTargets =
    selectedOptions.length > 0
      ? selectedOptions
      : overrideProvided
      ? []
      : options;
  aggregationTargets.forEach((option) => {
    attributes.forEach((attr) => {
      const extracted = extractOptionList(option.values?.[attr.key]);
      if (extracted.length === 0) return;
      if (!aggregatedValues[attr.key]) aggregatedValues[attr.key] = new Set();
      extracted.forEach((val) => aggregatedValues[attr.key].add(val));
    });
  });

  const values = {};
  const attributeOptions = attributes.map((attr) => {
    const optionsList = aggregatedValues[attr.key]
      ? Array.from(aggregatedValues[attr.key])
      : [];
    values[`${component.key}.${attr.key}`] = normalizeValueForDisplay(primaryOption?.values?.[attr.key]);
    return {
      key: attr.key,
      label: attr.label,
      options: optionsList,
    };
  });

  const displayParts = attributeOptions
    .filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
    .map((attr) => `${attr.label}: ${attr.options.join('\n')}`);

  return {
    display: displayParts.length > 0 ? displayParts.join('\n\n') : '—',
    values,
    meta: { type: component.key, attributeOptions, options, selectedIds },
  };
};

const BatchCreateAdGroupModal = ({ onClose, onCreated }) => {
  const [step, setStep] = useState('recipe');
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedRecipeTypeId, setSelectedRecipeTypeId] = useState('');
  const [brands, setBrands] = useState([]);
  const [brandCodes, setBrandCodes] = useState([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [componentInstances, setComponentInstances] = useState([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [adGroupName, setAdGroupName] = useState('');
  const [reviewType, setReviewType] = useState('2');
  const [recipeCount, setRecipeCount] = useState('1');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [productSelections, setProductSelections] = useState({});
  const [instanceSelections, setInstanceSelections] = useState({});
  const [instanceSearchTerms, setInstanceSearchTerms] = useState({});
  const [productModalBrand, setProductModalBrand] = useState(null);
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    url: '',
    description: '',
    benefits: '',
  });
  const [productModalError, setProductModalError] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [attributeModal, setAttributeModal] = useState(null);
  const [instanceModal, setInstanceModal] = useState(null);

  const components = useComponentTypes();
  const assetUsageCacheRef = useRef(new Map());

  const OPENAI_PROXY_URL = useMemo(() => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
    return projectId
      ? `https://us-central1-${projectId}.cloudfunctions.net/openaiProxy`
      : '';
  }, []);

  const stepCardClass =
    'space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-5 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-hover)]';

  useEffect(() => {
    let active = true;
    const loadTypes = async () => {
      setLoadingTypes(true);
      try {
        const snap = await getDocs(collection(db, 'recipeTypes'));
        if (!active) return;
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => t.external !== false);
        setRecipeTypes(list);
      } catch (err) {
        console.error('Failed to load recipe types', err);
        if (active) setRecipeTypes([]);
      } finally {
        if (active) setLoadingTypes(false);
      }
    };
    loadTypes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadBrands = async () => {
      setLoadingBrands(true);
      try {
        const snap = await getDocs(collection(db, 'brands'));
        if (!active) return;
        setBrands(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load brands', err);
        if (active) setBrands([]);
      } finally {
        if (active) setLoadingBrands(false);
      }
    };
    loadBrands();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadInstances = async () => {
      setLoadingInstances(true);
      try {
        const snap = await getDocs(collection(db, 'componentInstances'));
        if (!active) return;
        setComponentInstances(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load component instances', err);
        if (active) setComponentInstances([]);
      } finally {
        if (active) setLoadingInstances(false);
      }
    };
    loadInstances();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [step, selectedRecipeTypeId]);

  const componentMap = useMemo(() => {
    const map = new Map();
    components.forEach((component) => {
      if (component?.key) {
        map.set(component.key, component);
      }
    });
    return map;
  }, [components]);

  const selectedRecipeType = useMemo(
    () => recipeTypes.find((type) => type.id === selectedRecipeTypeId) || null,
    [recipeTypes, selectedRecipeTypeId],
  );

  const availableBrandCodes = useMemo(
    () =>
      brands
        .map((brand) => {
          if (typeof brand.code !== 'string') return '';
          return brand.code.trim();
        })
        .filter((code) => code.length > 0)
        .sort((a, b) => a.localeCompare(b)),
    [brands],
  );

  const selectedBrandSummaries = useMemo(
    () =>
      brandCodes.map((code) => {
        const brand = brands.find((b) => (b.code || '').toLowerCase() === code.toLowerCase());
        return {
          code,
          name: brand?.name || '',
        };
      }),
    [brandCodes, brands],
  );

  const handleBrandSelectionApply = (codes) => {
    const normalized = Array.isArray(codes)
      ? Array.from(
          new Set(
            codes
              .map((code) => (typeof code === 'string' ? code.trim() : ''))
              .filter((code) => code.length > 0),
          ),
        )
      : [];
    setBrandCodes(normalized);
    setBrandModalOpen(false);
  };

  const columnDefinitions = useMemo(() => {
    if (!selectedRecipeType) return [];
    const keys = Array.isArray(selectedRecipeType.clientFormComponents)
      ? selectedRecipeType.clientFormComponents
      : [];
    return keys.map((key) => {
      const component = componentMap.get(key);
      return {
        key,
        label: component?.label || key,
        component,
      };
    });
  }, [componentMap, selectedRecipeType]);

  const brandComputation = useMemo(() => {
    const rows = [];
    const missing = [];
    const productSelectionMap = new Map();
    const instanceSelectionMap = new Map();
    brandCodes.forEach((code) => {
      const brand = brands.find((b) => (b.code || '').toLowerCase() === code.toLowerCase());
      if (!brand) {
        missing.push(code);
        return;
      }
      const brandCodeKey = typeof brand.code === 'string' && brand.code.length > 0 ? brand.code : code;
      const brandInstanceSelections = instanceSelections[brandCodeKey] || {};
      const columns = columnDefinitions.map((col) => {
        const overrides = {};
        if (col.component?.key === 'product') {
          overrides.selectedProductIds = productSelections[brandCodeKey];
        } else if (col.component?.key && col.component.key !== 'brand') {
          overrides.selectedInstanceIds = brandInstanceSelections[col.component.key];
        }
        const data = buildComponentData(col.component, brand, componentInstances, overrides);
        if (col.component?.key === 'product') {
          productSelectionMap.set(brandCodeKey, data.meta?.selectedIds || []);
        } else if (col.component?.key && col.component.key !== 'brand') {
          let brandMap = instanceSelectionMap.get(brandCodeKey);
          if (!brandMap) {
            brandMap = new Map();
            instanceSelectionMap.set(brandCodeKey, brandMap);
          }
          brandMap.set(col.component.key, data.meta?.selectedIds || []);
        }
        return { ...col, data };
      });
      const componentValues = {};
      const componentValueOptions = {};
      columns.forEach((col) => {
        Object.assign(componentValues, col.data.values);
        const attributeOptions = Array.isArray(col.data.meta?.attributeOptions)
          ? col.data.meta.attributeOptions
          : [];
        const componentKey = col.component?.key || col.key;
        attributeOptions.forEach((attr) => {
          if (!componentKey) return;
          const attrKey = `${componentKey}.${attr.key}`;
          componentValueOptions[attrKey] = Array.isArray(attr.options) ? [...attr.options] : [];
        });
      });
      const selectedProductIds = productSelectionMap.get(brandCodeKey) || [];
      const brandInstanceMap = instanceSelectionMap.get(brandCodeKey) || new Map();
      const normalizedInstanceSelections = {};
      brandInstanceMap.forEach((ids, componentKey) => {
        normalizedInstanceSelections[componentKey] = Array.isArray(ids) ? [...ids] : [];
      });
      rows.push({
        brand,
        brandCode: brandCodeKey,
        columns,
        componentValues,
        componentValueOptions,
        selectedProductIds,
        instanceSelections: normalizedInstanceSelections,
        productSelectionExplicit: Array.isArray(productSelections[brandCodeKey]),
      });
    });
    return { rows, missing, productSelectionMap, instanceSelectionMap };
  }, [
    brandCodes,
    brands,
    columnDefinitions,
    componentInstances,
    productSelections,
    instanceSelections,
  ]);

  useEffect(() => {
    const { productSelectionMap } = brandComputation;
    if (!productSelectionMap) return;
    setProductSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      const brandCodeSet = new Set(brandCodes);
      const seenCodes = new Set();
      productSelectionMap.forEach((selectedIds, code) => {
        if (!brandCodeSet.has(code)) return;
        seenCodes.add(code);
        const normalized = normalizeIdList(selectedIds);
        if (!areIdListsEqual(next[code] || [], normalized) || next[code] === undefined) {
          next[code] = normalized;
          changed = true;
        }
      });
      Object.keys(next).forEach((code) => {
        if (!brandCodeSet.has(code) || !seenCodes.has(code)) {
          delete next[code];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [brandComputation, brandCodes]);

  useEffect(() => {
    const { instanceSelectionMap } = brandComputation;
    if (!instanceSelectionMap) return;
    setInstanceSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      const brandCodeSet = new Set(brandCodes);
      const seenCodes = new Set();
      instanceSelectionMap.forEach((componentMap, code) => {
        if (!brandCodeSet.has(code)) return;
        seenCodes.add(code);
        const current = next[code] ? { ...next[code] } : {};
        let brandChanged = false;
        const componentKeysSeen = new Set();
        componentMap.forEach((ids, componentKey) => {
          componentKeysSeen.add(componentKey);
          const normalized = normalizeIdList(ids);
          if (
            !areIdListsEqual(current[componentKey] || [], normalized) ||
            typeof current[componentKey] === 'undefined'
          ) {
            current[componentKey] = normalized;
            brandChanged = true;
          }
        });
        Object.keys(current).forEach((componentKey) => {
          if (!componentKeysSeen.has(componentKey)) {
            delete current[componentKey];
            brandChanged = true;
          }
        });
        if (brandChanged || !next[code]) {
          if (Object.keys(current).length > 0) {
            next[code] = current;
          } else if (next[code]) {
            delete next[code];
          }
          changed = brandChanged || (!next[code] && Object.keys(current).length === 0);
        }
      });
      Object.keys(next).forEach((code) => {
        if (!brandCodeSet.has(code) || !seenCodes.has(code)) {
          delete next[code];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [brandComputation, brandCodes]);

  useEffect(() => {
    if (step !== 'review' && attributeModal) {
      setAttributeModal(null);
    }
  }, [attributeModal, step]);

  const handleAddProductSelection = (brandCode, optionId) => {
    if (!brandCode || !optionId) return;
    setProductSelections((prev) => {
      const current = Array.isArray(prev[brandCode]) ? prev[brandCode] : [];
      if (current.includes(optionId)) return prev;
      return { ...prev, [brandCode]: [...current, optionId] };
    });
  };

  const handleRemoveProductSelection = (brandCode, optionId) => {
    if (!brandCode || !optionId) return;
    setProductSelections((prev) => {
      const current = Array.isArray(prev[brandCode]) ? prev[brandCode] : [];
      if (!current.includes(optionId)) return prev;
      const nextList = current.filter((id) => id !== optionId);
      return { ...prev, [brandCode]: nextList };
    });
  };

  const handleAddInstanceSelection = (brandCode, componentKey, instanceId) => {
    if (!brandCode || !componentKey || !instanceId) return;
    setInstanceSelections((prev) => {
      const brandEntry = prev[brandCode] ? { ...prev[brandCode] } : {};
      const current = Array.isArray(brandEntry[componentKey]) ? brandEntry[componentKey] : [];
      if (current.includes(instanceId)) return prev;
      const nextBrand = { ...brandEntry, [componentKey]: [...current, instanceId] };
      return { ...prev, [brandCode]: nextBrand };
    });
  };

  const handleRemoveInstanceSelection = (brandCode, componentKey, instanceId) => {
    if (!brandCode || !componentKey || !instanceId) return;
    setInstanceSelections((prev) => {
      const brandEntry = prev[brandCode];
      if (!brandEntry) return prev;
      const current = Array.isArray(brandEntry[componentKey]) ? brandEntry[componentKey] : [];
      if (!current.includes(instanceId)) return prev;
      const nextList = current.filter((id) => id !== instanceId);
      const nextBrand = { ...brandEntry, [componentKey]: nextList };
      return { ...prev, [brandCode]: nextBrand };
    });
  };

  const getInstanceSearchKey = (brandCode, componentKey) => `${brandCode}::${componentKey}`;

  const getInstanceSearchValue = (brandCode, componentKey) =>
    instanceSearchTerms[getInstanceSearchKey(brandCode, componentKey)] || '';

  const handleInstanceSearchChange = (brandCode, componentKey, value) => {
    const key = getInstanceSearchKey(brandCode, componentKey);
    setInstanceSearchTerms((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  const clearInstanceSearchValue = (brandCode, componentKey) => {
    const key = getInstanceSearchKey(brandCode, componentKey);
    setInstanceSearchTerms((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const findMatchingInstanceOption = (options, inputValue) => {
    const trimmed = (inputValue || '').trim().toLowerCase();
    if (!trimmed) return null;
    const normalizedOptions = Array.isArray(options) ? options : [];
    const exact = normalizedOptions.find((opt) => {
      const label = (opt.label || opt.id || '').toLowerCase();
      return label === trimmed;
    });
    if (exact) return exact;
    const partialMatches = normalizedOptions.filter((opt) => {
      const label = (opt.label || opt.id || '').toLowerCase();
      return label.includes(trimmed);
    });
    if (partialMatches.length === 1) return partialMatches[0];
    return null;
  };

  const handleInstanceInputCommit = (brandCode, componentKey, options, inputValue) => {
    if (!brandCode || !componentKey) return;
    const match = findMatchingInstanceOption(options, inputValue);
    if (match) {
      handleAddInstanceSelection(brandCode, componentKey, match.id);
    }
    clearInstanceSearchValue(brandCode, componentKey);
  };

  const openAddProductModal = (brand) => {
    if (!brand) return;
    setProductModalBrand(brand);
    setNewProductForm({ name: '', url: '', description: '', benefits: '' });
    setProductModalError('');
  };

  const closeProductModal = () => {
    if (savingProduct) return;
    setProductModalBrand(null);
    setProductModalError('');
  };

  const handleProductFieldChange = (field, value) => {
    setNewProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveNewProduct = async (event) => {
    event?.preventDefault();
    const brand = productModalBrand;
    if (!brand) return;
    const brandCodeKey = typeof brand.code === 'string' && brand.code.length > 0 ? brand.code : '';
    const name = newProductForm.name.trim();
    if (!name) {
      setProductModalError('Enter a product name.');
      return;
    }

    setProductModalError('');
    setSavingProduct(true);
    try {
      const descriptionList = normalizeTextList(newProductForm.description);
      const benefitsList = normalizeTextList(newProductForm.benefits);
      const url = newProductForm.url.trim();

      const existingProducts = Array.isArray(brand.products)
        ? brand.products
            .filter((prod) => !prod?.archived)
            .map((prod) => {
              const values = normalizeProductValues(prod);
              return {
                name: values.name || '',
                url: values.url || '',
                description: normalizeTextList(values.description),
                benefits: normalizeTextList(values.benefits),
                images: Array.isArray(values.images) ? values.images : [],
                featuredImage: values.featuredImage || '',
              };
            })
        : [];

      const newProduct = {
        name,
        url,
        description: descriptionList,
        benefits: benefitsList,
        images: [],
        featuredImage: '',
      };

      const updatedProducts = [...existingProducts, newProduct];
      await setDoc(doc(db, 'brands', brand.id), { products: updatedProducts }, { merge: true });
      setBrands((prev) =>
        prev.map((b) => (b.id === brand.id ? { ...b, products: updatedProducts } : b)),
      );
      if (brandCodeKey) {
        const newProductId = `brand:${updatedProducts.length - 1}`;
        setProductSelections((prev) => {
          const current = Array.isArray(prev[brandCodeKey]) ? prev[brandCodeKey] : [];
          if (current.includes(newProductId)) return prev;
          return { ...prev, [brandCodeKey]: [...current, newProductId] };
        });
      }
      setSuccess(`Added product "${name}" for ${brandCodeKey || 'brand'}.`);
      setProductModalBrand(null);
      setNewProductForm({ name: '', url: '', description: '', benefits: '' });
    } catch (err) {
      console.error('Failed to save product', err);
      setProductModalError('Failed to save product. Please try again.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleNextFromBrands = () => {
    if (!selectedRecipeType) {
      setError('Select a recipe type before continuing.');
      return;
    }
    if (brandComputation.rows.length === 0) {
      setError('Add at least one brand to continue.');
      return;
    }
    setError('');
    setStep('review');
  };

  const parsedRecipeCount = Number.parseInt(recipeCount, 10);
  const validRecipeCount = !Number.isNaN(parsedRecipeCount) && parsedRecipeCount > 0;

  const renderAttributeTagList = (attributeOptions, columnLabel = '', brandLabel = '') => {
    const validOptions = Array.isArray(attributeOptions)
      ? attributeOptions.filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
      : [];
    if (validOptions.length === 0) {
      return <div className="text-xs text-gray-600 dark:text-gray-400">—</div>;
    }
    return (
      <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400">
        {validOptions.map((attr) => {
          const options = Array.isArray(attr.options) ? attr.options : [];
          const normalizedOptions = options.map((opt) => {
            if (typeof opt === 'string') return opt;
            const formatted = normalizeValueForDisplay(opt);
            return typeof formatted === 'string' ? formatted : String(formatted);
          });
          const visibleOptions = normalizedOptions.slice(0, 6);
          const remainingCount = normalizedOptions.length - visibleOptions.length;
          const modalTitleParts = [brandLabel, columnLabel, attr.label].filter(Boolean);
          const modalTitle = modalTitleParts.join(' • ');
          return (
            <div key={attr.key} className="space-y-1">
              {attr.label && (
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{attr.label}</div>
              )}
              <div className="flex flex-wrap gap-1">
                {visibleOptions.map((opt, index) => (
                  <span
                    key={`${attr.key}-${index}-${opt}`}
                    className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                  >
                    {opt}
                  </span>
                ))}
                {remainingCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setAttributeModal({
                        title: modalTitle || 'Details',
                        options: normalizedOptions,
                      })
                    }
                    className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 shadow-sm transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                    +{remainingCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const generateRandomComponentsForRow = (row) => {
    const componentsData = {};
    if (!row || !Array.isArray(row.columns)) return componentsData;

    row.columns.forEach((col) => {
      const component = col.component;
      if (!component || !Array.isArray(component.attributes)) return;
      const componentKey = component.key;
      if (!componentKey) return;

      if (componentKey === 'product') {
        const options = Array.isArray(col.data.meta?.options) ? col.data.meta.options : [];
        const selectedProductIds = Array.isArray(row.selectedProductIds)
          ? row.selectedProductIds
          : [];
        const overrideExplicit = row.productSelectionExplicit;
        let availableOptions = options;
        if (selectedProductIds.length > 0) {
          const filtered = options.filter((opt) => selectedProductIds.includes(opt.id));
          availableOptions = filtered.length > 0 ? filtered : options;
        } else if (overrideExplicit) {
          availableOptions = [];
        }
        const chosenOption =
          availableOptions.length > 0
            ? availableOptions[Math.floor(Math.random() * availableOptions.length)]
            : null;

        component.attributes.forEach((attr) => {
          const attrKey = `${componentKey}.${attr.key}`;
          let value = '';
          if (chosenOption) {
            const optionValue = chosenOption.values?.[attr.key];
            if (Array.isArray(optionValue)) {
              value = selectRandomOption(optionValue);
            } else {
              value = normalizeValueForDisplay(optionValue);
            }
          }

          if (!value) {
            const optionsList = row.componentValueOptions?.[attrKey];
            if (Array.isArray(optionsList) && optionsList.length > 0) {
              value = selectRandomOption(optionsList);
            }
          }

          if (!value) {
            value = row.componentValues?.[attrKey] || '';
          }

          componentsData[attrKey] = value;
        });
        return;
      }

      component.attributes.forEach((attr) => {
        const attrKey = `${componentKey}.${attr.key}`;
        let value = '';
        const optionsList = row.componentValueOptions?.[attrKey];
        if (Array.isArray(optionsList) && optionsList.length > 0) {
          value = selectRandomOption(optionsList);
        }

        if (!value && componentKey === 'brand') {
          const brandValue = row.brand?.[attr.key];
          if (Array.isArray(brandValue)) {
            const normalized = brandValue
              .map((item) => normalizeValueForDisplay(item))
              .filter((item) => typeof item === 'string' && item.length > 0);
            if (normalized.length > 0) {
              value = selectRandomOption(normalized);
            }
          } else if (brandValue) {
            value = normalizeValueForDisplay(brandValue);
          }
        }

        if (!value) {
          value = row.componentValues?.[attrKey] || '';
        }

        componentsData[attrKey] = value;
      });
    });

    return componentsData;
  };

  const buildPromptFromComponents = (row, componentsData) => {
    if (!selectedRecipeType?.gptPrompt) return '';
    let prompt = selectedRecipeType.gptPrompt || '';
    const replacements = {};
    if (row?.brand) {
      const brandName = typeof row.brand.name === 'string' ? row.brand.name : '';
      const tone = typeof row.brand.toneOfVoice === 'string' ? row.brand.toneOfVoice : '';
      const offering = typeof row.brand.offering === 'string' ? row.brand.offering : '';
      replacements['brand.name'] = brandName;
      replacements['brand.toneOfVoice'] = tone;
      replacements['brand.offering'] = offering;
    }
    replacements.brandCode = row?.brandCode || row?.brand?.code || '';
    Object.entries(componentsData).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const normalized = Array.isArray(value) ? value.join(', ') : String(value);
      replacements[key] = normalized;
    });
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${escapeRegExp(key)}}}`, 'g');
      prompt = prompt.replace(regex, value || '');
    });
    return prompt;
  };

  const buildFallbackCopy = (row, componentsData) => {
    const brandName = row?.brand?.name || row?.brandCode || 'your brand';
    const productName = componentsData['product.name'] || componentsData['campaign.name'] || 'this product';
    const tone = row?.brand?.toneOfVoice ? ` Tone: ${row.brand.toneOfVoice}.` : '';
    return `Introducing ${productName} from ${brandName}.` + tone;
  };

  const generateCopyForRow = async (row, componentsData) => {
    const prompt = buildPromptFromComponents(row, componentsData);
    if (prompt && OPENAI_PROXY_URL) {
      try {
        const response = await fetch(OPENAI_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content?.trim();
          if (text) {
            return text;
          }
        }
      } catch (err) {
        console.error('Failed to generate copy for batch recipe', err);
      }
    }
    return buildFallbackCopy(row, componentsData);
  };

  const gatherAssetCandidates = (row, componentsData) => {
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (candidate) => {
      if (!candidate?.adUrl) return;
      const key = candidate.adUrl;
      if (seen.has(key)) return;
      seen.add(key);
      const normalizedType = normalizeAssetType(candidate.assetType || candidate.type || '');
      candidates.push({
        id: candidate.id || candidate.adUrl,
        adUrl: candidate.adUrl,
        assetType: normalizedType || '',
        thumbnailUrl: candidate.thumbnailUrl || '',
      });
    };

    const assetRows = Array.isArray(row?.brand?.assetLibrary?.rows)
      ? row.brand.assetLibrary.rows
      : [];
    const resolveAssetUrl = (asset, index, prefix) => {
      if (!asset) return '';
      if (typeof asset === 'string') return asset;
      const urlCandidates = [
        asset?.adUrl,
        asset?.imageUrl,
        asset?.url,
        asset?.downloadUrl,
        asset?.downloadURL,
        asset?.fileUrl,
        asset?.firebaseUrl,
        asset?.cdnUrl,
      ];
      const resolved = urlCandidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0);
      if (resolved) return resolved;
      if (typeof asset?.source === 'string') return asset.source;
      return prefix ? `${prefix}-${index}` : '';
    };
    assetRows.forEach((asset, index) => {
      const url = resolveAssetUrl(asset, index, 'asset');
      if (!url || !/^https?:\/\//i.test(url)) return;
      pushCandidate({
        id: asset?.id || asset?.imageName || asset?.filename || resolveAssetUrl(asset, index, 'asset'),
        adUrl: url,
        assetType: asset?.assetType || asset?.type || '',
        thumbnailUrl:
          asset?.thumbnailUrl || asset?.thumbnail || asset?.previewUrl || asset?.imageUrl || asset?.url || '',
      });
    });

    const brandAssets = Array.isArray(row?.brand?.assets) ? row.brand.assets : [];
    brandAssets.forEach((asset, index) => {
      if (!asset) return;
      if (typeof asset === 'string') {
        const trimmed = asset.trim();
        if (/^https?:\/\//i.test(trimmed)) {
          pushCandidate({
            id: trimmed,
            adUrl: trimmed,
            thumbnailUrl: trimmed,
            assetType: '',
          });
        }
        return;
      }
      const url = resolveAssetUrl(asset, index, 'brand-asset');
      if (!url || !/^https?:\/\//i.test(url)) return;
      pushCandidate({
        id:
          asset.id ||
          asset.imageName ||
          asset.filename ||
          asset.assetId ||
          resolveAssetUrl(asset, index, 'brand-asset'),
        adUrl: url,
        assetType: asset.assetType || asset.type || '',
        thumbnailUrl:
          asset.thumbnailUrl ||
          asset.thumbnail ||
          asset.previewUrl ||
          asset.imageUrl ||
          asset.url ||
          url,
      });
    });

    Object.values(componentsData).forEach((value) => {
      const addUrl = (val) => {
        if (typeof val !== 'string') return;
        const trimmed = val.trim();
        if (!/^https?:\/\//i.test(trimmed)) return;
        pushCandidate({ id: trimmed, adUrl: trimmed, thumbnailUrl: trimmed, assetType: '' });
      };
      if (Array.isArray(value)) {
        value.forEach(addUrl);
      } else {
        addUrl(value);
      }
    });

    return candidates;
  };

  const determineAssetDistribution = (componentsData, candidates) => {
    const sectionCounts = {};
    Object.keys(componentsData).forEach((key) => {
      const match = key.match(/^(.+)\.(assetCount|assetNo)$/);
      if (!match) return;
      const [, sectionKey, modifier] = match;
      const rawValue = componentsData[key];
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isNaN(parsed) || parsed <= 0) return;
      if (modifier === 'assetCount') {
        sectionCounts[sectionKey] = parsed;
      } else {
        sectionCounts[sectionKey] = Math.max(sectionCounts[sectionKey] || 0, parsed);
      }
    });

    let assetCount = Object.keys(sectionCounts).length
      ? Object.values(sectionCounts).reduce((sum, cnt) => sum + cnt, 0)
      : 0;

    if (!assetCount) {
      const direct = Number.parseInt(componentsData.assetCount, 10);
      if (!Number.isNaN(direct) && direct > 0) {
        assetCount = direct;
      }
    }

    if (!assetCount && selectedRecipeType?.assetCount) {
      const normalized = Number.parseInt(selectedRecipeType.assetCount, 10);
      if (!Number.isNaN(normalized) && normalized > 0) {
        assetCount = normalized;
      }
    }

    if (!assetCount && selectedRecipeType?.defaultAssetCount) {
      const normalized = Number.parseInt(selectedRecipeType.defaultAssetCount, 10);
      if (!Number.isNaN(normalized) && normalized > 0) {
        assetCount = normalized;
      }
    }

    if (!assetCount && candidates.length > 0) {
      assetCount = Math.min(candidates.length, 1);
    }

    return { assetCount, sectionCounts };
  };

  const selectAssetsForRow = (row, componentsData) => {
    const candidates = gatherAssetCandidates(row, componentsData);
    const { assetCount, sectionCounts } = determineAssetDistribution(componentsData, candidates);
    if (assetCount <= 0) return [];

    const createPlaceholders = (count) => Array.from({ length: count }, () => ({ needAsset: true }));
    const sectionKeys = Object.keys(sectionCounts);

    const tryAssetLibrarySelection = () => {
      if (!selectedRecipeType?.enableAssetCsv) return null;
      const assetRows = Array.isArray(row?.brand?.assetLibrary?.rows)
        ? row.brand.assetLibrary.rows.filter((asset) => asset && typeof asset === 'object')
        : [];
      if (assetRows.length === 0) return null;

      const matchFields = Array.isArray(selectedRecipeType?.assetMatchFields)
        ? selectedRecipeType.assetMatchFields
        : [];
      const assetMap = buildAssetLibraryMap(row.brand?.assetLibrary?.map, matchFields);
      const rowIndexMap = new WeakMap();
      assetRows.forEach((asset, index) => {
        if (asset && typeof asset === 'object') {
          rowIndexMap.set(asset, index);
        }
      });

      const brandKey = resolveBrandUsageKey(row);
      if (!assetUsageCacheRef.current.has(brandKey)) {
        const initialUsage = buildInitialUsage(assetRows, assetMap, rowIndexMap);
        assetUsageCacheRef.current.set(brandKey, initialUsage);
      }

      const usageBase = assetUsageCacheRef.current.get(brandKey) || {};
      const usageCopy = { ...usageBase };

      const productSource =
        componentsData['product.name'] || componentsData['product.label'] || componentsData['campaign.name'] || '';
      const productName = normalizeValueForDisplay(productSource).trim();
      const productFilteredRows = productName
        ? assetRows.filter((asset) => doesRowMatchProduct(asset, productName, assetMap))
        : assetRows;
      const rowsForSelection = productFilteredRows.length > 0 ? productFilteredRows : assetRows;
      if (rowsForSelection.length === 0) return null;

      const matchFieldList = Array.isArray(matchFields) ? matchFields : [];

      const findBestAsset = (rowsList, usageMap, typeFilter) => {
        const rowsToEvaluate = filterRowsByAssetType(rowsList, typeFilter, assetMap);
        if (rowsToEvaluate.length === 0) return null;
        let bestScore = -Infinity;
        let bestRows = [];
        rowsToEvaluate.forEach((assetRow) => {
          let score = 0;
          matchFieldList.forEach((field) => {
            const recipeVal = componentsData[field] || '';
            if (!recipeVal) return;
            const rowVal = extractMappedValue(assetRow, field, assetMap);
            if (!rowVal) return;
            const mapping = assetMap[field] || assetMap[field.replace(/\./g, '_')] || {};
            const threshold =
              typeof mapping.score === 'number'
                ? mapping.score
                : typeof mapping.threshold === 'number'
                  ? mapping.threshold
                  : 10;
            const sim = similarityScore(recipeVal, rowVal);
            if (sim >= threshold) {
              score += 1;
            }
          });
          if (score > bestScore) {
            bestScore = score;
            bestRows = [assetRow];
          } else if (score === bestScore) {
            bestRows.push(assetRow);
          }
        });
        if (bestRows.length === 0) return null;
        let minUsage = Infinity;
        bestRows.forEach((assetRow) => {
          const assetId = resolveAssetIdentifier(assetRow, assetMap, rowIndexMap);
          const usage = usageMap[assetId] || 0;
          if (usage < minUsage) minUsage = usage;
        });
        const lowUsageRows = bestRows.filter((assetRow) => {
          const assetId = resolveAssetIdentifier(assetRow, assetMap, rowIndexMap);
          if (!assetId) return false;
          return (usageMap[assetId] || 0) === minUsage;
        });
        if (lowUsageRows.length === 0) return null;
        return lowUsageRows[Math.floor(Math.random() * lowUsageRows.length)];
      };

      const findRelatedAsset = (rowsList, contextTags, mainId, usageMap, typeFilter) => {
        if (!contextTags || contextTags.size === 0) return null;
        const rowsToEvaluate = filterRowsByAssetType(rowsList, typeFilter, assetMap);
        if (rowsToEvaluate.length === 0) return null;
        let bestScore = -Infinity;
        let bestRows = [];
        rowsToEvaluate.forEach((assetRow) => {
          const assetId = resolveAssetIdentifier(assetRow, assetMap, rowIndexMap);
          if (!assetId || assetId === mainId) return;
          const rowTags = new Set(parseContextTags(extractMappedValue(assetRow, 'context', assetMap)));
          let score = 0;
          contextTags.forEach((tag) => {
            if (rowTags.has(tag)) score += 1;
          });
          if (score > bestScore) {
            bestScore = score;
            bestRows = [assetRow];
          } else if (score === bestScore) {
            bestRows.push(assetRow);
          }
        });
        if (bestRows.length === 0) return null;
        let minUsage = Infinity;
        bestRows.forEach((assetRow) => {
          const assetId = resolveAssetIdentifier(assetRow, assetMap, rowIndexMap);
          if (!assetId) return;
          const usage = usageMap[assetId] || 0;
          if (usage < minUsage) minUsage = usage;
        });
        const lowUsageRows = bestRows.filter((assetRow) => {
          const assetId = resolveAssetIdentifier(assetRow, assetMap, rowIndexMap);
          if (!assetId) return false;
          return (usageMap[assetId] || 0) === minUsage;
        });
        if (lowUsageRows.length === 0) return null;
        return lowUsageRows[Math.floor(Math.random() * lowUsageRows.length)];
      };

      const selectAssetsWithCount = (rowsList, count, typeFilter) => {
        if (count <= 0) return [];
        const arr = [];
        const mainMatch = findBestAsset(rowsList, usageCopy, typeFilter);
        let mainId = '';
        let contextValue = '';
        if (mainMatch) {
          const url = resolveAssetUrlFromRow(mainMatch, assetMap);
          const assetId = resolveAssetIdentifier(mainMatch, assetMap, rowIndexMap);
          const thumbnail = resolveAssetThumbnailFromRow(mainMatch, assetMap, url);
          const assetType = resolveAssetTypeFromRow(mainMatch, assetMap);
          contextValue = extractMappedValue(mainMatch, 'context', assetMap);
          mainId = assetId;
          if (assetId) {
            usageCopy[assetId] = (usageCopy[assetId] || 0) + 1;
          }
          if (url) {
            arr.push({ id: assetId || url, adUrl: url, assetType, thumbnailUrl: thumbnail });
          } else {
            arr.push({ needAsset: true });
          }
        } else {
          arr.push({ needAsset: true });
        }

        const contextTags = new Set(parseContextTags(contextValue));
        for (let index = 1; index < count; index += 1) {
          const match = findRelatedAsset(rowsList, contextTags, mainId, usageCopy, typeFilter);
          if (match) {
            const url = resolveAssetUrlFromRow(match, assetMap);
            const assetId = resolveAssetIdentifier(match, assetMap, rowIndexMap);
            const thumbnail = resolveAssetThumbnailFromRow(match, assetMap, url);
            const assetType = resolveAssetTypeFromRow(match, assetMap);
            if (assetId) {
              usageCopy[assetId] = (usageCopy[assetId] || 0) + 1;
            }
            if (url) {
              arr.push({ id: assetId || url, adUrl: url, assetType, thumbnailUrl: thumbnail });
            } else {
              arr.push({ needAsset: true });
            }
          } else {
            arr.push({ needAsset: true });
          }
        }

        while (arr.length < count) {
          arr.push({ needAsset: true });
        }
        return arr;
      };

      const collected = [];
      const sectionAssets = {};
      if (sectionKeys.length > 0) {
        sectionKeys.forEach((section) => {
          const count = sectionCounts[section];
          if (!count || count <= 0) return;
          const desiredType = componentsData[`${section}.assetType`] || '';
          const assetsForSection = selectAssetsWithCount(rowsForSelection, count, desiredType);
          sectionAssets[section] = assetsForSection;
          collected.push(...assetsForSection);
        });
      } else {
        collected.push(...selectAssetsWithCount(rowsForSelection, assetCount, null));
      }

      const hasRealAsset = collected.some((asset) => asset && asset.adUrl);
      if (!hasRealAsset) return null;

      if (sectionKeys.length > 0) {
        Object.entries(sectionAssets).forEach(([section, assets]) => {
          componentsData[`${section}.assets`] = assets.map((asset) => ({ ...asset }));
        });
      }

      if (collected.length < assetCount) {
        collected.push(...createPlaceholders(assetCount - collected.length));
      }

      assetUsageCacheRef.current.set(brandKey, usageCopy);
      return collected;
    };

    const libraryAssets = tryAssetLibrarySelection();
    if (libraryAssets) {
      return libraryAssets;
    }

    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      assetType: normalizeAssetType(candidate.assetType || ''),
    }));

    const pickFromPool = (pool, count) => {
      if (count <= 0) return [];
      if (!Array.isArray(pool) || pool.length === 0) {
        return createPlaceholders(count);
      }
      const chosen = [];
      for (let index = 0; index < count; index += 1) {
        const candidate = pool[index % pool.length];
        chosen.push({ ...candidate });
      }
      return chosen;
    };

    if (normalizedCandidates.length === 0) {
      if (sectionKeys.length > 0) {
        const aggregated = [];
        sectionKeys.forEach((section) => {
          const count = sectionCounts[section];
          if (!count || count <= 0) return;
          const placeholders = createPlaceholders(count);
          componentsData[`${section}.assets`] = placeholders.map((asset) => ({ ...asset }));
          aggregated.push(...placeholders);
        });
        return aggregated.length > 0 ? aggregated : createPlaceholders(assetCount);
      }
      return createPlaceholders(assetCount);
    }

    const collectedAssets = [];
    if (sectionKeys.length > 0) {
      sectionKeys.forEach((section) => {
        const count = sectionCounts[section];
        if (!count || count <= 0) return;
        const desiredType = normalizeAssetType(componentsData[`${section}.assetType`] || '');
        let pool = normalizedCandidates;
        if (desiredType) {
          const filtered = normalizedCandidates.filter((candidate) => candidate.assetType === desiredType);
          if (filtered.length > 0) {
            pool = filtered;
          }
        }
        const selected = pickFromPool(pool, count);
        componentsData[`${section}.assets`] = selected.map((asset) => ({ ...asset }));
        collectedAssets.push(...selected);
      });
    } else {
      collectedAssets.push(...pickFromPool(normalizedCandidates, assetCount));
    }

    if (collectedAssets.length < assetCount) {
      collectedAssets.push(...createPlaceholders(assetCount - collectedAssets.length));
    }

    return collectedAssets;
  };

  const generateRecipePayloadForRow = async (row) => {
    const components = generateRandomComponentsForRow(row);
    const assets = selectAssetsForRow(row, components);
    const copy = await generateCopyForRow(row, components);
    return { components, assets, copy };
  };

  const handleBatchCreate = async () => {
    if (!selectedRecipeType) {
      setError('Select a recipe type before creating ad groups.');
      return;
    }
    if (brandComputation.rows.length === 0) {
      setError('Add at least one brand to create ad groups.');
      return;
    }
    if (!adGroupName.trim()) {
      setError('Enter a name for the ad groups.');
      return;
    }
    if (!validRecipeCount) {
      setError('Enter a positive number of recipes to create.');
      return;
    }

    setError('');
    setSuccess('');
    setCreating(true);

    try {
      for (const row of brandComputation.rows) {
        const brand = row.brand;
        const groupRef = await addDoc(collection(db, 'adGroups'), {
          name: adGroupName.trim(),
          brandCode: brand.code || '',
          status: 'new',
          uploadedBy: auth.currentUser?.uid || null,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          reviewedCount: 0,
          approvedCount: 0,
          editCount: 0,
          rejectedCount: 0,
          archivedCount: 0,
          thumbnailUrl: '',
          visibility: 'private',
          requireAuth: false,
          requirePassword: false,
          password: '',
          reviewVersion: reviewType,
          assignedIntegrationId: typeof brand.defaultIntegrationId === 'string' ? brand.defaultIntegrationId : null,
          assignedIntegrationName:
            typeof brand.defaultIntegrationName === 'string' ? brand.defaultIntegrationName : '',
        });

        const batch = writeBatch(db);
        for (let i = 1; i <= parsedRecipeCount; i += 1) {
          const { components, assets, copy } = await generateRecipePayloadForRow(row);
          batch.set(doc(db, 'adGroups', groupRef.id, 'recipes', String(i)), {
            components,
            copy,
            assets,
            type: selectedRecipeType.id,
            brandCode: brand.code || '',
            selected: false,
            creditsCharged: false,
          });
        }
        await batch.commit();
      }

      setSuccess(
        brandComputation.rows.length === 1
          ? 'Created 1 ad group successfully.'
          : `Created ${brandComputation.rows.length} ad groups successfully.`,
      );
      if (onCreated) onCreated();
      setAdGroupName('');
      setRecipeCount('1');
    } catch (err) {
      console.error('Failed to batch create ad groups', err);
      setError('Failed to batch create ad groups. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Batch Create Ad Groups</h2>
          {selectedRecipeType && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selected recipe: {selectedRecipeType.name}
            </p>
          )}
        </div>
        <FiLayers className="text-2xl text-gray-400" aria-hidden="true" />
      </div>

      {step === 'recipe' && (
        <div className={stepCardClass}>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose a recipe to use for every ad group in this batch.
          </p>
          {loadingTypes ? (
            <p>Loading recipe types…</p>
          ) : recipeTypes.length === 0 ? (
            <p>No recipe types found.</p>
          ) : (
            <BriefStepSelect
              types={recipeTypes}
              selectedType={selectedRecipeTypeId}
              setSelectedType={setSelectedRecipeTypeId}
              setStep={() => setStep('brands')}
            />
          )}
        </div>
      )}

      {step === 'brands' && (
        <div className={stepCardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select brands</h3>
            <Button type="button" variant="neutral" size="sm" onClick={() => setStep('recipe')}>
              Back
            </Button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose which brands to include in this batch by selecting their brand codes.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={() => setBrandModalOpen(true)}
            >
              {brandCodes.length === 0 ? 'Select brands' : 'Edit selection'}
            </Button>
            {loadingBrands && (
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading brands…</span>
            )}
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-700">
            {brandCodes.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No brands selected yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {selectedBrandSummaries.map(({ code, name }) => (
                  <li
                    key={code}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                    {name ? `${name} (${code})` : code}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {brandComputation.missing.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not find: {brandComputation.missing.join(', ')}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={handleNextFromBrands}
              disabled={brandComputation.rows.length === 0}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className={stepCardClass}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Review brand details</h3>
            <Button type="button" variant="neutral" size="sm" onClick={() => setStep('brands')}>
              Back
            </Button>
          </div>
          {(loadingBrands || loadingInstances) && <p>Loading data…</p>}
          {brandComputation.rows.length === 0 ? (
            <p>No brands selected.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm dark:border-gray-700">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left">
                      Brand
                    </th>
                    {columnDefinitions.map((col) => (
                      <th
                        key={col.key}
                        className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {brandComputation.rows.map((row) => (
                    <tr
                      key={row.brand.code || row.brand.id}
                      className="odd:bg-white even:bg-gray-50 dark:odd:bg-[var(--dark-bg)] dark:even:bg-[var(--dark-bg-secondary)]"
                    >
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top">
                        <div className="font-semibold">{row.brand.name || '—'}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{row.brand.code}</div>
                      </td>
                      {row.columns.map((col) => {
                        const brandCodeKey =
                          typeof row.brand.code === 'string' && row.brand.code.length > 0
                            ? row.brand.code
                            : '';
                        if (col.component?.key === 'product') {
                          const options = Array.isArray(col.data.meta?.options)
                            ? col.data.meta.options
                            : [];
                          const selectedIds = Array.isArray(col.data.meta?.selectedIds)
                            ? col.data.meta.selectedIds
                            : [];
                          const selectedOptions = options.filter((opt) => selectedIds.includes(opt.id));
                          const availableOptions = options.filter((opt) => !selectedIds.includes(opt.id));
                          return (
                            <td
                              key={col.key}
                              className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top"
                            >
                              {options.length === 0 ? (
                                <div className="space-y-3 text-sm">
                                  <p className="text-gray-600 dark:text-gray-400">
                                    No products available for this brand.
                                  </p>
                                  <Button
                                    type="button"
                                    variant="neutral"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => openAddProductModal(row.brand)}
                                  >
                                    <FiPlus /> Add product
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="flex flex-wrap gap-2">
                                    {selectedOptions.length === 0 ? (
                                      <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                                        No products selected.
                                      </span>
                                    ) : (
                                      selectedOptions.map((option) => (
                                        <span
                                          key={option.id}
                                          className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                                        >
                                          {option.label || 'Unnamed product'}
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveProductSelection(brandCodeKey, option.id)}
                                            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                                            aria-label={`Remove ${option.label || 'product'} from ${row.brand.name || row.brand.code || 'brand'}`}
                                          >
                                            <FiX />
                                          </button>
                                        </span>
                                      ))
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      defaultValue=""
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value) {
                                          handleAddProductSelection(brandCodeKey, value);
                                          e.target.value = '';
                                        }
                                      }}
                                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                    >
                                      <option value="" disabled>
                                        {availableOptions.length > 0
                                          ? 'Add product…'
                                          : 'No additional products'}
                                      </option>
                                      {availableOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.label || 'Unnamed product'}
                                        </option>
                                      ))}
                                    </select>
                                    <Button
                                      type="button"
                                      variant="neutral"
                                      size="sm"
                                      className="h-8 w-8 min-w-[2rem] p-0"
                                      onClick={() => openAddProductModal(row.brand)}
                                      aria-label={`Add product for ${row.brand.name || row.brand.code || 'brand'}`}
                                    >
                                      <FiPlus />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        }
                        const componentKey = col.component?.key || col.key;
                        if (componentKey === 'brand') {
                          return (
                            <td
                              key={col.key}
                              className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top"
                            >
                              {renderAttributeTagList(
                                col.data.meta?.attributeOptions,
                                col.label,
                                row.brand?.name || row.brandCode || 'Brand',
                              )}
                            </td>
                          );
                        }

                        const instanceOptions = Array.isArray(col.data.meta?.options)
                          ? col.data.meta.options
                          : [];
                        const selectedIds = Array.isArray(col.data.meta?.selectedIds)
                          ? col.data.meta.selectedIds
                          : [];
                        const selectedOptions = instanceOptions.filter((opt) =>
                          selectedIds.includes(opt.id),
                        );
                        const sanitizedBrandCode = String(brandCodeKey || '')
                          .replace(/[^a-zA-Z0-9_-]/g, '-')
                          .toLowerCase();
                        const datalistId = `instance-options-${sanitizedBrandCode}-${componentKey}`;
                        const searchValue = getInstanceSearchValue(brandCodeKey, componentKey);

                        const visibleInstanceOptions = selectedOptions.slice(0, 6);
                        const hiddenInstanceOptions = selectedOptions.slice(6);
                        return (
                          <td
                            key={col.key}
                            className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top"
                          >
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                {selectedOptions.length === 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                                    No instances selected.
                                  </span>
                                ) : (
                                  <>
                                    {visibleInstanceOptions.map((option) => (
                                      <span
                                        key={option.id}
                                        className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                                      >
                                        {option.label || 'Unnamed instance'}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveInstanceSelection(brandCodeKey, componentKey, option.id)
                                        }
                                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                                        aria-label={`Remove ${option.label || 'instance'} from ${row.brand.name || row.brand.code || 'brand'}`}
                                      >
                                        <FiX />
                                      </button>
                                    </span>
                                    ))}
                                    {hiddenInstanceOptions.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setInstanceModal({
                                            brandCode: brandCodeKey,
                                            componentKey,
                                            brandLabel: row.brand?.name || row.brandCode || 'Brand',
                                            componentLabel: col.label || componentKey,
                                            options: selectedOptions,
                                          })
                                        }
                                        className="inline-flex items-center rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 shadow-sm transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                      >
                                        See {hiddenInstanceOptions.length} more
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                              {instanceOptions.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      list={datalistId}
                                      value={searchValue}
                                      onChange={(e) =>
                                        handleInstanceSearchChange(brandCodeKey, componentKey, e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleInstanceInputCommit(
                                            brandCodeKey,
                                            componentKey,
                                            instanceOptions,
                                            e.target.value,
                                          );
                                        }
                                      }}
                                      placeholder="Type to add instance"
                                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleInstanceInputCommit(
                                          brandCodeKey,
                                          componentKey,
                                          instanceOptions,
                                          searchValue,
                                        )
                                      }
                                      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                      disabled={!searchValue.trim()}
                                    >
                                      Add
                                    </button>
                                  </div>
                                  <datalist id={datalistId}>
                                    {instanceOptions.map((option) => (
                                      <option key={option.id} value={option.label || option.id} />
                                    ))}
                                  </datalist>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  No instances available.
                                </p>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {brandComputation.missing.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Could not find: {brandComputation.missing.join(', ')}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium">
              <span className="mb-1 block">Ad group name</span>
              <input
                type="text"
                value={adGroupName}
                onChange={(e) => setAdGroupName(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              />
            </label>
            <label className="block text-sm font-medium">
              <span className="mb-1 block">Review type</span>
              <select
                value={reviewType}
                onChange={(e) => setReviewType(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              >
                <option value="1">Legacy</option>
                <option value="2">2.0</option>
                <option value="3">Brief</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              <span className="mb-1 block">Recipes per brand</span>
              <input
                type="number"
                min="1"
                value={recipeCount}
                onChange={(e) => setRecipeCount(e.target.value)}
                className="w-full rounded border border-gray-300 p-2 dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="accent"
              onClick={handleBatchCreate}
              disabled={creating || brandComputation.rows.length === 0 || !validRecipeCount}
            >
              {creating ? 'Creating…' : 'Batch create'}
            </Button>
          </div>
        </div>
      )}

      <BrandCodeSelectionModal
        open={brandModalOpen}
        brands={availableBrandCodes}
        selected={brandCodes}
        onApply={handleBrandSelectionApply}
        onClose={() => setBrandModalOpen(false)}
        title="Select brands"
        description="Search, sort, and select the brand codes to include in this batch."
        emptyMessage="No brand codes match your search."
        applyLabel="Use selected brands"
      />

      {attributeModal && (
        <Modal sizeClass="max-w-lg w-full">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {attributeModal.title || 'Details'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Full list of options for this column.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAttributeModal(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:hover:bg-[var(--dark-sidebar-hover)]"
                aria-label="Close details dialog"
              >
                <FiX />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {attributeModal.options.map((option, index) => (
                  <span
                    key={`${attributeModal.title || 'option'}-${index}-${option}`}
                    className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="neutral" onClick={() => setAttributeModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {instanceModal && (
        <Modal sizeClass="max-w-lg w-full">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Instances for {instanceModal.componentLabel} • {instanceModal.brandLabel}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Review the full list of selected instances for this brand.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInstanceModal(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:hover:bg-[var(--dark-sidebar-hover)]"
                aria-label="Close instance list"
              >
                <FiX />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto pr-1">
              <div className="space-y-2">
                {(Array.isArray(instanceModal.options) ? instanceModal.options : []).map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  >
                    <span>{option.label || 'Unnamed instance'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleRemoveInstanceSelection(
                          instanceModal.brandCode,
                          instanceModal.componentKey,
                          option.id,
                        );
                        setInstanceModal((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            options: Array.isArray(prev.options)
                              ? prev.options.filter((opt) => opt.id !== option.id)
                              : [],
                          };
                        });
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                      aria-label={`Remove ${option.label || 'instance'} from ${instanceModal.brandLabel}`}
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
                {(!Array.isArray(instanceModal.options) || instanceModal.options.length === 0) && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No instances selected.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="neutral" onClick={() => setInstanceModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {productModalBrand && (
        <Modal sizeClass="max-w-lg w-full">
          <form className="space-y-4" onSubmit={handleSaveNewProduct}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add product</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Save a new product for {productModalBrand.name || productModalBrand.code || 'this brand'} and use it in this batch.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:hover:bg-[var(--dark-sidebar-hover)]"
                aria-label="Close add product dialog"
              >
                <FiX />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                <span className="mb-1 block">Name</span>
                <input
                  type="text"
                  value={newProductForm.name}
                  onChange={(e) => handleProductFieldChange('name', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                <span className="mb-1 block">Product URL</span>
                <input
                  type="url"
                  value={newProductForm.url}
                  onChange={(e) => handleProductFieldChange('url', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  placeholder="https://example.com/product"
                />
              </label>
              <label className="block text-sm font-medium">
                <span className="mb-1 block">Description</span>
                <textarea
                  rows={3}
                  value={newProductForm.description}
                  onChange={(e) => handleProductFieldChange('description', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  placeholder="Enter key description details. Separate lines to create multiple entries."
                />
              </label>
              <label className="block text-sm font-medium">
                <span className="mb-1 block">Benefits</span>
                <textarea
                  rows={3}
                  value={newProductForm.benefits}
                  onChange={(e) => handleProductFieldChange('benefits', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                  placeholder="List product benefits on separate lines."
                />
              </label>
            </div>
            {productModalError && (
              <p className="text-sm text-red-600 dark:text-red-400">{productModalError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="neutral"
                onClick={closeProductModal}
                disabled={savingProduct}
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={savingProduct}>
                {savingProduct ? 'Saving…' : 'Save product'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="neutral" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
};

export default BatchCreateAdGroupModal;
