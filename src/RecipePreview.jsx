import React, { useEffect, useState, useMemo, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  FiImage,
  FiVideo,
  FiCheckSquare,
  FiSquare,
  FiEdit2,
  FiTrash,
  FiX,
  FiPlus,
  FiSave,
  FiColumns,
  FiLink,
} from 'react-icons/fi';
import { FaMagic } from 'react-icons/fa';
import { auth, db, storage } from './firebase/config';
import useUserRole from './useUserRole';
import TagInput from './components/TagInput.jsx';
import selectRandomOption from './utils/selectRandomOption.js';
import parseContextTags from './utils/parseContextTags.js';
import debugLog from './utils/debugLog';
import { safeGetItem } from './utils/safeLocalStorage.js';
import AssetPickerModal from './components/AssetPickerModal.jsx';
import HoverPreview from './components/HoverPreview.jsx';
import PageToolbar from './components/PageToolbar.jsx';
import IconButton from './components/IconButton.jsx';
import SaveButton from './components/SaveButton.jsx';
import TabButton from './components/TabButton.jsx';
import normalizeAssetType from './utils/normalizeAssetType.js';
import isVideoUrl from './utils/isVideoUrl.js';
import OptimizedImage from './components/OptimizedImage.jsx';
import TaggerModal from './TaggerModal.jsx';
import BriefStepSelect from './components/BriefStepSelect.jsx';
import BriefStepForm from './components/BriefStepForm.jsx';

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


const RecipePreview = ({
  onSave = null,
  initialResults = null,
  showOnlyResults = false,
  onSelectChange = null,
  brandCode: initialBrandCode = '',
  hideBrandSelect = false,
  allowedBrandCodes = null,
  onRecipesClick = null,
  externalOnly = false,
  showColumnButton = true,
  title = '',
  onTitleChange = null,
  onStepChange = null,
  onBrandCodeChange = null,
  showBriefExtras = false,
}) => {
  const [types, setTypes] = useState([]);
  const [components, setComponents] = useState([]);
  const [instances, setInstances] = useState([]);
  const [brandProducts, setBrandProducts] = useState([]);
  const [brandCampaigns, setBrandCampaigns] = useState([]);
  const [brands, setBrands] = useState([]);
  const [brandCode, setBrandCode] = useState(initialBrandCode);
  const [selectedType, setSelectedType] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [selectedInstances, setSelectedInstances] = useState({});
  const [results, setResults] = useState([]);
  const originalResultsRef = useRef([]);
  const [dirty, setDirty] = useState(false);
  const [generateCount, setGenerateCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [assetRows, setAssetRows] = useState([]);
  const [assetMap, setAssetMap] = useState({});
  const [assetUsage, setAssetUsage] = useState({});
  const [showOptionLists, setShowOptionLists] = useState({});
  const [assetFilter, setAssetFilter] = useState('');
  const [showTagger, setShowTagger] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [briefNote, setBriefNote] = useState('');
  const [briefFiles, setBriefFiles] = useState([]);
  const briefFileInputRef = useRef(null);

  const handleBriefNoteChange = (e) => {
    setBriefNote(e.target.value);
    setDirty(true);
  };

  const handleBriefFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setBriefFiles(files);
    if (files.length > 0) setDirty(true);
  };

  const isUrl = (str) => /^https?:\/\//i.test(str);
  const [reviewRows, setReviewRows] = useState([]);

  const currentType = types.find((t) => t.id === selectedType);

  useEffect(() => {
    if (onStepChange) onStepChange(step);
  }, [step, onStepChange]);


  // Reset visible columns when the selected recipe type changes or when the
  // recipe type details load so defaults for the type can be applied in the
  // column initialization effect below.
  useEffect(() => {
    setVisibleColumns({});
  }, [selectedType, currentType]);

  const allInstances = useMemo(() => [...instances, ...brandProducts, ...brandCampaigns], [instances, brandProducts, brandCampaigns]);
  const filteredAssetRows = useMemo(() => {
    const term = assetFilter.toLowerCase();
    if (!term) return assetRows;
    return assetRows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.product || '').toLowerCase().includes(term) ||
        (r.campaign || '').toLowerCase().includes(term)
    );
  }, [assetRows, assetFilter]);


  useEffect(() => {
    try {
      const key = brandCode ? `reviews_${brandCode}` : 'reviews';
      const raw = safeGetItem(key);
      if (!raw) {
        setReviewRows([]);
        return;
      }
      const rows = JSON.parse(raw);
      if (Array.isArray(rows)) {
        setReviewRows(
          rows.map((r) => ({
            name: '',
            body: '',
            title: '',
            rating: '',
            product: '',
            ...r,
          })),
        );
      } else setReviewRows([]);
    } catch (err) {
      console.error('Failed to load reviews', err);
      setReviewRows([]);
    }
  }, [brandCode]);

  useEffect(() => {
    const loadProducts = async () => {
      if (!brandCode) {
        setBrandProducts([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const prods = Array.isArray(data.products) ? data.products : [];
          setBrandProducts(
            prods.map((p, idx) => ({
              id: `product-${idx}`,
              componentKey: 'product',
              name: p.name,
              values: {
                name: p.name,
                description: Array.isArray(p.description)
                  ? p.description
                  : typeof p.description === 'string'
                  ? p.description
                      .split(/[;\n]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                  : [],
                benefits: Array.isArray(p.benefits)
                  ? p.benefits
                  : typeof p.benefits === 'string'
                  ? p.benefits
                      .split(/[;\n]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                  : [],
                featuredImage: p.featuredImage || '',
                images: Array.isArray(p.images) ? p.images : [],
              },
              relationships: { brandCode },
            }))
          );
        } else {
          setBrandProducts([]);
        }
      } catch (err) {
        console.error('Failed to load products', err);
        setBrandProducts([]);
      }
    };
    loadProducts();
  }, [brandCode]);

  useEffect(() => {
    const loadCampaigns = async () => {
      if (!brandCode) {
        setBrandCampaigns([]);
        return;
      }
      try {
        const q = query(collection(db, 'brands'), where('code', '==', brandCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const camps = Array.isArray(data.campaigns) ? data.campaigns : [];
          setBrandCampaigns(
            camps.map((c, idx) => ({
              id: `campaign-${idx}`,
              componentKey: 'campaign',
              name: c.name,
              values: {
                name: c.name,
                details: Array.isArray(c.details)
                  ? c.details
                  : typeof c.details === 'string'
                  ? c.details
                      .split(/[;\n]+/)
                      .map((d) => d.trim())
                      .filter(Boolean)
                  : [],
              },
              relationships: { brandCode },
            }))
          );
        } else {
          setBrandCampaigns([]);
        }
      } catch (err) {
        console.error('Failed to load campaigns', err);
        setBrandCampaigns([]);
      }
    };
    loadCampaigns();
  }, [brandCode]);
  const { role: userRole } = useUserRole(auth.currentUser?.uid);
  const canEditRecipes =
    userRole === 'admin' || userRole === 'agency' || userRole === 'client';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeQuery = externalOnly
          ? query(collection(db, 'recipeTypes'), where('external', '==', true))
          : collection(db, 'recipeTypes');
        const typeSnap = await getDocs(typeQuery);
        const resolveUrl = async (url) => {
          if (!url) return url;
          if (isUrl(url)) return url;
          try {
            return await getDownloadURL(ref(storage, url));
          } catch (err) {
            console.error('Failed to load icon URL', url, err);
            return url;
          }
        };
        const typeList = await Promise.all(
          typeSnap.docs.map(async (d) => {
            const data = d.data();
            const iconUrl = await resolveUrl(data.iconUrl);
            let iconUrls = data.iconUrls;
            if (Array.isArray(iconUrls)) {
              iconUrls = await Promise.all(iconUrls.map(resolveUrl));
            }
            return { id: d.id, ...data, iconUrl, iconUrls };
          })
        );
        setTypes(typeList);
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        const list = compSnap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, selectionMode: data.selectionMode || 'dropdown' };
        });
        list.push({
          id: 'brand',
          key: 'brand',
          label: 'Brand',
          selectionMode: 'brand',
          attributes: [
            { label: 'Name', key: 'name', inputType: 'text' },
            { label: 'Tone of Voice', key: 'toneOfVoice', inputType: 'text' },
            { label: 'Offering', key: 'offering', inputType: 'text' },
          ],
        });
        list.push({
          id: 'product',
          key: 'product',
          label: 'Product',
          selectionMode: 'checklist',
          attributes: [
            { label: 'Name', key: 'name', inputType: 'text' },
            { label: 'Description', key: 'description', inputType: 'list' },
            { label: 'Benefits', key: 'benefits', inputType: 'list' },
          ],
        });
        list.push({
          id: 'campaign',
          key: 'campaign',
          label: 'Campaign',
          selectionMode: 'dropdown',
          attributes: [
            { label: 'Name', key: 'name', inputType: 'text' },
            { label: 'Details', key: 'details', inputType: 'list' },
          ],
        });
        setComponents(list);
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const brandSnap = await getDocs(collection(db, 'brands'));
        let brandList = brandSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (Array.isArray(allowedBrandCodes) && allowedBrandCodes.length > 0) {
          brandList = brandList.filter((b) => allowedBrandCodes.includes(b.code));
        }
        setBrands(brandList);
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    fetchData();
  }, [externalOnly]);

  useEffect(() => {
    if (initialResults && Array.isArray(initialResults)) {
      const mapped = initialResults.map((r, idx) => ({ recipeNo: idx + 1, ...r }));
      setResults(mapped);
      originalResultsRef.current = mapped;
      if (initialResults[0]?.type) {
        setSelectedType(initialResults[0].type);
        setStep(2);
      }
      if (initialResults[0]?.brandCode) {
        setBrandCode(initialResults[0].brandCode);
      }
    }
  }, [initialResults]);

  useEffect(() => {
    if (initialBrandCode) {
      setBrandCode(initialBrandCode);
    }
  }, [initialBrandCode]);

  useEffect(() => {
    if (originalResultsRef.current.length === 0) {
      setDirty(results.length > 0);
    } else {
      setDirty(
        JSON.stringify(originalResultsRef.current) !== JSON.stringify(results),
      );
    }
  }, [results]);


  const loadAssetLibrary = async () => {
    try {
      let rows = [];
      let q = collection(db, 'adAssets');
      if (brandCode) q = query(q, where('brandCode', '==', brandCode));
      const tryQuery = async (qr) => {
        const snap = await getDocs(qr);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      };

      rows = await tryQuery(q);
      if (rows.length === 0) return;
      setAssetRows(rows);
      setAssetFilter('');
      const map = {};
      (currentType?.assetMatchFields || []).forEach((fKey) => {
        map[fKey] = { header: fKey, score: 10 };
      });
      map.imageUrl = { header: 'url', score: 10 };
      map.imageName = { header: 'name', score: 10 };
      map.thumbnailUrl = { header: 'thumbnailUrl' };
      map.context = { header: 'description' };
      map.assetType = { header: 'type' };
      setAssetMap(map);
      const idField = map.imageName?.header || map.imageUrl?.header || '';
      const usage = {};
      rows.forEach((r) => {
        const id = r[idField] || r.imageUrl || r.imageName || '';
        if (id) usage[id] = 0;
      });
      setAssetUsage(usage);
      debugLog('Asset library loaded', { rowsSample: rows.slice(0, 2), map });
    } catch (err) {
      console.error('Failed to load asset library', err);
    }
  };

  useEffect(() => {
    if (brandCode && currentType?.enableAssetCsv) {
      loadAssetLibrary();
    } else if (!brandCode) {
      setAssetRows([]);
      setAssetMap({});
      setAssetUsage({});
    }
  }, [brandCode, currentType]);

  const generateOnce = async (baseValues = null, brand = brandCode) => {
    if (!currentType) return null;

    let prompt = currentType.gptPrompt || '';
    prompt = prompt.replace(/{{brandCode}}/g, brand);
    const mergedForm = baseValues ? { ...baseValues } : { ...formData };
    const componentsData = {};
    for (const c of orderedComponents) {
      if (c.key === 'brand') {
        let b = brands.find((br) => br.code === brand);
        if (!b && brand) {
          try {
            const q = query(collection(db, 'brands'), where('code', '==', brand));
            const snap = await getDocs(q);
            if (!snap.empty) {
              b = { id: snap.docs[0].id, ...snap.docs[0].data() };
              setBrands((prev) => {
                const exists = prev.some((br) => br.code === brand);
                return exists ? prev.map((br) => (br.code === brand ? b : br)) : [...prev, b];
              });
            }
          } catch (err) {
            console.error('Failed to fetch brand', err);
          }
        }
        const brandData = b || {};
        c.attributes?.forEach((a) => {
          const val = brandData[a.key] || '';
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      } else if (baseValues) {
        c.attributes?.forEach((a) => {
          const val = mergedForm[`${c.key}.${a.key}`] || '';
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      } else {
        const instOptions = allInstances.filter(
          (i) =>
            i.componentKey === c.key &&
            (!i.relationships?.brandCode || i.relationships.brandCode === brand)
        );
        let selectedInst = null;
        if (c.selectionMode === 'random') {
          if (instOptions.length > 0) {
            selectedInst = instOptions[Math.floor(Math.random() * instOptions.length)];
          }
        } else if (c.selectionMode === 'checklist') {
          const ids =
            selectedInstances[c.key] !== undefined
              ? selectedInstances[c.key]
              : instOptions.map((i) => i.id);
          const opts = ids
            .map((id) => instOptions.find((i) => i.id === id))
            .filter(Boolean);
          if (opts.length > 0) {
            selectedInst = opts[Math.floor(Math.random() * opts.length)];
          }
        } else {
          const id = selectedInstances[c.key];
          const inst = instOptions.find((i) => i.id === id);
          if (inst) selectedInst = inst;
        }
        c.attributes?.forEach((a) => {
          let val = '';
          if (selectedInst) {
            val = selectedInst.values?.[a.key] || '';
          } else {
            val = mergedForm[`${c.key}.${a.key}`] || '';
          }
          if (!baseValues) {
            if (a.inputType === 'list') {
              val = selectRandomOption(val);
            } else if (Array.isArray(val)) {
              val = selectRandomOption(val);
            }
          }
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      }
    }
    const writeFields = currentType.writeInFields || [];
    writeFields.forEach((f) => {
      let val = mergedForm[f.key];
      if (!baseValues) {
        if (f.inputType === 'list') {
          val = selectRandomOption(val);
        } else if (Array.isArray(val)) {
          val = selectRandomOption(val);
        } else if (val === undefined) {
          val = '';
        }
      } else if (val === undefined) {
        val = '';
      }
      componentsData[f.key] = val;
      const regex = new RegExp(`{{${f.key}}}`, 'g');
      prompt = prompt.replace(regex, val);
    });

    const review =
      reviewRows.length > 0
        ? reviewRows[Math.floor(Math.random() * reviewRows.length)]
        : { name: '', body: '', title: '', rating: '', product: '' };
    componentsData['review.name'] = review.name || '';
    componentsData['review.body'] = review.body || '';
    componentsData['review.title'] = review.title || '';
    componentsData['review.rating'] = review.rating || '';
    componentsData['review.product'] = review.product || '';
    prompt = prompt.replace(/{{review\.name}}/g, review.name || '');
    prompt = prompt.replace(/{{review\.body}}/g, review.body || '');
    prompt = prompt.replace(/{{review\.title}}/g, review.title || '');
    prompt = prompt.replace(/{{review\.rating}}/g, review.rating || '');
    prompt = prompt.replace(/{{review\.product}}/g, review.product || '');

    const sectionCounts = {};
    Object.entries(componentsData).forEach(([k, v]) => {
      const m = k.match(/^(.+)\.(assetNo|assetCount)$/);
      if (m) {
        const n = parseInt(v, 10);
        if (n > 0) sectionCounts[m[1]] = n;
      }
    });
    const assetCount = Object.keys(sectionCounts).length > 0
      ? Object.values(sectionCounts).reduce((a, b) => a + b, 0)
      :
        parseInt(componentsData['layout.assetNo'], 10) ||
        parseInt(componentsData['layout.assetCount'], 10) ||
        0;

    const productName = componentsData['product.name'] || '';
    const rowsForProduct = productName
      ? filteredAssetRows.filter((r) => {
          const p = r.product;
          return Array.isArray(p) ? p.includes(productName) : p === productName;
        })
      : filteredAssetRows;

    const findBestAsset = (rowsList, usageMap = assetUsage, typeFilter = null) => {
      debugLog('Searching best asset', {
        rows: rowsList.length,
        map: assetMap,
      });
      let bestScore = 0;
      let bestRows = [];
      const rows = typeFilter && assetMap.assetType?.header
        ? rowsList.filter(
            (r) =>
              normalizeAssetType(r[assetMap.assetType.header]) ===
              normalizeAssetType(typeFilter),
          )
        : rowsList;
      rows.forEach((row, idx) => {
        let score = 0;
        const details = {};
        const matchFields = currentType.assetMatchFields || [];
        matchFields.forEach((field) => {
          const mapping = assetMap[field];
          if (!mapping || !mapping.header) return;
          const rowVal = row[mapping.header];
          if (rowVal === undefined) return;
          const recipeVal = componentsData[field] || '';
          const sim = similarityScore(recipeVal, rowVal);
          details[field] = {
            recipeVal,
            rowVal,
            sim,
            threshold: mapping.score || 10,
          };
          if (sim >= (mapping.score || 10)) {
            score += 1;
          }
        });
        debugLog('Asset row', idx, { score, details });
        if (score > bestScore) {
          bestScore = score;
          bestRows = [row];
        } else if (score === bestScore) {
          bestRows.push(row);
        }
      });
      if (bestRows.length === 0) {
        debugLog('Best asset result', { best: null, bestScore });
        return null;
      }
      const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
      let minUsage = Infinity;
      bestRows.forEach((row) => {
        const id = row[idField] || row.imageUrl || row.imageName || '';
        const usage = usageMap[id] || 0;
        if (usage < minUsage) minUsage = usage;
      });
      const lowUsageRows = bestRows.filter((row) => {
        const id = row[idField] || row.imageUrl || row.imageName || '';
        return (usageMap[id] || 0) === minUsage;
      });
      const chosen = lowUsageRows[Math.floor(Math.random() * lowUsageRows.length)];
      debugLog('Best asset result', { best: chosen, bestScore, minUsage });
      return chosen;
    };

    const findRelatedAsset = (rowsList, contextTags, mainId, usageMap, typeFilter = null) => {
      if (!contextTags || contextTags.size === 0) return null;
      let bestScore = 0;
      let bestRows = [];
      const rows = typeFilter && assetMap.assetType?.header
        ? rowsList.filter(
            (r) =>
              normalizeAssetType(r[assetMap.assetType.header]) ===
              normalizeAssetType(typeFilter),
          )
        : rowsList;
      rows.forEach((row) => {
        const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
        const rowId = row[idField] || row.imageUrl || row.imageName || '';
        if (!rowId || rowId === mainId) return;
        const ctxField = assetMap.context?.header || '';
        const rowTags = new Set(parseTags(row[ctxField] || ''));
        let score = 0;
        contextTags.forEach((t) => {
          if (rowTags.has(t)) score += 1;
        });
        if (score > bestScore) {
          bestScore = score;
          bestRows = [row];
        } else if (score === bestScore) {
          bestRows.push(row);
        }
      });
      if (bestRows.length === 0) return null;
      const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
      let minUsage = Infinity;
      bestRows.forEach((row) => {
        const id = row[idField] || row.imageUrl || row.imageName || '';
        const usage = usageMap[id] || 0;
        if (usage < minUsage) minUsage = usage;
      });
      const lowUsageRows = bestRows.filter((row) => {
        const id = row[idField] || row.imageUrl || row.imageName || '';
        return (usageMap[id] || 0) === minUsage;
      });
      return lowUsageRows[Math.floor(Math.random() * lowUsageRows.length)];
    };

    const parseTags = (str) => parseContextTags(str);

    const selectAssets = (rowsList, count, typeFilter, usageCopy) => {
      const arr = [];
      let context = '';
      if (count > 0) {
        const mainMatch = findBestAsset(rowsList, usageCopy, typeFilter);
        let mainId = '';
        if (mainMatch) {
          const urlField = assetMap.imageUrl?.header || 'imageUrl';
          const nameField = assetMap.imageName?.header || 'imageName';
          const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
          const contextField = assetMap.context?.header || '';
          const url = mainMatch[urlField] || mainMatch.imageUrl || mainMatch.url || '';
          const name = mainMatch[nameField] || mainMatch.imageName || mainMatch.filename || url;
          mainId = mainMatch[idField] || mainMatch.imageUrl || mainMatch.imageName || '';
          context = mainMatch[contextField] || '';
          if (mainId) usageCopy[mainId] = (usageCopy[mainId] || 0) + 1;
          if (url) {
            const typeField = assetMap.assetType?.header || '';
            const atypeRaw = typeField ? mainMatch[typeField] : '';
            const atype = normalizeAssetType(atypeRaw);
            arr.push({
              id: name,
              adUrl: url,
              assetType: atype,
              thumbnailUrl: mainMatch.thumbnailUrl || '',
            });
          } else {
            arr.push({ needAsset: true });
          }
        } else {
          arr.push({ needAsset: true });
        }

        const contextTags = new Set(parseTags(context));
        for (let i = 1; i < count; i += 1) {
          const match = findRelatedAsset(rowsList, contextTags, mainId, usageCopy, typeFilter);
          if (match) {
            const urlField = assetMap.imageUrl?.header || 'imageUrl';
            const nameField = assetMap.imageName?.header || 'imageName';
            const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
            const url = match[urlField] || match.imageUrl || match.url || '';
            const name = match[nameField] || match.imageName || match.filename || url;
            const assetId = match[idField] || match.imageUrl || match.imageName || '';
            if (assetId) usageCopy[assetId] = (usageCopy[assetId] || 0) + 1;
            if (url) {
              const typeField = assetMap.assetType?.header || '';
              const atypeRaw = typeField ? match[typeField] : '';
              const atype = normalizeAssetType(atypeRaw);
              arr.push({
                id: name,
                adUrl: url,
                assetType: atype,
                thumbnailUrl: match.thumbnailUrl || '',
              });
            } else {
              arr.push({ needAsset: true });
            }
          } else {
            arr.push({ needAsset: true });
          }
        }
      }
      while (arr.length < count) arr.push({ needAsset: true });
      return { assets: arr, context };
    };

    const selectedAssets = [];
    let csvContext = '';
    if (assetCount > 0) {
      const usageCopy = { ...assetUsage };
        if (Object.keys(sectionCounts).length > 0) {
          Object.entries(sectionCounts).forEach(([sec, cnt]) => {
            const typeFilter = (componentsData[`${sec}.assetType`] || '').trim();
            const { assets: arr, context } = selectAssets(rowsForProduct, cnt, typeFilter, usageCopy);
            if (!csvContext) csvContext = context;
            selectedAssets.push(...arr);
            componentsData[`${sec}.assets`] = arr.slice();
          });
        } else {
          const { assets: arr, context } = selectAssets(rowsForProduct, assetCount, null, usageCopy);
        csvContext = context;
        selectedAssets.push(...arr);
      }
      setAssetUsage(usageCopy);
    }
    while (selectedAssets.length < assetCount) {
      selectedAssets.push({ needAsset: true });
    }

    prompt = prompt.replace(/{{csv\.context}}/g, csvContext);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('OpenAI API error', data);
        return null;
      }
      const text = data.choices?.[0]?.message?.content?.trim() || 'No result';
      const result = {
        type: selectedType,
        brandCode: brand,
        components: componentsData,
        copy: text,
        assets: selectedAssets.slice(),
      };
      while (result.assets.length < assetCount) {
        result.assets.push({ needAsset: true });
      }
      return result;
    } catch (err) {
      console.error('Failed to call OpenAI', err);
      return null;
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    const times = Number(generateCount) || 1;
    for (let i = 0; i < times; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await generateOnce(null, brandCode);
      if (res) {
        setResults((prev) => [
          ...prev,
          { recipeNo: prev.length + 1, ...res, type: selectedType },
        ]);
      }
    }
  };


  const updateComponentValue = (rowIdx, compKey, attrKey, val) => {
    const arr = [...results];
    arr[rowIdx].components[`${compKey}.${attrKey}`] = val;
    const matched = allInstances.find(
      (inst) =>
        inst.componentKey === compKey &&
        inst.values?.[attrKey] === val &&
        (!inst.relationships?.brandCode || inst.relationships.brandCode === brandCode)
    );
    if (matched) {
      Object.entries(matched.values || {}).forEach(([k, v]) => {
        arr[rowIdx].components[`${compKey}.${k}`] = v;
      });
    }
    setResults(arr);
  };

  const addRecipeRow = () => {
    const blank = {};
    columnMeta.forEach((c) => {
      blank[c.key] = c.key.endsWith('.assets') ? [] : '';
    });
    setResults((prev) => [
      ...prev,
      { recipeNo: prev.length + 1, components: blank, copy: '', assets: [] },
    ]);
  };

  const [editing, setEditing] = useState(null);
  const [editCopy, setEditCopy] = useState('');
  const [editComponents, setEditComponents] = useState({});
  const [assetPicker, setAssetPicker] = useState(null); // { rowIdx, key, assetIdx, product }

  const handleEditRow = (idx) => {
    if (editing === idx) {
      const arr = [...results];
      arr[idx].copy = editCopy;
      arr[idx].components = { ...editComponents };
      setResults(arr);
      setEditing(null);
    } else {
      setEditing(idx);
      setEditCopy(results[idx].copy);
      setEditComponents({ ...results[idx].components });
    }
  };

  const handleDeleteRow = (idx) => {
    setResults((prev) =>
      prev.filter((_, i) => i !== idx).map((r, i2) => ({ ...r, recipeNo: i2 + 1 }))
    );
  };

  const handleChangeInstance = (compKey, instId) => {
    const inst = allInstances.find(
        (i) =>
          i.componentKey === compKey &&
          i.id === instId &&
          (!i.relationships?.brandCode || i.relationships.brandCode === brandCode),
      );
    if (!inst) return;
    const updated = { ...editComponents };
    Object.entries(inst.values || {}).forEach(([k, v]) => {
      updated[`${compKey}.${k}`] = v;
    });
    setEditComponents(updated);
  };

  const handleAssetSelect = (asset) => {
    if (!assetPicker) return;
    const { rowIdx, key, assetIdx } = assetPicker;
    const arr = [...results];
    const row = { ...arr[rowIdx] };
    const comps = { ...row.components };
    const list = Array.isArray(comps[key]) ? comps[key].slice() : [];
    list[assetIdx] = {
      id: asset.name || asset.filename || asset.url || asset.firebaseUrl,
      adUrl: asset.url || asset.firebaseUrl,
      assetType: normalizeAssetType(asset.type || asset.assetType),
      thumbnailUrl: asset.thumbnailUrl || asset.firebaseUrl || '',
    };
    comps[key] = list;
    row.components = comps;
    arr[rowIdx] = row;
    setResults(arr);
    if (editing === rowIdx) {
      const ec = { ...editComponents };
      const elist = Array.isArray(ec[key]) ? ec[key].slice() : [];
      elist[assetIdx] = list[assetIdx];
      ec[key] = elist;
      setEditComponents(ec);
    }
    setAssetPicker(null);
  };

  const handleAssetRemove = (rowIdx, key, assetIdx) => {
    const arr = [...results];
    const row = { ...arr[rowIdx] };
    const comps = { ...row.components };
    const list = Array.isArray(comps[key]) ? comps[key].slice() : [];
    const baseKey = key.replace(/\.assets$/, '');
    const required =
      parseInt(row.components[`${baseKey}.assetNo`], 10) ||
      parseInt(row.components[`${baseKey}.assetCount`], 10) ||
      0;
    if (assetIdx >= required) {
      list.splice(assetIdx, 1);
    } else {
      list[assetIdx] = { needAsset: true };
    }
    comps[key] = list;
    row.components = comps;
    arr[rowIdx] = row;
    setResults(arr);
    if (editing === rowIdx) {
      const ec = { ...editComponents };
      const elist = Array.isArray(ec[key]) ? ec[key].slice() : [];
      if (assetIdx >= required) {
        elist.splice(assetIdx, 1);
      } else {
        elist[assetIdx] = list[assetIdx];
      }
      ec[key] = elist;
      setEditComponents(ec);
    }
  };

  const handleAddAsset = (rowIdx, key) => {
    const arr = [...results];
    const row = { ...arr[rowIdx] };
    const comps = { ...row.components };
    const list = Array.isArray(comps[key]) ? comps[key].slice() : [];
    list.push({ needAsset: true });
    comps[key] = list;
    row.components = comps;
    arr[rowIdx] = row;
    setResults(arr);
    if (editing === rowIdx) {
      const ec = { ...editComponents };
      const elist = Array.isArray(ec[key]) ? ec[key].slice() : [];
      elist.push({ needAsset: true });
      ec[key] = elist;
      setEditComponents(ec);
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    if (!title?.trim()) {
      window.alert('Please enter a title before saving.');
      return;
    }
    setSaving(true);
    try {
      await onSave(results, briefNote, briefFiles);
      originalResultsRef.current = results;
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setResults(originalResultsRef.current.map((r) => ({ ...r })));
    setBriefNote('');
    setBriefFiles([]);
    setDirty(false);
  };

  const renderAssetList = (list = [], rowIdx = null, key = '') => (
    <div className="flex justify-center gap-1">
      {list && list.length > 0 ? (
        list.map((a, i) =>
          a.needAsset ? (
            <button
              key={`na-${i}`}
              type="button"
              onClick={() =>
                setAssetPicker({
                  rowIdx,
                  key,
                  assetIdx: i,
                  product: results[rowIdx]?.components['product.name'] || '',
                })
              }
              className="text-red-500 text-xs underline"
            >
              Need asset
            </button>
          ) : (
            <span key={a.id} className="relative inline-block group">
              <button
                type="button"
                onClick={() =>
                  userRole === 'admin' && editing === rowIdx
                    ? setAssetPicker({
                        rowIdx,
                        key,
                        assetIdx: i,
                        product:
                          results[rowIdx]?.components['product.name'] || '',
                      })
                    : window.open(a.adUrl || a.firebaseUrl, '_blank')
                }
                aria-label="Asset"
                className={`p-2 text-xl rounded inline-flex items-center justify-center ${
                  (a.assetType || '').toLowerCase() === 'video'
                    ? ''
                    : 'bg-accent-10 text-accent'
                }`}
                style={
                  (a.assetType || '').toLowerCase() === 'video' ||
                  isVideoUrl(a.thumbnailUrl || a.adUrl || a.firebaseUrl)
                    ? { backgroundColor: 'rgba(0,17,255,0.1)', color: '#0011FF' }
                    : {}
                }
              >
                {(a.assetType || '').toLowerCase() === 'video' ||
                isVideoUrl(a.thumbnailUrl || a.adUrl || a.firebaseUrl) ? (
                  <FiVideo />
                ) : (
                  <FiImage />
                )}
              </button>
              {userRole === 'admin' && editing === rowIdx && (
                <button
                  type="button"
                  onClick={() => handleAssetRemove(rowIdx, key, i)}
                  className="absolute -top-1 -right-1 bg-white rounded-full text-red-600 hover:text-red-800"
                  aria-label="Remove Asset"
                >
                  <FiX />
                </button>
              )}
              <HoverPreview
                placement="left"
                offset={50}
                preview={
                  <img
                    src={a.thumbnailUrl || a.adUrl || a.firebaseUrl}
                    alt="preview"
                    className="object-contain max-h-[25rem] w-auto"
                  />
                }
              />
            </span>
          )
        )
      ) : (
        '-'
      )}
      {userRole === 'admin' && editing === rowIdx && (
        <button
          type="button"
          onClick={() => handleAddAsset(rowIdx, key)}
          className="btn-secondary px-1.5 py-0.5 text-xs flex items-center"
          aria-label="Add Asset"
        >
          <FiPlus />
        </button>
      )}
    </div>
  );

  const handleRefreshRow = async (idx) => {
    const base = results[idx].components;
    const refreshed = await generateOnce(base, brandCode);
    if (refreshed) {
      const arr = [...results];
      arr[idx] = { ...arr[idx], ...refreshed };
      setResults(arr);
    }
  };

  useEffect(() => {
    if (!currentType?.enableAssetCsv) {
      setAssetRows([]);
      setAssetMap({});
    }
  }, [currentType]);
  const compMap = useMemo(
    () => Object.fromEntries(components.map((c) => [c.key, c])),
    [components],
  );
  const orderedComponents = useMemo(
    () =>
      currentType?.components?.length
        ? currentType.components.map((k) => compMap[k]).filter(Boolean)
        : components,
    [currentType, compMap, components],
  );
  const displayedComponents = useMemo(
    () =>
      externalOnly && currentType?.clientFormComponents?.length
        ? currentType.clientFormComponents.map((k) => compMap[k]).filter(Boolean)
        : orderedComponents,
    [externalOnly, currentType, compMap, orderedComponents],
  );
  const writeFields = useMemo(
    () => currentType?.writeInFields || [],
    [currentType],
  );
  const columnMeta = useMemo(() => {
    const cols = [];
    const assetCols = [];
    if (orderedComponents.length > 0) {
      orderedComponents.forEach((c) => {
        c.attributes?.forEach((a) => {
          cols.push({ key: `${c.key}.${a.key}`, label: `${c.label} - ${a.label}`, inputType: a.inputType || 'text' });
          if (a.key === 'assetNo' || a.key === 'assetCount') {
            assetCols.push({ key: `${c.key}.assets`, label: `${c.label} Assets` });
          }
        });
      });
      writeFields.forEach((f) => {
        cols.push({
          key: f.key,
          label: f.label,
          inputType: f.inputType || 'text',
        });
      });
      assetCols.forEach((c) => cols.push(c));
      cols.push({ key: 'review.name', label: 'Review - Name' });
      cols.push({ key: 'review.body', label: 'Review - Body' });
      cols.push({ key: 'review.title', label: 'Review - Title' });
      cols.push({ key: 'review.rating', label: 'Review - Rating' });
      cols.push({ key: 'review.product', label: 'Review - Product' });
    } else if (initialResults && initialResults.length > 0) {
      const keys = Array.from(
        new Set(initialResults.flatMap((r) => Object.keys(r.components || {})))
      );
      keys.forEach((k) => {
        cols.push({ key: k, label: k, inputType: 'text' });
      });
    }

    if (externalOnly && currentType?.clientVisibleColumns && currentType.clientVisibleColumns.length > 0) {
      const order = currentType.clientVisibleColumns;
      cols.sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    } else if (currentType?.defaultColumns && currentType.defaultColumns.length > 0) {
      const order = currentType.defaultColumns;
      cols.sort((a, b) => {
        const ai = order.indexOf(a.key);
        const bi = order.indexOf(b.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }

    return cols;
  }, [orderedComponents, writeFields, initialResults, currentType, externalOnly]);

  useEffect(() => {
    setVisibleColumns((prev) => {
      const updated = { ...prev };
      const addKey = (key) => {
        if (!(key in updated)) {
          let show = false;
          if (externalOnly && currentType?.clientVisibleColumns && currentType.clientVisibleColumns.length > 0) {
            show = currentType.clientVisibleColumns.includes(key);
          } else if (currentType?.defaultColumns && currentType.defaultColumns.length > 0) {
            show = currentType.defaultColumns.includes(key);
          } else if (!showColumnButton) {
            show = true;
          }
          updated[key] = show;
        }
      };
      addKey('recipeNo');
      columnMeta.forEach((c) => addKey(c.key));
      addKey('copy');
      Object.keys(updated).forEach((k) => {
        if (!(columnMeta.some((c) => c.key === k) || k === 'recipeNo' || k === 'copy')) {
          delete updated[k];
        }
      });
      return updated;
    });
  }, [columnMeta, currentType, showColumnButton, externalOnly]);

  return (
    <div>
      {!showOnlyResults && (
        <form onSubmit={handleGenerate} className="space-y-2 max-w-[50rem]">
        {step === 1 && (
          <BriefStepSelect
            hideBrandSelect={hideBrandSelect}
            brands={brands}
            brandCode={brandCode}
            setBrandCode={setBrandCode}
            onBrandCodeChange={onBrandCodeChange}
            types={types}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            setStep={setStep}
          />
        )}
        {step === 2 && (
          <BriefStepForm
            onBack={() => {
              setStep(1);
              setSelectedType('');
              setResults([]);
              setDirty(false);
            }}
            currentType={currentType}
            onTitleChange={onTitleChange}
            title={title}
            assetRows={assetRows}
            filteredAssetRows={filteredAssetRows}
            setShowTagger={setShowTagger}
            assetFilter={assetFilter}
            setAssetFilter={setAssetFilter}
            showBriefExtras={showBriefExtras}
            briefNote={briefNote}
            handleBriefNoteChange={handleBriefNoteChange}
            briefFiles={briefFiles}
            briefFileInputRef={briefFileInputRef}
            handleBriefFilesChange={handleBriefFilesChange}
            displayedComponents={displayedComponents}
            allInstances={allInstances}
            brandCode={brandCode}
            selectedInstances={selectedInstances}
            setSelectedInstances={setSelectedInstances}
            showOptionLists={showOptionLists}
            setShowOptionLists={setShowOptionLists}
            showProductModal={showProductModal}
            setShowProductModal={setShowProductModal}
            showImportModal={showImportModal}
            setShowImportModal={setShowImportModal}
            brandProducts={brandProducts}
            setBrandProducts={setBrandProducts}
            formData={formData}
            setFormData={setFormData}
            writeFields={writeFields}
            generateCount={generateCount}
            setGenerateCount={setGenerateCount}
          />
        )}
      </form>
      )}
      <div className="overflow-x-auto table-container mt-6">
        <PageToolbar
          left={
            results.length > 0 && showColumnButton ? (
              <TabButton onClick={() => setShowColumnMenu(true)} aria-label="Columns">
                <FiColumns />
              </TabButton>
            ) : null
          }
          right={
            <>
              {userRole !== 'designer' && onRecipesClick && (
                <IconButton
                  onClick={onRecipesClick}
                  aria-label={results.length > 0 ? 'Replace Recipes' : 'Recipes'}
                >
                  <FaMagic />
                </IconButton>
              )}
              {results.length > 0 && userRole !== 'designer' && (
                <IconButton onClick={addRecipeRow} aria-label="Add Recipe Row">
                  <FiPlus />
                </IconButton>
              )}
            </>
          }
        />
        {results.length > 0 && showColumnMenu && showColumnButton && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
            onClick={() => setShowColumnMenu(false)}
          >
            <div
              className="bg-white p-4 rounded shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 font-semibold">Visible Columns</h3>
                <label className="block whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={visibleColumns['recipeNo'] || false}
                    onChange={() =>
                      setVisibleColumns({
                        ...visibleColumns,
                        recipeNo: !visibleColumns['recipeNo'],
                      })
                    }
                  />
                  Recipe #
                </label>
                {columnMeta.map((c) => (
                  <label key={c.key} className="block whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={visibleColumns[c.key] || false}
                      onChange={() =>
                        setVisibleColumns({
                          ...visibleColumns,
                          [c.key]: !visibleColumns[c.key],
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <label className="block whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={visibleColumns['copy'] || false}
                    onChange={() =>
                      setVisibleColumns({
                        ...visibleColumns,
                        copy: !visibleColumns['copy'],
                      })
                    }
                  />
                  Copy
                </label>
                <div className="text-right mt-2">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1"
                    onClick={() => setShowColumnMenu(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        {results.length > 0 && (
          <table className="ad-table min-w-full table-auto text-sm">
            <thead>
              <tr>
                {visibleColumns['recipeNo'] && <th>Recipe #</th>}
                {columnMeta.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th key={col.key}>{col.label}</th>
                    )
                )}
                {visibleColumns['copy'] && <th className="w-80">Copy</th>}
                <th className="text-center">{canEditRecipes ? 'Actions' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx} className={userRole === 'designer' && r.selected ? 'designer-selected' : ''}>
                  {visibleColumns['recipeNo'] && (
                    <td className="text-center align-middle font-bold">{r.recipeNo}</td>
                  )}
                  {columnMeta.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <td
                          key={col.key}
                          className={`align-middle ${
                            col.key === 'product.name'
                              ? 'max-w-[20ch] truncate'
                              : ''
                          }`}
                          style={
                            col.key.endsWith('.assets')
                              ? { overflow: 'visible' }
                              : undefined
                          }
                        >
                          {col.key.endsWith('.assets') ? (
                            renderAssetList(
                              editing === idx
                                ? editComponents[col.key] || []
                                : r.components[col.key] || [],
                              idx,
                              col.key,
                            )
                          ) : (
                            <React.Fragment>
                              {editing === idx && col.key.includes('.') ? (
                                <select
                                  className="p-1 border rounded mb-1"
                                  onChange={(e) =>
                                    handleChangeInstance(col.key.split('.')[0], e.target.value)
                                  }
                                >
                                  <option value="">Select...</option>
                                  {allInstances
                                    .filter(
                                      (i) =>
                                        i.componentKey === col.key.split('.')[0] &&
                                        (!i.relationships?.brandCode || i.relationships.brandCode === brandCode),
                                    )
                                    .map((inst) => (
                                      <option key={inst.id} value={inst.id}>
                                        {inst.name}
                                      </option>
                                    ))}
                                </select>
                              ) : null}
                              {editing === idx && !col.key.includes('.') ? (
                                col.inputType === 'textarea' ? (
                                  <textarea
                                    className="p-1 border rounded mb-1 w-full"
                                    value={editComponents[col.key] || ''}
                                    onChange={(e) =>
                                      setEditComponents({
                                        ...editComponents,
                                        [col.key]: e.target.value,
                                      })
                                    }
                                  />
                                ) : col.inputType === 'list' ? (
                                  <TagInput
                                    id={`edit-${col.key}`}
                                    value={editComponents[col.key] || []}
                                    onChange={(arr) =>
                                      setEditComponents({
                                        ...editComponents,
                                        [col.key]: arr,
                                      })
                                    }
                                  />
                                ) : (
                                  <input
                                    className="p-1 border rounded mb-1 w-full"
                                    type={col.inputType || 'text'}
                                    value={editComponents[col.key] || ''}
                                    onChange={(e) =>
                                      setEditComponents({
                                        ...editComponents,
                                        [col.key]: e.target.value,
                                      })
                                    }
                                  />
                                )
                              ) : col.inputType === 'image' ? (
                                (editing === idx ? editComponents[col.key] : r.components[col.key]) ? (
                                  <img
                                    src={editing === idx ? editComponents[col.key] : r.components[col.key]}
                                    alt={col.label}
                                    className="max-w-[125px] w-auto h-auto"
                                  />
                                ) : null
                              ) : (
                                editing === idx
                                  ? editComponents[col.key]
                                  : isUrl(r.components[col.key]?.toString().trim()) ? (
                                      <a
                                        href={r.components[col.key]}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <FiLink />
                                      </a>
                                    ) : (
                                      r.components[col.key]
                                    )
                              )}
                            </React.Fragment>
                          )}
                       </td>
                     )
                  )}
                  {visibleColumns['copy'] && (
                    <td className="whitespace-pre-wrap break-words w-80 align-middle copy-cell">
                      {editing === idx ? (
                        <textarea
                          className="w-full p-1 border rounded"
                          value={editCopy}
                          onChange={(e) => setEditCopy(e.target.value)}
                        />
                      ) : (
                        <div
                          className="min-h-[1.5rem] w-full"
                          onClick={() => navigator.clipboard.writeText(r.copy)}
                        >
                          {isUrl(r.copy.trim()) ? (
                            <a href={r.copy.trim()} target="_blank" rel="noreferrer">
                              <FiLink />
                            </a>
                          ) : (
                            r.copy
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="text-center align-middle">
                    {canEditRecipes ? (
                      <div className="flex items-center justify-center gap-1">
                        <IconButton
                          onClick={() => handleEditRow(idx)}
                          aria-label={editing === idx ? 'Save' : 'Edit'}
                          className="p-0 flex-shrink-0"
                        >
                          {editing === idx ? <FiCheckSquare /> : <FiEdit2 />}
                        </IconButton>
                        <IconButton
                          onClick={() => handleRefreshRow(idx)}
                          aria-label="Refresh"
                          className="p-0 flex-shrink-0"
                        >
                          <FaMagic />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteRow(idx)}
                          aria-label="Delete"
                          className="p-0 flex-shrink-0 btn-delete"
                        >
                          <FiTrash />
                        </IconButton>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const arr = [...results];
                          arr[idx].selected = !arr[idx].selected;
                          setResults(arr);
                          if (onSelectChange) {
                            onSelectChange(arr[idx].recipeNo, arr[idx].selected);
                          }
                        }}
                        aria-label="Toggle Select"
                      >
                        {r.selected ? <FiCheckSquare /> : <FiSquare />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      )}
      {assetPicker && (
        <AssetPickerModal
          brandCode={brandCode}
          initialFilter={assetPicker?.product}
          onSelect={handleAssetSelect}
          onClose={() => setAssetPicker(null)}
        />
      )}
      {showTagger && (
        <TaggerModal
          brandCode={brandCode}
          onClose={() => {
            setShowTagger(false);
            loadAssetLibrary();
          }}
        />
      )}
    </div>
    {results.length > 0 && userRole !== 'designer' && onSave && (
      <div className="sticky bottom-0 bg-white dark:bg-[var(--dark-sidebar-bg)] p-2 pb-0 flex justify-between items-center">
        <button
          type="button"
          className="text-sm text-accent underline"
          onClick={handleReset}
          aria-label="Discard generated recipe changes"
        >
          Discard Changes
        </button>
        <SaveButton
          onClick={handleSave}
          canSave={dirty && !!title.trim()}
          loading={saving}
        />
      </div>
    )}
  </div>
);
};

export default RecipePreview;
