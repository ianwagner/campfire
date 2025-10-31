import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, addDoc, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { FiLayers } from 'react-icons/fi';
import BriefStepSelect from './BriefStepSelect.jsx';
import TagInput from './TagInput.jsx';
import useComponentTypes from '../useComponentTypes.js';
import { db, auth } from '../firebase/config';

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

const mergeComponentValues = (componentKey, attributes, sourceValues) => {
  const result = {};
  if (!Array.isArray(attributes)) return result;
  attributes.forEach((attr) => {
    const raw = sourceValues[attr.key];
    const formatted = normalizeValueForDisplay(raw);
    result[`${componentKey}.${attr.key}`] = formatted;
  });
  return result;
};

const buildComponentData = (component, brand, instances) => {
  if (!component) {
    return { display: '—', values: {} };
  }

  const attributes = Array.isArray(component.attributes) ? component.attributes : [];
  if (component.key === 'brand') {
    const values = {};
    const displayParts = [];
    attributes.forEach((attr) => {
      const raw = brand?.[attr.key];
      const formatted = normalizeValueForDisplay(raw);
      values[`${component.key}.${attr.key}`] = formatted;
      if (formatted) displayParts.push(`${attr.label}: ${formatted}`);
    });
    return {
      display: displayParts.length > 0 ? displayParts.join('\n') : '—',
      values,
    };
  }

  const relevant = instances.filter((inst) => inst.componentKey === component.key);
  const brandSpecific = relevant.filter(
    (inst) => inst.relationships?.brandCode && inst.relationships.brandCode === brand.code,
  );
  const effectiveInstances = brandSpecific.length > 0 ? brandSpecific : relevant.filter((inst) => !inst.relationships?.brandCode);

  if (effectiveInstances.length === 0) {
    if (component.key === 'product' && Array.isArray(brand?.products) && brand.products.length > 0) {
      const product = brand.products[0];
      const values = mergeComponentValues(component.key, attributes, product.values || product);
      const displayParts = attributes
        .map((attr) => {
          const value = normalizeValueForDisplay((product.values || product)[attr.key]);
          return value ? `${attr.label}: ${value}` : '';
        })
        .filter(Boolean);
      return {
        display: displayParts.length > 0 ? displayParts.join('\n') : '—',
        values,
      };
    }
    if (component.key === 'campaign' && Array.isArray(brand?.campaigns) && brand.campaigns.length > 0) {
      const campaign = brand.campaigns[0];
      const values = mergeComponentValues(component.key, attributes, campaign.values || campaign);
      const displayParts = attributes
        .map((attr) => {
          const value = normalizeValueForDisplay((campaign.values || campaign)[attr.key]);
          return value ? `${attr.label}: ${value}` : '';
        })
        .filter(Boolean);
      return {
        display: displayParts.length > 0 ? displayParts.join('\n') : '—',
        values,
      };
    }
    return { display: '—', values: {} };
  }

  const aggregatedValues = {};
  effectiveInstances.forEach((inst) => {
    attributes.forEach((attr) => {
      const raw = inst.values?.[attr.key];
      const formatted = normalizeValueForDisplay(raw);
      if (!formatted) return;
      if (!aggregatedValues[attr.key]) aggregatedValues[attr.key] = new Set();
      aggregatedValues[attr.key].add(formatted);
    });
  });

  const values = {};
  const displayParts = [];
  attributes.forEach((attr) => {
    const entries = aggregatedValues[attr.key];
    const joined = entries ? Array.from(entries).join(', ') : '';
    values[`${component.key}.${attr.key}`] = joined;
    if (joined) displayParts.push(`${attr.label}: ${joined}`);
  });

  return {
    display: displayParts.length > 0 ? displayParts.join('\n') : '—',
    values,
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

  const brandSuggestions = useMemo(() => {
    const suggestions = new Set();
    brands.forEach((brand) => {
      if (brand.code) suggestions.add(brand.code);
      if (brand.name) suggestions.add(brand.name);
      if (brand.code && brand.name) suggestions.add(`${brand.code} - ${brand.name}`);
      if (brand.name && brand.code) suggestions.add(`${brand.name} (${brand.code})`);
    });
    return Array.from(suggestions);
  }, [brands]);

  const handleBrandCodesChange = (tags) => {
    const normalized = [];
    const lowerMap = new Map();
    brands.forEach((brand) => {
      if (brand.code) lowerMap.set(brand.code.toLowerCase(), brand.code);
    });
    const nameMap = new Map();
    brands.forEach((brand) => {
      if (brand.name) nameMap.set(brand.name.toLowerCase(), brand.code);
    });
    tags.forEach((tag) => {
      const trimmed = (tag || '').trim();
      if (!trimmed) return;
      const candidates = [trimmed];
      const hyphenIndex = trimmed.indexOf('-');
      if (hyphenIndex >= 0) candidates.push(trimmed.slice(0, hyphenIndex).trim());
      const parenMatch = trimmed.match(/\(([^)]+)\)$/);
      if (parenMatch) candidates.push(parenMatch[1].trim());
      let matchedCode = '';
      for (const candidate of candidates) {
        const lower = candidate.toLowerCase();
        if (lowerMap.has(lower)) {
          matchedCode = lowerMap.get(lower);
          break;
        }
        if (nameMap.has(lower)) {
          matchedCode = nameMap.get(lower);
          break;
        }
      }
      if (matchedCode && !normalized.includes(matchedCode)) {
        normalized.push(matchedCode);
      }
    });
    setBrandCodes(normalized);
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
    brandCodes.forEach((code) => {
      const brand = brands.find((b) => (b.code || '').toLowerCase() === code.toLowerCase());
      if (!brand) {
        missing.push(code);
        return;
      }
      const columnMap = new Map();
      const componentValues = {};
      columnDefinitions.forEach((col) => {
        const { display, values } = buildComponentData(col.component, brand, componentInstances);
        columnMap.set(col.key, display);
        Object.assign(componentValues, values);
      });
      rows.push({ brand, columnMap, componentValues });
    });
    return { rows, missing };
  }, [brandCodes, brands, columnDefinitions, componentInstances]);

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
          batch.set(doc(db, 'adGroups', groupRef.id, 'recipes', String(i)), {
            components: row.componentValues,
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
            Enter brand codes or names to include in this batch.
          </p>
          <TagInput
            id="batch-brand-input"
            value={brandCodes}
            onChange={handleBrandCodesChange}
            suggestions={brandSuggestions}
            placeholder="Type a brand code or name and press Enter"
            className="w-full"
            inputClassName="w-auto flex-1 min-w-[12rem]"
          />
          {loadingBrands && <p>Loading brands…</p>}
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
                    <tr key={row.brand.code} className="odd:bg-white even:bg-gray-50 dark:odd:bg-[var(--dark-bg)] dark:even:bg-[var(--dark-bg-secondary)]">
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top">
                        <div className="font-semibold">{row.brand.name || '—'}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{row.brand.code}</div>
                      </td>
                      {columnDefinitions.map((col) => (
                        <td
                          key={col.key}
                          className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top"
                        >
                          <div className="whitespace-pre-wrap text-sm">
                            {row.columnMap.get(col.key) || '—'}
                          </div>
                        </td>
                      ))}
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

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};

export default BatchCreateAdGroupModal;
