import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import {
  FiImage,
  FiVideo,
  FiCheckSquare,
  FiSquare,
  FiEdit2,
  FiTrash,
} from 'react-icons/fi';
import { FaMagic } from 'react-icons/fa';
import { auth } from './firebase/config';
import useUserRole from './useUserRole';
import TagChecklist from './components/TagChecklist.jsx';
import TagInput from './components/TagInput.jsx';
import { db } from './firebase/config';
import selectRandomOption from './utils/selectRandomOption.js';
import parseContextTags from './utils/parseContextTags.js';
import { splitCsvLine } from './utils/csv.js';
import debugLog from './utils/debugLog';

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

export const normalizeAssetType = (t) => {
  if (!t) return '';
  const type = t.toString().trim().toLowerCase();
  if (!type) return '';
  const imageKeywords = ['still', 'image', 'static', 'img', 'picture', 'photo'];
  const videoKeywords = ['motion', 'video', 'animated', 'gif'];
  if (imageKeywords.some((k) => type.includes(k))) {
    return 'image';
  }
  if (videoKeywords.some((k) => type.includes(k))) {
    return 'video';
  }
  return type;
};

const RecipePreview = ({ onSave = null, initialResults = null, showOnlyResults = false, onSelectChange = null }) => {
  const [types, setTypes] = useState([]);
  const [components, setComponents] = useState([]);
  const [instances, setInstances] = useState([]);
  const [brands, setBrands] = useState([]);
  const [brandCode, setBrandCode] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({});
  const [selectedInstances, setSelectedInstances] = useState({});
  const [results, setResults] = useState([]);
  const [generateCount, setGenerateCount] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [assetRows, setAssetRows] = useState([]);
  const [assetHeaders, setAssetHeaders] = useState([]);
  const [assetMap, setAssetMap] = useState({});
  const [assetUsage, setAssetUsage] = useState({});
  const { role: userRole } = useUserRole(auth.currentUser?.uid);
  const isAdminOrAgency = userRole === 'admin' || userRole === 'agency';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeSnap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
        setComponents(list);
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const brandSnap = await getDocs(collection(db, 'brands'));
        setBrands(brandSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (initialResults && Array.isArray(initialResults)) {
      setResults(initialResults.map((r, idx) => ({ recipeNo: idx + 1, ...r })));
      if (initialResults[0]?.type) {
        setSelectedType(initialResults[0].type);
      }
      if (initialResults[0]?.brandCode) {
        setBrandCode(initialResults[0].brandCode);
      }
    }
  }, [initialResults]);

  const handleAssetCsvChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      setAssetRows([]);
      setAssetHeaders([]);
      setAssetMap({});
      setAssetUsage({});
      return;
    }
    const text = await f.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) {
      setAssetRows([]);
      setAssetHeaders([]);
      setAssetMap({});
      setAssetUsage({});
      return;
    }
    const headers = splitCsvLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i]) continue;
      const parts = splitCsvLine(lines[i]).map((p) => p.trim());
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = parts[idx] || '';
      });
      rows.push(obj);
    }
    setAssetRows(rows);
    setAssetHeaders(headers);
    const map = {};
    (currentType?.assetMatchFields || []).forEach((fKey) => {
      map[fKey] = { header: headers.includes(fKey) ? fKey : '', score: 10 };
    });
    const urlHeader = headers.find((h) => /url/i.test(h));
    if (urlHeader) {
      map.imageUrl = { header: urlHeader, score: 10 };
    }
    const nameHeader = headers.find((h) => /(name|file)/i.test(h));
    if (nameHeader) {
      map.imageName = { header: nameHeader, score: 10 };
    }
    const contextHeader = headers.find((h) => /context/i.test(h));
    if (contextHeader) {
      map.context = { header: contextHeader };
    }
    const typeHeader = headers.find((h) => /asset.?type/i.test(h) || /^type$/i.test(h));
    if (typeHeader) {
      map.assetType = { header: typeHeader };
    }
    setAssetMap(map);
    const idField = map.imageName?.header || map.imageUrl?.header || '';
    const usage = {};
    rows.forEach((r) => {
      const id = r[idField] || r.imageUrl || r.imageName || '';
      if (id) usage[id] = 0;
    });
    setAssetUsage(usage);
    debugLog('Asset CSV loaded', { headers, rowsSample: rows.slice(0, 2), map });
  };

  const generateOnce = async (baseValues = null, brand = brandCode) => {
    if (!currentType) return null;

    let prompt = currentType.gptPrompt || '';
    prompt = prompt.replace(/{{brandCode}}/g, brand);
    const mergedForm = baseValues ? { ...baseValues } : { ...formData };
    const componentsData = {};
    orderedComponents.forEach((c) => {
      if (c.key === 'brand') {
        const b = brands.find((br) => br.code === brand) || {};
        c.attributes?.forEach((a) => {
          const val = b[a.key] || '';
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
        const instOptions = instances.filter(
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
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      }
    });
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

    const findBestAsset = (usageMap = assetUsage, typeFilter = null) => {
      debugLog('Searching best asset', {
        rows: assetRows.length,
        map: assetMap,
      });
      let bestScore = 0;
      let bestRows = [];
      const rows = typeFilter && assetMap.assetType?.header
        ? assetRows.filter(
            (r) =>
              normalizeAssetType(r[assetMap.assetType.header]) ===
              normalizeAssetType(typeFilter),
          )
        : assetRows;
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

    const findRelatedAsset = (contextTags, mainId, usageMap, typeFilter = null) => {
      if (!contextTags || contextTags.size === 0) return null;
      let bestScore = 0;
      let bestRows = [];
      const rows = typeFilter && assetMap.assetType?.header
        ? assetRows.filter(
            (r) =>
              normalizeAssetType(r[assetMap.assetType.header]) ===
              normalizeAssetType(typeFilter),
          )
        : assetRows;
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

    const selectAssets = (count, typeFilter, usageCopy) => {
      const arr = [];
      let context = '';
      if (count > 0) {
        const mainMatch = findBestAsset(usageCopy, typeFilter);
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
            arr.push({ id: name, adUrl: url, assetType: atype });
          } else {
            arr.push({ needAsset: true });
          }
        } else {
          arr.push({ needAsset: true });
        }

        const contextTags = new Set(parseTags(context));
        for (let i = 1; i < count; i += 1) {
          const match = findRelatedAsset(contextTags, mainId, usageCopy, typeFilter);
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
              arr.push({ id: name, adUrl: url, assetType: atype });
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
          const { assets: arr, context } = selectAssets(cnt, typeFilter, usageCopy);
          if (!csvContext) csvContext = context;
          selectedAssets.push(...arr);
          componentsData[`${sec}.assets`] = arr.slice();
        });
      } else {
        const { assets: arr, context } = selectAssets(assetCount, null, usageCopy);
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
    const matched = instances.find(
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
    const inst = instances.find(
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

  const renderAssetList = (list = []) => (
    <div className="flex justify-center gap-1">
      {list && list.length > 0 ? (
        list.map((a, i) =>
          a.needAsset ? (
            <span key={`na-${i}`} className="text-red-500 text-xs">Need asset</span>
          ) : (
            <span key={a.id} className="relative inline-block group">
              <a
                href={a.adUrl || a.firebaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 text-xl rounded inline-flex items-center justify-center ${
                  (a.assetType || '').toLowerCase() === 'video'
                    ? ''
                    : 'bg-accent-10 text-accent'
                }`}
                style={
                  (a.assetType || '').toLowerCase() === 'video'
                    ? { backgroundColor: 'rgba(0,17,255,0.1)', color: '#0011FF' }
                    : {}
                }
              >
                {(a.assetType || '').toLowerCase() === 'video' ? <FiVideo /> : <FiImage />}
              </a>
              <img
                src={a.adUrl || a.firebaseUrl}
                alt="preview"
                className="hidden group-hover:block absolute left-[-8rem] top-1/2 -translate-y-1/2 w-32 border shadow-lg z-10"
              />
            </span>
          )
        )
      ) : (
        '-'
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

  const currentType = types.find((t) => t.id === selectedType);
  useEffect(() => {
    if (!currentType?.enableAssetCsv) {
      setAssetRows([]);
      setAssetHeaders([]);
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
          cols.push({ key: `${c.key}.${a.key}`, label: `${c.label} - ${a.label}` });
          if (a.key === 'assetNo' || a.key === 'assetCount') {
            assetCols.push({ key: `${c.key}.assets`, label: `${c.label} Assets` });
          }
        });
      });
      writeFields.forEach((f) => {
        cols.push({ key: f.key, label: f.label });
      });
      assetCols.forEach((c) => cols.push(c));
    } else if (initialResults && initialResults.length > 0) {
      const keys = Array.from(
        new Set(initialResults.flatMap((r) => Object.keys(r.components || {})))
      );
      keys.forEach((k) => {
        cols.push({ key: k, label: k });
      });
    }

    if (currentType?.defaultColumns && currentType.defaultColumns.length > 0) {
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
  }, [orderedComponents, writeFields, initialResults, currentType]);

  useEffect(() => {
    setVisibleColumns((prev) => {
      const updated = { ...prev };
      columnMeta.forEach((c) => {
        if (!(c.key in updated)) {
          let show = false;
          if (currentType?.defaultColumns && currentType.defaultColumns.length > 0) {
            show = currentType.defaultColumns.includes(c.key);
          } else {
            const label = c.label.toLowerCase();
            show = label.includes('name') || label.includes('asset');
          }
          if (c.key.endsWith('.assets')) show = true;
          updated[c.key] = show;
        }
      });
      Object.keys(updated).forEach((k) => {
        if (!columnMeta.some((c) => c.key === k)) {
          delete updated[k];
        }
      });
      return updated;
    });
  }, [columnMeta, currentType]);

  return (
    <div>
      <h2 className="text-xl mb-2">Ad Recipe Generation</h2>
      {!showOnlyResults && (
        <form onSubmit={handleGenerate} className="space-y-2 max-w-[50rem]">
        <div>
          <label className="block text-sm mb-1">Recipe Type</label>
          <select className="w-full p-2 border rounded" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="">Select...</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Brand</label>
          <select
            className="w-full p-2 border rounded"
            value={brandCode}
            onChange={(e) => setBrandCode(e.target.value)}
          >
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.code}>
                {b.code} {b.name ? `- ${b.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        {currentType?.enableAssetCsv && (
          <div className="space-y-2">
            <div>
              <label className="block text-sm mb-1">Asset CSV</label>
              <input type="file" accept=".csv" onChange={handleAssetCsvChange} />
              {assetRows.length > 0 && (
                <p className="text-xs">{assetRows.length} rows loaded</p>
              )}
            </div>
            {assetHeaders.length > 0 && (
              <div className="space-y-1">
                {currentType.assetMatchFields?.map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <label className="text-xs w-28">{f}</label>
                    <select
                      className="p-1 border rounded flex-1"
                      value={assetMap[f]?.header || ''}
                      onChange={(e) =>
                        setAssetMap({
                          ...assetMap,
                          [f]: { ...assetMap[f], header: e.target.value },
                        })
                      }
                    >
                      <option value="">Select...</option>
                      {assetHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="w-16 p-1 border rounded"
                      value={assetMap[f]?.score || 10}
                      onChange={(e) =>
                        setAssetMap({
                          ...assetMap,
                          [f]: {
                            ...assetMap[f],
                            score: Math.min(
                              10,
                              Math.max(1, parseInt(e.target.value, 10) || 10)
                            ),
                          },
                        })
                      }
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <label className="text-xs w-28">context</label>
                  <select
                    className="p-1 border rounded flex-1"
                    value={assetMap.context?.header || ''}
                    onChange={(e) =>
                      setAssetMap({
                        ...assetMap,
                        context: { header: e.target.value },
                      })
                    }
                  >
                    <option value="">Ignore</option>
                    {assetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs w-28">imageUrl</label>
                  <select
                    className="p-1 border rounded flex-1"
                    value={assetMap.imageUrl?.header || ''}
                    onChange={(e) =>
                      setAssetMap({
                        ...assetMap,
                        imageUrl: { header: e.target.value, score: 10 },
                      })
                    }
                  >
                    <option value="">Ignore</option>
                    {assetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs w-28">imageName</label>
                  <select
                    className="p-1 border rounded flex-1"
                    value={assetMap.imageName?.header || ''}
                    onChange={(e) =>
                      setAssetMap({
                        ...assetMap,
                        imageName: { header: e.target.value, score: 10 },
                      })
                    }
                  >
                    <option value="">Ignore</option>
                    {assetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs w-28">assetType</label>
                  <select
                    className="p-1 border rounded flex-1"
                    value={assetMap.assetType?.header || ''}
                    onChange={(e) =>
                      setAssetMap({
                        ...assetMap,
                        assetType: { header: e.target.value },
                      })
                    }
                  >
                    <option value="">Ignore</option>
                    {assetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
        {currentType && (
          <div className="space-y-4">
            {orderedComponents.map((c) => {
              if (c.key === 'brand') return null;
              const instOptions = instances.filter(
                (i) =>
                  i.componentKey === c.key &&
                  (!i.relationships?.brandCode || i.relationships.brandCode === brandCode)
              );
              const defaultList = instOptions.map((i) => i.id);
              const current = selectedInstances[c.key] !== undefined
                ? selectedInstances[c.key]
                : c.selectionMode === 'checklist'
                ? defaultList
                : '';
              const inst =
                c.selectionMode === 'dropdown'
                  ? instances.find(
                      (i) =>
                        i.id === current &&
                        i.componentKey === c.key &&
                        (!i.relationships?.brandCode || i.relationships.brandCode === brandCode),
                    )
                  : null;
              return (
                <div key={c.id} className="space-y-2">
                  <label className="block text-sm mb-1">{c.label}</label>
                  {c.selectionMode === 'dropdown' && instOptions.length > 0 && (
                    <select
                      className="w-full p-2 border rounded"
                      value={current}
                      onChange={(e) =>
                        setSelectedInstances({ ...selectedInstances, [c.key]: e.target.value })
                      }
                    >
                      <option value="">Custom...</option>
                      {instOptions.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  )}
                  {c.selectionMode === 'checklist' && instOptions.length > 0 && (
                    <TagChecklist
                      options={instOptions.map((i) => ({ id: i.id, name: i.name }))}
                      value={current}
                      onChange={(arr) => setSelectedInstances({ ...selectedInstances, [c.key]: arr })}
                      id={`check-${c.id}`}
                    />
                  )}
                  {c.selectionMode === 'random' && instOptions.length > 0 && (
                    <p className="text-sm italic">Random instance</p>
                  )}
                  {((c.selectionMode === 'dropdown' && !inst) || instOptions.length === 0) &&
                    c.attributes?.map((a) => (
                      <div key={a.key}>
                        <label className="block text-xs mb-1">{a.label}</label>
                        <input
                          className="w-full p-2 border rounded"
                          value={formData[`${c.key}.${a.key}`] || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, [`${c.key}.${a.key}`]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                </div>
              );
            })}
            {writeFields.map((f) => (
              <div key={f.key}>
                <label className="block text-sm mb-1">{f.label}</label>
                {f.inputType === 'textarea' ? (
                  <textarea
                    className="w-full p-2 border rounded"
                    value={formData[f.key] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [f.key]: e.target.value })
                    }
                  />
                ) : f.inputType === 'list' ? (
                  <TagInput
                    id={`list-${f.key}`}
                    value={formData[f.key] || []}
                    onChange={(arr) =>
                      setFormData({ ...formData, [f.key]: arr })
                    }
                  />
                ) : (
                  <input
                    className="w-full p-2 border rounded"
                    type={f.inputType}
                    value={formData[f.key] || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, [f.key]: e.target.value })
                    }
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary">Generate</button>
              <input
                type="number"
                min="1"
                className="p-2 border rounded w-20"
                value={generateCount}
                onChange={(e) =>
                  setGenerateCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
          </div>
        )}
      </form>
      )}
      {results.length > 0 && (
        <div className="overflow-x-auto table-container mt-6">
          <div className="relative inline-block mb-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowColumnMenu(true)}
            >
              Columns
            </button>
            {userRole !== 'designer' && (
              <button
                type="button"
                className="btn-secondary ml-2"
                onClick={addRecipeRow}
              >
                Add Recipe Row
              </button>
            )}
          </div>
          {showColumnMenu && (
            <div
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
              onClick={() => setShowColumnMenu(false)}
            >
              <div
                className="bg-white p-4 rounded shadow max-w-sm w-full dark:bg-[var(--dark-sidebar-bg)] dark:text-[var(--dark-text)]"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="mb-2 font-semibold">Visible Columns</h3>
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
          <table className="ad-table min-w-full table-auto text-sm">
            <thead>
              <tr>
                <th>Recipe #</th>
                {columnMeta.map(
                  (col) =>
                    visibleColumns[col.key] && (
                      <th key={col.key}>{col.label}</th>
                    )
                )}
                <th className="w-80">Copy</th>
                <th className="text-center">{isAdminOrAgency ? 'Actions' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx} className={userRole === 'designer' && r.selected ? 'designer-selected' : ''}>
                  <td className="text-center align-middle font-bold">{r.recipeNo}</td>
                  {columnMeta.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <td key={col.key} className="align-middle">
                          {col.key.endsWith('.assets') ? (
                            renderAssetList(r.components[col.key] || [])
                          ) : (
                            <>
                              {editing === idx && col.key.includes('.') ? (
                                <select
                                  className="p-1 border rounded mb-1"
                                  onChange={(e) =>
                                    handleChangeInstance(col.key.split('.')[0], e.target.value)
                                  }
                                >
                                  <option value="">Select...</option>
                                  {instances
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
                              {editing === idx ? editComponents[col.key] : r.components[col.key]}
                            </>
                          )}
                        </td>
                      )
                  )}
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
                        {r.copy}
                      </div>
                    )}
                  </td>
                  <td className="text-center align-middle">
                    {isAdminOrAgency ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditRow(idx)}
                          aria-label={editing === idx ? 'Save' : 'Edit'}
                          className="btn-secondary px-1.5 py-0.5 text-xs"
                        >
                          {editing === idx ? <FiCheckSquare /> : <FiEdit2 />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRefreshRow(idx)}
                          aria-label="Refresh"
                          className="btn-secondary px-1.5 py-0.5 text-xs"
                        >
                          <FaMagic />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(idx)}
                          aria-label="Delete"
                          className="btn-secondary px-1.5 py-0.5 text-xs btn-delete"
                        >
                          <FiTrash />
                        </button>
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
        </div>
      )}
      {results.length > 0 && userRole !== 'designer' && (
        <div className="mt-4 text-right">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSave && onSave(results)}
          >
            Save Recipes
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipePreview;
