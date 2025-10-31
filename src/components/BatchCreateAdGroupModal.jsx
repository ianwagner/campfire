import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, addDoc, writeBatch, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FiLayers, FiPlus, FiX } from 'react-icons/fi';
import BriefStepSelect from './BriefStepSelect.jsx';
import useComponentTypes from '../useComponentTypes.js';
import { db, auth } from '../firebase/config';
import BrandCodeSelectionModal from './BrandCodeSelectionModal.jsx';
import Modal from './Modal.jsx';
import selectRandomOption from '../utils/selectRandomOption.js';

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
      selectedIds = [options[0].id];
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

  const components = useComponentTypes();

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

  const renderAttributeTagList = (attributeOptions) => {
    const validOptions = Array.isArray(attributeOptions)
      ? attributeOptions.filter((attr) => Array.isArray(attr.options) && attr.options.length > 0)
      : [];
    if (validOptions.length === 0) {
      return <div className="text-xs text-gray-600 dark:text-gray-400">—</div>;
    }
    return (
      <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400">
        {validOptions.map((attr) => (
          <div key={attr.key} className="space-y-1">
            {attr.label && (
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{attr.label}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {attr.options.map((opt, index) => (
                <span
                  key={`${attr.key}-${index}-${opt}`}
                  className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                >
                  {opt}
                </span>
              ))}
            </div>
          </div>
        ))}
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
          const components = generateRandomComponentsForRow(row);
          batch.set(doc(db, 'adGroups', groupRef.id, 'recipes', String(i)), {
            components,
            copy: '',
            assets: [],
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
    <div className="space-y-4">
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
        <div className="space-y-4">
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select brands</h3>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('recipe')}
            >
              Back
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose which brands to include in this batch by selecting their brand codes.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setBrandModalOpen(true)}
            >
              {brandCodes.length === 0 ? 'Select brands' : 'Edit selection'}
            </button>
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
            <button
              type="button"
              className="btn-primary"
              onClick={handleNextFromBrands}
              disabled={brandComputation.rows.length === 0}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Review brand details</h3>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('brands')}
            >
              Back
            </button>
          </div>
          {(loadingBrands || loadingInstances) && <p>Loading data…</p>}
          {brandComputation.rows.length === 0 ? (
            <p>No brands selected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
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
                                <div className="space-y-2 text-sm">
                                  <p className="text-gray-600 dark:text-gray-400">
                                    No products available for this brand.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => openAddProductModal(row.brand)}
                                    className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                  >
                                    <FiPlus /> Add product
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-2">
                                    {selectedOptions.length === 0 ? (
                                      <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-100">
                                        No products selected.
                                      </span>
                                    ) : (
                                      selectedOptions.map((option) => (
                                        <span
                                          key={option.id}
                                          className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-100"
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
                                    <button
                                      type="button"
                                      onClick={() => openAddProductModal(row.brand)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-gray-700 dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                                      aria-label={`Add product for ${row.brand.name || row.brand.code || 'brand'}`}
                                    >
                                      <FiPlus />
                                    </button>
                                  </div>
                                  {renderAttributeTagList(col.data.meta?.attributeOptions)}
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
                              {renderAttributeTagList(col.data.meta?.attributeOptions)}
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
                                  selectedOptions.map((option) => (
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
                                  ))
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
            <button
              type="button"
              className="btn-primary"
              onClick={handleBatchCreate}
              disabled={creating || brandComputation.rows.length === 0 || !validRecipeCount}
            >
              {creating ? 'Creating…' : 'Batch create'}
            </button>
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
              <button
                type="button"
                className="btn-secondary"
                onClick={closeProductModal}
                disabled={savingProduct}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingProduct}
              >
                {savingProduct ? 'Saving…' : 'Save product'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default BatchCreateAdGroupModal;
