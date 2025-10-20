import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import useExporterIntegrations, {
  normalizeFieldMapping,
} from './useExporterIntegrations';
import Button from './components/Button.jsx';
import { db } from './firebase/config';

const SAMPLE_AD_GROUP_LIMIT = 5;

const STATIC_DATA_FIELDS = [
  { key: 'storeId', label: 'Store ID' },
  { key: 'groupName', label: 'Ad Group' },
  { key: 'recipeNo', label: 'Recipe #' },
  { key: 'status', label: 'Status' },
  { key: 'primary', label: 'Primary' },
  { key: 'headline', label: 'Headline' },
  { key: 'description', label: 'Description' },
  { key: '1x1', label: '1×1 Asset URL' },
  { key: '9x16', label: '9×16 Asset URL' },
];

const formatLabel = (s) =>
  (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const BASE_COLUMN_KEYS = new Set([
  'storeId',
  'groupName',
  'recipeNo',
  'status',
  'primary',
  'headline',
  'description',
  '1x1',
  '9x16',
]);

const STRUCTURAL_META_KEYS = new Set([
  'components',
  'metadata',
  'assets',
  'type',
  'selected',
  'brandCode',
]);

const DATE_FORMAT_OPTIONS = [
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD (ISO)' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/YYYY' },
  { value: 'dd/MM/yyyy', label: 'DD/MM/YYYY' },
  { value: 'yyyy-MM-dd HH:mm', label: 'YYYY-MM-DD HH:mm (ISO with time)' },
];

const DEFAULT_DATE_FORMAT = DATE_FORMAT_OPTIONS[0].value;

const extractMetadataType = (field) => {
  if (!field || typeof field !== 'object') {
    return '';
  }

  const candidates = [
    typeof field.metadata?.type === 'string' ? field.metadata.type : '',
    typeof field.type === 'string' ? field.type : '',
    typeof field.fieldType === 'string' ? field.fieldType : '',
    typeof field.dataType === 'string' ? field.dataType : '',
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return '';
};

const determineIsDateField = ({ key = '', label = '', metadataType = '' }) => {
  const type = (metadataType || '').toLowerCase();
  if (type === 'date' || type === 'datetime' || type === 'timestamp') {
    return true;
  }

  const normalizedKey = (key || '').toLowerCase();
  if (normalizedKey.includes('date') || normalizedKey.includes('timestamp')) {
    return true;
  }

  const normalizedLabel = (label || '').toLowerCase();
  if (normalizedLabel.includes('date') || normalizedLabel.includes('timestamp')) {
    return true;
  }

  return false;
};

const normalizeMappingEntry = (entry) => {
  if (!entry) {
    return { target: '', format: '' };
  }

  if (typeof entry === 'string') {
    const target = entry.trim();
    return { target, format: '' };
  }

  if (typeof entry === 'object') {
    const target =
      typeof entry.target === 'string'
        ? entry.target.trim()
        : typeof entry.partner === 'string'
        ? entry.partner.trim()
        : '';
    const format = typeof entry.format === 'string' ? entry.format.trim() : '';
    return { target, format };
  }

  return { target: '', format: '' };
};

const convertPartnerMappingToUi = (mapping) => {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  const normalized = normalizeFieldMapping(mapping);
  const uiMapping = {};

  Object.entries(normalized).forEach(([rawPartnerKey, rawEntry]) => {
    const partnerKey = typeof rawPartnerKey === 'string' ? rawPartnerKey.trim() : '';
    if (!partnerKey) {
      return;
    }

    if (typeof rawEntry === 'string') {
      const source = rawEntry.trim();
      if (!source) {
        return;
      }
      uiMapping[source] = { target: partnerKey };
      return;
    }

    if (rawEntry && typeof rawEntry === 'object') {
      const source =
        typeof rawEntry.source === 'string'
          ? rawEntry.source.trim()
          : typeof rawEntry.campfire === 'string'
          ? rawEntry.campfire.trim()
          : typeof rawEntry.field === 'string'
          ? rawEntry.field.trim()
          : '';
      const format = typeof rawEntry.format === 'string' ? rawEntry.format.trim() : '';

      if (source) {
        uiMapping[source] = format ? { target: partnerKey, format } : { target: partnerKey };
      }
    }
  });

  return uiMapping;
};

const convertUiMappingToPartner = (mapping, isDateFieldKey = () => false) => {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  const persisted = {};

  Object.entries(mapping).forEach(([rawCampfireKey, entry]) => {
    const campfireKey =
      typeof rawCampfireKey === 'string' ? rawCampfireKey.trim() : '';
    if (!campfireKey) {
      return;
    }

    const { target, format } = normalizeMappingEntry(entry);
    if (!target) {
      return;
    }

    const isDate = !!isDateFieldKey(campfireKey);

    if (isDate) {
      const appliedFormat = format || DEFAULT_DATE_FORMAT;
      persisted[target] = appliedFormat
        ? { source: campfireKey, format: appliedFormat }
        : { source: campfireKey };
    } else {
      persisted[target] = campfireKey;
    }
  });

  return persisted;
};

const shouldOmitKey = (key) => {
  if (!key) {
    return true;
  }
  const matchBase = Array.from(BASE_COLUMN_KEYS).some(
    (baseKey) => key === baseKey || key.startsWith(`${baseKey}.`),
  );
  if (matchBase) {
    return true;
  }
  return Array.from(STRUCTURAL_META_KEYS).some((structuralKey) => {
    if (structuralKey === 'components') {
      return key === structuralKey;
    }
    return key === structuralKey || key.startsWith(`${structuralKey}.`);
  });
};

const flattenMeta = (obj, prefix = '', res = {}) => {
  Object.entries(obj || {}).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        v.forEach((item, idx) => {
          if (item && typeof item === 'object') {
            flattenMeta(item, `${key}.${idx}`, res);
          } else {
            res[`${key}.${idx}`] = item;
          }
        });
      } else {
        flattenMeta(v, key, res);
      }
    } else {
      res[key] = v;
    }
  });

  return res;
};

const normalizeFieldEntry = (field) => {
  const key = typeof field?.key === 'string' ? field.key.trim() : '';
  const label = typeof field?.label === 'string' ? field.label.trim() : key;
  const required = !!field?.required;
  const metadataType = extractMetadataType(field);
  const isDate = determineIsDateField({ key, label, metadataType });
  return key
    ? {
        key,
        label,
        required,
        metadataType,
        isDate,
      }
    : null;
};

const expandFieldWithCarousel = (field, carouselSlots = 1) => {
  if (!field || !field.key) {
    return [];
  }

  if (/^image[_]?1x1$/i.test(field.key)) {
    if (carouselSlots <= 1) {
      return [field];
    }
    return Array.from({ length: carouselSlots }, (_, index) => ({
      key: `${field.key.replace(/[_]?1x1$/i, '_1x1')}_${index + 1}`.replace('__', '_'),
      label: `${field.label || field.key} #${index + 1}`,
      metadataType: field.metadataType,
      isDate: field.isDate,
    }));
  }

  return [field];
};

const arraysShallowEqual = (a, b) => {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
};

const parseNumeric = (value) => {
  if (value === undefined || value === null) {
    return NaN;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const inferCarouselAssetCount = (recipeType) => {
  if (!recipeType || typeof recipeType !== 'object') {
    return 1;
  }

  const fields = Array.isArray(recipeType.writeInFields)
    ? recipeType.writeInFields
    : [];

  let inferredMax = 1;

  fields.forEach((field) => {
    const normalized = normalizeFieldEntry(field);
    if (!normalized) {
      return;
    }

    const match = normalized.key.match(/^image[_]?1x1_(\d+)$/i);
    if (match) {
      const index = parseNumeric(match[1]);
      if (Number.isFinite(index)) {
        inferredMax = Math.max(inferredMax, index);
      }
      return;
    }

    if (/^image[_]?1x1$/i.test(normalized.key)) {
      const numericHints = [
        parseNumeric(field?.maxItems),
        parseNumeric(field?.maxCount),
        parseNumeric(field?.limit),
        parseNumeric(field?.count),
        parseNumeric(field?.total),
        parseNumeric(field?.max),
        parseNumeric(field?.maxAssets),
        parseNumeric(field?.carouselLength),
      ];
      numericHints.forEach((hint) => {
        if (Number.isFinite(hint)) {
          inferredMax = Math.max(inferredMax, hint);
        }
      });
      if (field?.multiple || field?.allowMultiple || field?.enableCarousel) {
        inferredMax = Math.max(inferredMax, 2);
      }
    }
  });

  const topLevelHints = [
    parseNumeric(recipeType?.carouselAssetCount),
    parseNumeric(recipeType?.carouselImageCount),
    parseNumeric(recipeType?.squareAssetCount),
    parseNumeric(recipeType?.squareAssets),
    parseNumeric(recipeType?.assetCarouselLength),
    parseNumeric(recipeType?.carouselLength),
  ];

  topLevelHints.forEach((hint) => {
    if (Number.isFinite(hint)) {
      inferredMax = Math.max(inferredMax, hint);
    }
  });

  return Number.isFinite(inferredMax) && inferredMax > 0 ? inferredMax : 1;
};

const EMPTY_FORM = {
  id: '',
  name: '',
  partnerKey: '',
  baseUrl: '',
  apiKey: '',
  enabled: true,
  notes: '',
  supportedFormatsText: '',
  recipeTypeId: '',
  fieldMapping: {},
};

const createEmptyForm = () => ({ ...EMPTY_FORM, fieldMapping: {} });

const maskSecret = (value) => {
  if (!value) {
    return '—';
  }
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }
  const visible = value.slice(-4);
  const masked = '•'.repeat(Math.max(0, value.length - 4));
  return `${masked}${visible}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch (err) {
    return null;
  }
};

const AdminIntegrations = () => {
  const {
    integrations,
    loading,
    error,
    saveIntegration,
    deleteIntegration,
  } = useExporterIntegrations();

  const [formState, setFormState] = useState(() => createEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [recipeTypes, setRecipeTypes] = useState([]);
  const [recipeTypesLoading, setRecipeTypesLoading] = useState(true);
  const [recipeTypesError, setRecipeTypesError] = useState('');
  const [extraCampfireFieldKeys, setExtraCampfireFieldKeys] = useState([]);
  const [campfireFieldSearch, setCampfireFieldSearch] = useState('');
  const [sampleMetaKeys, setSampleMetaKeys] = useState(() => new Set());

  useEffect(() => {
    let active = true;

    const fetchRecipeTypes = async () => {
      setRecipeTypesLoading(true);
      setRecipeTypesError('');
      try {
        const snap = await getDocs(collection(db, 'recipeTypes'));
        if (!active) {
          return;
        }
        setRecipeTypes(
          snap.docs.map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              name: data.name || docSnap.id,
              writeInFields: Array.isArray(data.writeInFields)
                ? data.writeInFields
                : [],
            };
          }),
        );
      } catch (err) {
        console.error('Failed to fetch recipe types', err);
        if (!active) {
          return;
        }
        setRecipeTypes([]);
        setRecipeTypesError('Failed to load recipe types.');
      } finally {
        if (active) {
          setRecipeTypesLoading(false);
        }
      }
    };

    fetchRecipeTypes();

    return () => {
      active = false;
    };
  }, []);

  const recipeTypeMap = useMemo(() => {
    const map = {};
    recipeTypes.forEach((type) => {
      if (type && type.id) {
        map[type.id] = type;
      }
    });
    return map;
  }, [recipeTypes]);

  const currentRecipeType = formState.recipeTypeId
    ? recipeTypeMap[formState.recipeTypeId]
    : null;

  useEffect(() => {
    let active = true;
    setSampleMetaKeys(new Set());

    const recipeTypeId = formState.recipeTypeId;
    if (!recipeTypeId) {
      return () => {
        active = false;
      };
    }

    const loadSampleMetaKeys = async () => {
      try {
        const aggregatedKeys = new Set();

        const addKeysFromObject = (value) => {
          if (!value || typeof value !== 'object') {
            return;
          }
          const flattened = flattenMeta(value || {});
          Object.keys(flattened || {}).forEach((rawKey) => {
            if (typeof rawKey !== 'string') {
              return;
            }
            const trimmed = rawKey.trim();
            if (trimmed && !shouldOmitKey(trimmed)) {
              aggregatedKeys.add(trimmed);
            }
          });
        };

        const processAdGroupDocs = (docs) => {
          docs.forEach((docSnap) => {
            if (!docSnap) {
              return;
            }
            const exists =
              typeof docSnap.exists === 'function' ? docSnap.exists() : true;
            if (!exists) {
              return;
            }
            const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
            const payload = data || {};
            addKeysFromObject(payload.metadata);
            addKeysFromObject(payload.components);
            addKeysFromObject(payload.recipe);
          });
        };

        const adGroupQuery = query(
          collection(db, 'adGroups'),
          where('recipeTypeId', '==', recipeTypeId),
          limit(SAMPLE_AD_GROUP_LIMIT),
        );
        const adGroupSnap = await getDocs(adGroupQuery);
        processAdGroupDocs(adGroupSnap.docs);

        if (aggregatedKeys.size === 0) {
          const recipeQuery = query(
            collectionGroup(db, 'recipes'),
            where('recipeTypeId', '==', recipeTypeId),
            limit(SAMPLE_AD_GROUP_LIMIT),
          );
          const recipeSnap = await getDocs(recipeQuery);
          const adGroupIds = new Set();

          recipeSnap.docs.forEach((recipeDoc) => {
            if (!recipeDoc) {
              return;
            }
            const recipeExists =
              typeof recipeDoc.exists === 'function' ? recipeDoc.exists() : true;
            if (!recipeExists) {
              return;
            }
            const recipeData =
              typeof recipeDoc.data === 'function' ? recipeDoc.data() : recipeDoc.data;
            const payload = recipeData || {};
            addKeysFromObject(payload.metadata);
            addKeysFromObject(payload.components);
            addKeysFromObject(payload.recipe);

            const segments = recipeDoc.ref?.path?.split('/') || [];
            const adGroupsIndex = segments.indexOf('adGroups');
            if (adGroupsIndex !== -1 && adGroupsIndex + 1 < segments.length) {
              adGroupIds.add(segments[adGroupsIndex + 1]);
            }
          });

          if (adGroupIds.size > 0) {
            const ids = Array.from(adGroupIds).slice(0, SAMPLE_AD_GROUP_LIMIT);
            const groupDocs = await Promise.all(
              ids.map((groupId) => getDoc(doc(db, 'adGroups', groupId))),
            );
            processAdGroupDocs(groupDocs);
          }
        }

        if (!active) {
          return;
        }

        setSampleMetaKeys(aggregatedKeys);
      } catch (err) {
        console.error('Failed to load sample ad group metadata', err);
        if (active) {
          setSampleMetaKeys(new Set());
        }
      }
    };

    loadSampleMetaKeys();

    return () => {
      active = false;
    };
  }, [formState.recipeTypeId]);

  const sampleMetaKeyList = useMemo(() => {
    return Array.from(sampleMetaKeys);
  }, [sampleMetaKeys]);

  const normalizedWriteInFields = useMemo(() => {
    if (!Array.isArray(currentRecipeType?.writeInFields)) {
      return [];
    }
    const map = new Map();
    currentRecipeType.writeInFields
      .map((field) => normalizeFieldEntry(field))
      .filter(Boolean)
      .forEach((field) => {
        const label = field.label || formatLabel(field.key);
        map.set(field.key, { ...field, label });
      });
    return Array.from(map.values());
  }, [currentRecipeType]);

  const availableCampfireFields = useMemo(() => {
    const carouselSlots = inferCarouselAssetCount(currentRecipeType);
    const merged = new Map();

    const addField = (field) => {
      if (!field || !field.key) {
        return;
      }
      const existing = merged.get(field.key);
      const label = field.label || existing?.label || formatLabel(field.key);
      const metadataType = field.metadataType || existing?.metadataType || '';
      const isDate =
        typeof field.isDate === 'boolean'
          ? field.isDate
          : typeof existing?.isDate === 'boolean'
          ? existing.isDate
          : determineIsDateField({
              key: field.key,
              label,
              metadataType,
            });
      merged.set(field.key, { key: field.key, label, metadataType, isDate });
    };

    const sampleFields = sampleMetaKeyList
      .filter((key) => key && !shouldOmitKey(key))
      .map((key) => {
        const label = formatLabel(key);
        return {
          key,
          label,
          metadataType: '',
          isDate: determineIsDateField({ key, label }),
        };
      });

    const universalFields = STATIC_DATA_FIELDS.map(({ key, label }) => {
      const resolvedKey = key || '';
      if (!resolvedKey) {
        return null;
      }
      const resolvedLabel = label || formatLabel(resolvedKey);
      return {
        key: resolvedKey,
        label: resolvedLabel,
        metadataType: '',
        isDate: determineIsDateField({ key: resolvedKey, label: resolvedLabel }),
      };
    }).filter(Boolean);

    const groups =
      sampleFields.length > 0
        ? [sampleFields, normalizedWriteInFields, universalFields]
        : [normalizedWriteInFields, universalFields];

    groups.forEach((group) => {
      group.forEach((field) => {
        if (!field?.key) {
          return;
        }
        const fieldsToAdd =
          group === normalizedWriteInFields
            ? expandFieldWithCarousel(field, carouselSlots)
            : [field];
        fieldsToAdd.forEach(addField);
      });
    });

    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [currentRecipeType, normalizedWriteInFields, sampleMetaKeyList]);

  const availableCampfireFieldMap = useMemo(() => {
    const map = new Map();
    availableCampfireFields.forEach((field) => {
      if (field?.key) {
        map.set(field.key, field);
      }
    });
    return map;
  }, [availableCampfireFields]);

  const allCampfireFieldOptions = useMemo(() => {
    const merged = new Map();

    const addOption = (field) => {
      if (!field || !field.key) {
        return;
      }
      const existing = merged.get(field.key);
      const label = field.label || existing?.label || formatLabel(field.key);
      const metadataType = field.metadataType || existing?.metadataType || '';
      const isDate =
        typeof field.isDate === 'boolean'
          ? field.isDate
          : typeof existing?.isDate === 'boolean'
          ? existing.isDate
          : determineIsDateField({
              key: field.key,
              label,
              metadataType,
            });
      merged.set(field.key, { key: field.key, label, metadataType, isDate });
    };

    normalizedWriteInFields.forEach(addOption);
    sampleMetaKeyList
      .filter((key) => key && !shouldOmitKey(key))
      .forEach((key) => addOption({ key, label: formatLabel(key) }));
    STATIC_DATA_FIELDS.forEach(({ key, label }) => {
      if (!key) {
        return;
      }
      addOption({ key, label: label || formatLabel(key) });
    });

    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [normalizedWriteInFields, sampleMetaKeyList]);

  const allCampfireFieldOptionMap = useMemo(() => {
    const map = new Map();
    allCampfireFieldOptions.forEach((field) => {
      if (field?.key) {
        map.set(field.key, field);
      }
    });
    return map;
  }, [allCampfireFieldOptions]);

  const displayedCampfireFields = useMemo(() => {
    const map = new Map();

    const addKey = (key) => {
      const trimmedKey = typeof key === 'string' ? key.trim() : '';
      if (!trimmedKey || map.has(trimmedKey)) {
        return;
      }
      const option =
        allCampfireFieldOptionMap.get(trimmedKey) ||
        availableCampfireFieldMap.get(trimmedKey) || {
          key: trimmedKey,
          label: formatLabel(trimmedKey),
        };
      const label = option.label || formatLabel(trimmedKey);
      const metadataType = option.metadataType || '';
      const isDate =
        typeof option.isDate === 'boolean'
          ? option.isDate
          : determineIsDateField({
              key: trimmedKey,
              label,
              metadataType,
            });
      map.set(trimmedKey, {
        key: trimmedKey,
        label,
        metadataType,
        isDate,
      });
    };

    availableCampfireFields.forEach((field) => addKey(field.key));
    extraCampfireFieldKeys.forEach(addKey);
    Object.keys(formState.fieldMapping || {}).forEach(addKey);

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [
    allCampfireFieldOptionMap,
    availableCampfireFieldMap,
    availableCampfireFields,
    extraCampfireFieldKeys,
    formState.fieldMapping,
  ]);

  const displayedCampfireFieldMap = useMemo(() => {
    const map = new Map();
    displayedCampfireFields.forEach((field) => {
      if (field?.key) {
        map.set(field.key, field);
      }
    });
    return map;
  }, [displayedCampfireFields]);

  const displayedCampfireFieldKeySet = useMemo(() => {
    return new Set(displayedCampfireFields.map((field) => field.key));
  }, [displayedCampfireFields]);

  const filteredCampfireSuggestions = useMemo(() => {
    const query = campfireFieldSearch.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return allCampfireFieldOptions
      .filter((field) => {
        if (displayedCampfireFieldKeySet.has(field.key)) {
          return false;
        }
        const keyMatch = field.key.toLowerCase().includes(query);
        const labelMatch = (field.label || '').toLowerCase().includes(query);
        return keyMatch || labelMatch;
      })
      .slice(0, 12);
  }, [allCampfireFieldOptions, campfireFieldSearch, displayedCampfireFieldKeySet]);

  const isDateFieldKey = useCallback(
    (key) => {
      const trimmed = typeof key === 'string' ? key.trim() : '';
      if (!trimmed) {
        return false;
      }
      const candidates = [
        displayedCampfireFieldMap.get(trimmed),
        availableCampfireFieldMap.get(trimmed),
        allCampfireFieldOptionMap.get(trimmed),
      ];
      for (const candidate of candidates) {
        if (candidate && typeof candidate.isDate === 'boolean') {
          return candidate.isDate;
        }
      }
      return determineIsDateField({ key: trimmed });
    },
    [
      allCampfireFieldOptionMap,
      availableCampfireFieldMap,
      displayedCampfireFieldMap,
    ],
  );

  useEffect(() => {
    setExtraCampfireFieldKeys((prev) => {
      const availableKeys = new Set(availableCampfireFields.map((field) => field.key));
      const mappingKeys = Object.keys(formState.fieldMapping || {});
      const next = [];

      prev.forEach((key) => {
        if (key && !availableKeys.has(key) && !next.includes(key)) {
          next.push(key);
        }
      });

      mappingKeys.forEach((key) => {
        if (key && !availableKeys.has(key) && !next.includes(key)) {
          next.push(key);
        }
      });

      return arraysShallowEqual(prev, next) ? prev : next;
    });
  }, [availableCampfireFields, formState.fieldMapping]);

  const sortedIntegrations = useMemo(() => {
    return [...integrations].sort((a, b) => a.name.localeCompare(b.name));
  }, [integrations]);

  const updateFieldMapping = (campfireFieldKey, partnerFieldName, options = {}) => {
    setFormState((prev) => {
      const nextMapping = { ...(prev.fieldMapping || {}) };
      const trimmedCampfire =
        typeof campfireFieldKey === 'string' ? campfireFieldKey.trim() : '';
      if (!trimmedCampfire) {
        return prev;
      }

      const trimmedPartner =
        typeof partnerFieldName === 'string' ? partnerFieldName.trim() : '';
      const existing = normalizeMappingEntry(nextMapping[trimmedCampfire]);
      const dateField =
        typeof options.isDate === 'boolean'
          ? options.isDate
          : isDateFieldKey(trimmedCampfire);
      let format = dateField ? existing.format : '';
      const hadEntry = Object.prototype.hasOwnProperty.call(
        nextMapping,
        trimmedCampfire,
      );

      if (dateField && trimmedPartner && !format) {
        format = DEFAULT_DATE_FORMAT;
      }

      if (!trimmedPartner) {
        if (!dateField) {
          if (!hadEntry) {
            return prev;
          }
          delete nextMapping[trimmedCampfire];
          return { ...prev, fieldMapping: nextMapping };
        }

        if (!format || existing.target) {
          if (!hadEntry) {
            return prev;
          }
          delete nextMapping[trimmedCampfire];
        } else {
          nextMapping[trimmedCampfire] = { format };
        }
      } else {
        const entry = {};
        if (trimmedPartner) {
          entry.target = trimmedPartner;
        }
        if (format && dateField) {
          entry.format = format;
        }
        nextMapping[trimmedCampfire] = entry;
      }

      return { ...prev, fieldMapping: nextMapping };
    });
  };

  const updateFieldFormat = (campfireFieldKey, formatValue) => {
    setFormState((prev) => {
      const nextMapping = { ...(prev.fieldMapping || {}) };
      const trimmedCampfire =
        typeof campfireFieldKey === 'string' ? campfireFieldKey.trim() : '';
      if (!trimmedCampfire) {
        return prev;
      }

      const trimmedFormat =
        typeof formatValue === 'string' ? formatValue.trim() : '';
      const existing = normalizeMappingEntry(nextMapping[trimmedCampfire]);
      const partner = existing.target;
      const dateField = isDateFieldKey(trimmedCampfire);
      const hadEntry = Object.prototype.hasOwnProperty.call(
        nextMapping,
        trimmedCampfire,
      );

      if ((!trimmedFormat || !dateField) && !partner) {
        if (!hadEntry) {
          return prev;
        }
        delete nextMapping[trimmedCampfire];
      } else {
        const entry = {};
        if (partner) {
          entry.target = partner;
        }
        if (trimmedFormat && dateField) {
          entry.format = trimmedFormat;
        }
        nextMapping[trimmedCampfire] = entry;
      }

      return { ...prev, fieldMapping: nextMapping };
    });
  };

  const handleAddCampfireField = (fieldKey) => {
    const key = typeof fieldKey === 'string' ? fieldKey.trim() : '';
    if (!key) {
      return;
    }
    setExtraCampfireFieldKeys((prev) => {
      if (prev.includes(key)) {
        return prev;
      }
      return [...prev, key];
    });
    setCampfireFieldSearch('');
  };

  const handleCampfireFieldSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = campfireFieldSearch.trim();
      if (filteredCampfireSuggestions.length > 0) {
        handleAddCampfireField(filteredCampfireSuggestions[0].key);
      } else if (trimmed && !displayedCampfireFieldKeySet.has(trimmed)) {
        handleAddCampfireField(trimmed);
      }
    } else if (event.key === 'Escape') {
      setCampfireFieldSearch('');
    }
  };

  const resetForm = () => {
    setFormState(createEmptyForm());
    setEditingId(null);
    setShowApiKey(false);
    setValidationError('');
    setExtraCampfireFieldKeys([]);
    setCampfireFieldSearch('');
  };

  const startCreate = () => {
    setFormState(createEmptyForm());
    setEditingId('new');
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
    setExtraCampfireFieldKeys([]);
    setCampfireFieldSearch('');
  };

  const startEdit = (integration) => {
    setFormState({
      id: integration.id,
      name: integration.name || '',
      partnerKey: integration.partnerKey || '',
      baseUrl: integration.baseUrl || '',
      apiKey: integration.apiKey || '',
      enabled: integration.enabled !== false,
      notes: integration.notes || '',
      supportedFormatsText: Array.isArray(integration.supportedFormats)
        ? integration.supportedFormats.join(', ')
        : '',
      recipeTypeId: integration.recipeTypeId || '',
      fieldMapping: convertPartnerMappingToUi(integration.fieldMapping),
    });
    setEditingId(integration.id);
    setShowApiKey(false);
    setMessage('');
    setValidationError('');
    setExtraCampfireFieldKeys([]);
    setCampfireFieldSearch('');
  };

  const handleDelete = async (integration) => {
    const confirmed = window.confirm(
      `Delete the \"${integration.name || integration.partnerKey}\" integration?` +
        '\nThis cannot be undone.',
    );
    if (!confirmed) {
      return;
    }
    try {
      await deleteIntegration(integration.id);
      setMessage('Integration deleted');
      if (editingId === integration.id) {
        resetForm();
      }
    } catch (err) {
      console.error('Failed to delete integration', err);
      setMessage('Failed to delete integration');
    }
  };

  const handleChange = (field, value) => {
    if (field === 'recipeTypeId') {
      setFormState((prev) => ({
        ...prev,
        recipeTypeId: value,
        fieldMapping: {},
      }));
      setExtraCampfireFieldKeys([]);
      setCampfireFieldSearch('');
      return;
    }
    if (field === 'partnerKey') {
      setFormState((prev) => ({ ...prev, [field]: value, fieldMapping: {} }));
      setExtraCampfireFieldKeys([]);
      setCampfireFieldSearch('');
      return;
    }
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setValidationError('');

    const trimmedName = formState.name.trim();
    const trimmedPartnerKey = formState.partnerKey.trim();
    const trimmedBaseUrl = formState.baseUrl.trim();

    if (!trimmedName) {
      setValidationError('Name is required.');
      return;
    }
    if (!trimmedPartnerKey) {
      setValidationError('Partner key is required.');
      return;
    }

    const supportedFormats = (formState.supportedFormatsText || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const invalidFormattedFields = [];
    Object.entries(formState.fieldMapping || {}).forEach(([campfireKey, entry]) => {
      const trimmedKey = typeof campfireKey === 'string' ? campfireKey.trim() : '';
      if (!trimmedKey) {
        return;
      }
      const { target, format } = normalizeMappingEntry(entry);
      if (isDateFieldKey(trimmedKey) && format && !target) {
        invalidFormattedFields.push(trimmedKey);
      }
    });

    if (invalidFormattedFields.length > 0) {
      const labels = invalidFormattedFields
        .map((key) => {
          const fieldInfo =
            availableCampfireFieldMap.get(key) ||
            allCampfireFieldOptionMap.get(key);
          return fieldInfo?.label || formatLabel(key);
        })
        .join(', ');
      setValidationError(
        `Provide partner field names for formatted date fields: ${labels}.`,
      );
      return;
    }

    const persistedFieldMapping = convertUiMappingToPartner(
      formState.fieldMapping,
      isDateFieldKey,
    );

    const payload = {
      id: formState.id || undefined,
      name: trimmedName,
      partnerKey: trimmedPartnerKey,
      baseUrl: trimmedBaseUrl,
      apiKey: formState.apiKey.trim(),
      enabled: !!formState.enabled,
      notes: formState.notes.trim(),
      supportedFormats,
      recipeTypeId: formState.recipeTypeId || '',
      fieldMapping: persistedFieldMapping,
    };

    setSaving(true);
    try {
      await saveIntegration(payload);
      setMessage('Integration saved');
      resetForm();
    } catch (err) {
      console.error('Failed to save integration', err);
      setMessage('Failed to save integration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Partner Integrations</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Configure the API connections used by exporter jobs. Enable integrations to make
          them available in the export flow.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          Failed to load integrations. Please refresh the page.
        </div>
      )}
      {recipeTypesError && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {recipeTypesError} Field mapping options may be incomplete.
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-[var(--accent-color)]/40 bg-[var(--accent-color)]/10 p-3 text-sm text-[var(--accent-color)]">
          {message}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Configured partners</h2>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={startCreate}
          disabled={loading}
        >
          Add integration
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
          Loading integrations…
        </div>
      ) : (
        <div className="space-y-4">
          {sortedIntegrations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
              No integrations configured yet.
            </div>
          ) : (
            sortedIntegrations.map((integration) => {
              const lastUpdated = formatDateTime(integration.updatedAt);
              return (
                <div
                  key={integration.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[var(--accent-color)]/60 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {integration.name || 'Untitled integration'}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            integration.enabled
                              ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-200'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-600/30 dark:text-gray-300'
                          }`}
                        >
                          {integration.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Partner key: {integration.partnerKey || '—'}
                      </p>
                      {integration.baseUrl && (
                        <p className="mt-2 text-sm text-gray-600 break-all dark:text-gray-300">
                          Base URL: {integration.baseUrl}
                        </p>
                      )}
                      {integration.recipeTypeId && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                          Recipe type:{' '}
                          {recipeTypeMap[integration.recipeTypeId]?.name ||
                            integration.recipeTypeId}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        API key: {maskSecret(integration.apiKey)}
                      </p>
                      {integration.supportedFormats?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {integration.supportedFormats.map((format) => (
                            <span
                              key={format}
                              className="inline-flex items-center rounded-full bg-[var(--accent-color)]/10 px-2.5 py-1 text-xs font-medium text-[var(--accent-color)]"
                            >
                              {format}
                            </span>
                          ))}
                        </div>
                      )}
                      {integration.notes && (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                          {integration.notes}
                        </p>
                      )}
                      {lastUpdated && (
                        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                          Last updated {lastUpdated}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="neutral"
                        size="sm"
                        onClick={() => startEdit(integration)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="delete"
                        size="sm"
                        onClick={() => handleDelete(integration)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {(editingId || validationError) && (
        <form
          onSubmit={handleSubmit}
          className="mt-10 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]"
        >
          <h2 className="text-lg font-semibold">
            {editingId === 'new' || !editingId ? 'Add integration' : 'Edit integration'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Name
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="e.g. Meta Marketing API"
                required
              />
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Partner key
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.partnerKey}
                onChange={(event) => handleChange('partnerKey', event.target.value)}
                placeholder="Internal identifier"
                required
              />
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Base URL
              <input
                type="url"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.baseUrl}
                onChange={(event) => handleChange('baseUrl', event.target.value)}
                placeholder="https://api.partner.com"
              />
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Recipe type
              {recipeTypesLoading ? (
                <div className="mt-1 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)]/40 dark:text-gray-300">
                  Loading recipe types…
                </div>
              ) : (
                <select
                  className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                  value={formState.recipeTypeId}
                  onChange={(event) => handleChange('recipeTypeId', event.target.value)}
                >
                  <option value="">Select a recipe type</option>
                  {recipeTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name || type.id}
                    </option>
                  ))}
                </select>
              )}
              <span className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                Choose the recipe type this integration exports. Field mappings are based on the selected type.
              </span>
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              API key
              <div className="mt-1 flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                  value={formState.apiKey}
                  onChange={(event) => handleChange('apiKey', event.target.value)}
                  placeholder="Token or credential"
                />
                <Button
                  type="button"
                  variant="neutral"
                  size="sm"
                  onClick={() => setShowApiKey((value) => !value)}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </label>
            <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Supported export types
              <input
                type="text"
                className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.supportedFormatsText}
                onChange={(event) => handleChange('supportedFormatsText', event.target.value)}
                placeholder="Comma-separated list, e.g. ads, catalog"
              />
            </label>
            <div className="md:col-span-2">
              <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Field mapping</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Map Campfire fields to your partner’s expected field names.
                </span>
              </div>
              <div className="mt-2 rounded-md border border-gray-200 bg-white dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
                {displayedCampfireFields.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-[var(--border-color-default)]">
                      <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-[var(--dark-input-bg)] dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Campfire field</th>
                          <th className="px-3 py-2">Partner field name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-[var(--border-color-default)]">
                        {displayedCampfireFields.map((field) => {
                          const mappingEntry = normalizeMappingEntry(
                            formState.fieldMapping?.[field.key],
                          );
                          const partnerValue = mappingEntry.target;
                          const showFormatDropdown = !!field.isDate;
                          const effectiveFormat =
                            mappingEntry.format || DEFAULT_DATE_FORMAT;
                          const showPartnerError =
                            showFormatDropdown &&
                            !!mappingEntry.format &&
                            !partnerValue;

                          return (
                            <tr key={field.key}>
                              <td className="px-3 py-2 align-top text-sm text-gray-700 dark:text-gray-200">
                                <div className="font-medium">{field.label || field.key}</div>
                                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Key: {field.key}</div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                                      value={partnerValue || ''}
                                      onChange={(event) =>
                                        updateFieldMapping(field.key, event.target.value, {
                                          isDate: field.isDate,
                                        })
                                      }
                                      placeholder="Partner field name"
                                    />
                                    {showPartnerError ? (
                                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                        Enter a partner field name to apply the selected date format.
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Leave blank to omit this field from the payload.
                                      </p>
                                    )}
                                  </div>
                                  {showFormatDropdown ? (
                                    <div className="sm:w-48">
                                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                                        Date format
                                        <select
                                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                                          value={effectiveFormat}
                                          onChange={(event) =>
                                            updateFieldFormat(field.key, event.target.value)
                                          }
                                        >
                                          {DATE_FORMAT_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    {formState.recipeTypeId
                      ? 'No fields defined for this recipe; you can add Campfire fields below.'
                      : 'Select a recipe type to load fields.'}
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                You are selecting which Campfire fields to send and naming the partner fields that should receive them.
              </p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Search Campfire fields
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                    value={campfireFieldSearch}
                    onChange={(event) => setCampfireFieldSearch(event.target.value)}
                    onKeyDown={handleCampfireFieldSearchKeyDown}
                    placeholder="Search Campfire fields…"
                  />
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Suggestions include standard Campfire fields and nested paths from the selected recipe type.
                </p>
                {campfireFieldSearch.trim() ? (
                  filteredCampfireSuggestions.length > 0 ? (
                    <ul className="mt-3 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-card-bg)]">
                      {filteredCampfireSuggestions.map((option) => (
                        <li
                          key={option.key}
                          className="border-b border-gray-100 last:border-0 dark:border-[var(--border-color-default)] last:dark:border-0"
                        >
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-100 focus:outline-none dark:hover:bg-[var(--dark-input-bg)] dark:focus:bg-[var(--dark-input-bg)]"
                            onClick={() => handleAddCampfireField(option.key)}
                          >
                            <div className="font-medium text-gray-700 dark:text-gray-200">
                              {option.label || option.key}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Key: {option.key}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                      No matching Campfire fields found. Enter a full field path and press Enter to add it manually.
                    </p>
                  )
                ) : null}
              </div>
            </div>
            <label className="md:col-span-2 flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                checked={!!formState.enabled}
                onChange={(event) => handleChange('enabled', event.target.checked)}
              />
              Integration is enabled
            </label>
            <label className="md:col-span-2 flex flex-col text-sm font-medium text-gray-700 dark:text-gray-200">
              Notes
              <textarea
                className="mt-1 min-h-[96px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] dark:border-[var(--border-color-default)] dark:bg-[var(--dark-input-bg)] dark:text-white"
                value={formState.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                placeholder="Optional runbooks, SLA information, or configuration notes."
              />
            </label>
          </div>

          {validationError && (
            <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="accent" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save integration'}
            </Button>
            <Button
              type="button"
              variant="neutral"
              size="sm"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

export { convertPartnerMappingToUi };
export default AdminIntegrations;
