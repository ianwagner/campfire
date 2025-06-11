import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { FiEdit2, FiTrash, FiSave, FiImage } from 'react-icons/fi';
import { FaMagic } from 'react-icons/fa';
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

const RecipePreview = ({ onSave = null }) => {
  const [types, setTypes] = useState([]);
  const [components, setComponents] = useState([]);
  const [instances, setInstances] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [formData, setFormData] = useState({});
  const [selectedInstances, setSelectedInstances] = useState({});
  const [results, setResults] = useState([]);
  const [generateCount, setGenerateCount] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [assetRows, setAssetRows] = useState([]);
  const [assetHeaders, setAssetHeaders] = useState([]);
  const [assetMap, setAssetMap] = useState({});
  const [assetUsage, setAssetUsage] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const typeSnap = await getDocs(collection(db, 'recipeTypes'));
        setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const compSnap = await getDocs(collection(db, 'componentTypes'));
        setComponents(
          compSnap.docs.map((d) => {
            const data = d.data();
            return { id: d.id, ...data, selectionMode: data.selectionMode || 'dropdown' };
          })
        );
        const instSnap = await getDocs(collection(db, 'componentInstances'));
        setInstances(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load data', err);
      }
    };
    fetchData();
  }, []);

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

  const generateOnce = async (baseValues = null) => {
    if (!currentType) return null;

    let prompt = currentType.gptPrompt || '';
    const mergedForm = baseValues ? { ...baseValues } : { ...formData };
    const componentsData = {};
    orderedComponents.forEach((c) => {
      if (baseValues) {
        c.attributes?.forEach((a) => {
          const val = mergedForm[`${c.key}.${a.key}`] || '';
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      } else {
        const instOptions = instances.filter((i) => i.componentKey === c.key);
        let selectedInst = null;
        if (c.selectionMode === 'random') {
          if (instOptions.length > 0) {
            selectedInst = instOptions[Math.floor(Math.random() * instOptions.length)];
          }
        } else if (c.selectionMode === 'checklist') {
          const selected = selectedInstances[c.key] || [];
          if (selected.length > 0) {
            selectedInst = instOptions.find((i) => i.id === selectRandomOption(selected));
          }
        } else if (c.selectionMode === 'dropdown') {
          const selectedId = selectedInstances[c.key];
          if (selectedId) {
            selectedInst = instOptions.find((i) => i.id === selectedId);
          }
        }
        if (selectedInst) {
          Object.entries(selectedInst.values || {}).forEach(([k, v]) => {
            mergedForm[`${c.key}.${k}`] = v;
          });
        } else {
          c.attributes?.forEach((a) => {
            mergedForm[`${c.key}.${a.key}`] = mergedForm[`${c.key}.${a.key}`] || '';
          });
        }
        c.attributes?.forEach((a) => {
          const val = mergedForm[`${c.key}.${a.key}`] || '';
          componentsData[`${c.key}.${a.key}`] = val;
          const regex = new RegExp(`{{${c.key}\\.${a.key}}}`, 'g');
          prompt = prompt.replace(regex, val);
        });
      }
    });
    writeFields.forEach((f) => {
      let val = mergedForm[f.key];
      if (f.inputType === 'list') {
        const arr = Array.isArray(val) ? val : [];
        prompt = prompt.replace(
          new RegExp(`{{${f.key}}}`, 'g'),
          arr.join(', '),
        );
      } else {
        prompt = prompt.replace(new RegExp(`{{${f.key}}}`, 'g'), val || '');
      }
    });

    const assetCount = (currentType.assetMatchFields || []).length;
    const findBestAsset = (usageMap = assetUsage) => {
      debugLog('Searching best asset', {
        rows: assetRows.length,
        map: assetMap,
      });
      let bestScore = 0;
      let bestRows = [];
      assetRows.forEach((row, idx) => {
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

    const parseTags = (str) => parseContextTags(str);

    const selectedAssets = [];
    let csvContext = '';
    if (assetCount > 0) {
      const usageCopy = { ...assetUsage };
      const mainMatch = findBestAsset(usageCopy);
      let mainId = '';
      if (mainMatch) {
        const urlField = assetMap.imageUrl?.header || 'imageUrl';
        const nameField = assetMap.imageName?.header || 'imageName';
        const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
        const contextField = assetMap.context?.header || '';
        const url = mainMatch[urlField] || mainMatch.imageUrl || mainMatch.url || '';
        const name = mainMatch[nameField] || mainMatch.imageName || mainMatch.filename || url;
        mainId = mainMatch[idField] || mainMatch.imageUrl || mainMatch.imageName || '';
        csvContext = mainMatch[contextField] || '';
        if (mainId) {
          usageCopy[mainId] = (usageCopy[mainId] || 0) + 1;
        }
        if (url) {
          selectedAssets.push({ id: name, adUrl: url });
        } else {
          selectedAssets.push({ needAsset: true });
        }
      } else {
        selectedAssets.push({ needAsset: true });
      }

      const contextTags = new Set(parseTags(csvContext));

      const findRelatedAsset = (tagsSet, excludeId, usageMap) => {
        if (!assetMap.context?.header) return null;
        const contextField = assetMap.context.header;
        const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
        let best = [];
        let bestOverlap = 0;
        assetRows.forEach((row) => {
          const id = row[idField] || row.imageUrl || row.imageName || '';
          if (!id || id === excludeId) return;
          const rowTags = parseTags(row[contextField] || '');
          const overlap = rowTags.filter((t) => tagsSet.has(t)).length;
          if (overlap === 0) return;
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = [row];
          } else if (overlap === bestOverlap) {
            best.push(row);
          }
        });
        if (best.length === 0) return null;
        let minUsage = Infinity;
        best.forEach((row) => {
          const id = row[idField] || row.imageUrl || row.imageName || '';
          const usage = usageMap[id] || 0;
          if (usage < minUsage) minUsage = usage;
        });
        const lowUsage = best.filter((row) => {
          const id = row[idField] || row.imageUrl || row.imageName || '';
          return (usageMap[id] || 0) === minUsage;
        });
        return lowUsage[Math.floor(Math.random() * lowUsage.length)];
      };

      for (let i = 1; i < assetCount; i += 1) {
        const match = findRelatedAsset(contextTags, mainId, usageCopy);
        if (match) {
          const urlField = assetMap.imageUrl?.header || 'imageUrl';
          const nameField = assetMap.imageName?.header || 'imageName';
          const idField = assetMap.imageName?.header || assetMap.imageUrl?.header || '';
          const url = match[urlField] || match.imageUrl || match.url || '';
          const name = match[nameField] || match.imageName || match.filename || url;
          const assetId = match[idField] || match.imageUrl || match.imageName || '';
          if (assetId) {
            usageCopy[assetId] = (usageCopy[assetId] || 0) + 1;
          }
          if (url) {
            selectedAssets.push({ id: name, adUrl: url });
          } else {
            selectedAssets.push({ needAsset: true });
          }
        } else {
          selectedAssets.push({ needAsset: true });
        }
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
      const res = await generateOnce();
      if (res) {
        setResults((prev) => [
          ...prev,
          { recipeNo: prev.length + 1, ...res },
        ]);
      }
    }
  };

  const handleRefresh = async (idx) => {
    const row = results[idx];
    const res = await generateOnce(row.components);
    if (res) {
      setResults((prev) => {
        const arr = [...prev];
        arr[idx] = { ...arr[idx], ...res };
        return arr;
      });
    }
  };

  const updateComponentValue = (rowIdx, compKey, attrKey, val) => {
    const arr = [...results];
    arr[rowIdx].components[`${compKey}.${attrKey}`] = val;
    const matched = instances.find(
      (inst) => inst.componentKey === compKey && inst.values?.[attrKey] === val
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
      blank[c.key] = '';
    });
    setResults((prev) => [
      ...prev,
      { recipeNo: prev.length + 1, components: blank, copy: '', assets: [] },
    ]);
  };

  const currentType = types.find((t) => t.id === selectedType);
  useEffect(() => {
    if (!currentType?.enableAssetCsv) {
      setAssetRows([]);
      setAssetHeaders([]);
      setAssetMap({});
    }
  }, [currentType]);
  const compMap = Object.fromEntries(components.map((c) => [c.key, c]));
  const orderedComponents = currentType?.components?.length
    ? currentType.components.map((k) => compMap[k]).filter(Boolean)
    : components;
  const writeFields = currentType?.writeInFields || [];
  const columnMeta = useMemo(() => {
    const cols = [];
    orderedComponents.forEach((c) => {
      c.attributes?.forEach((a) => {
        cols.push({ key: `${c.key}.${a.key}`, label: `${c.label} - ${a.label}` });
      });
    });
    writeFields.forEach((f) => {
      cols.push({ key: f.key, label: f.label });
    });
    return cols;
  }, [orderedComponents, writeFields]);

  useEffect(() => {
    const defaults = {};
    if (currentType?.defaultColumns && currentType.defaultColumns.length > 0) {
      columnMeta.forEach((c) => {
        defaults[c.key] = currentType.defaultColumns.includes(c.key);
      });
    } else {
      columnMeta.forEach((c) => {
        defaults[c.key] = c.label.toLowerCase().includes('name');
      });
    }
    setVisibleColumns(defaults);
  }, [columnMeta, currentType]);

  return (
    <div>
      <h2 className="text-xl mb-2">Preview</h2>
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
        {currentType?.enableAssetCsv && (
          <div className="space-y-2">
            <div>
              <label className="block text-sm mb-1">Asset CSV</label>
              <input type="file" accept=".csv" onChange={handleAssetCsvChange} />
              {assetRows.length > 0 && (
                <p className="text-xs">{assetRows.length} rows loaded</p>
              )}
            </div>
            {assetHeaders.length > 0 && currentType.assetMatchFields?.length > 0 && (
              <div className="space-y-1">
                {currentType.assetMatchFields.map((f) => (
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
                      <option value="">None</option>
                      {assetHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="p-1 border rounded w-16"
                      value={assetMap[f]?.score || 10}
                      onChange={(e) =>
                        setAssetMap({
                          ...assetMap,
                          [f]: { ...assetMap[f], score: parseInt(e.target.value, 10) || 10 },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {orderedComponents.map((c) => {
          const defaultList = instances
            .filter((i) => i.componentKey === c.key)
            .map((i) => i.id);
          const instOptions = instances.filter((i) => i.componentKey === c.key);
          const current = selectedInstances[c.key] !== undefined
            ? selectedInstances[c.key]
            : c.selectionMode === 'checklist'
            ? defaultList
            : '';
          const inst = c.selectionMode === 'dropdown' ? instances.find((i) => i.id === current) : null;
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
            ) : f.inputType === 'image' ? (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFormData({ ...formData, [f.key]: file });
                }}
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
      </form>
      {results.length > 0 && (
        <div className="table-container mt-6">
          <div className="relative inline-block mb-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowColumnMenu((s) => !s)}
            >
              Columns
            </button>
            {showColumnMenu && (
              <div className="absolute z-10 bg-white border rounded shadow p-2 right-0">
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
              </div>
            )}
            <button
              type="button"
              className="btn-secondary ml-2"
              onClick={addRecipeRow}
            >
              Add Recipe Row
            </button>
          </div>
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
                <th>Assets</th>
                <th className="w-80">Generated Copy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center align-middle font-bold">{r.recipeNo}</td>
                  {columnMeta.map(
                    (col) =>
                      visibleColumns[col.key] && (
                        <td key={col.key} className="align-middle">
                          {editIdx === idx ? (
                            (() => {
                              const [compKey, attrKey] = col.key.split('.');
                              const instVals = Array.from(
                                new Set(
                                  instances
                                    .filter((i) => i.componentKey === compKey)
                                    .map((i) => i.values?.[attrKey])
                                    .filter(Boolean)
                                )
                              );
                              if (instVals.length > 0) {
                                return (
                                  <select
                                    className="w-full p-1 border rounded"
                                    value={r.components[col.key]}
                                    onChange={(e) =>
                                      updateComponentValue(
                                        idx,
                                        compKey,
                                        attrKey,
                                        e.target.value
                                      )
                                    }
                                  >
                                    {instVals.map((v) => (
                                      <option key={v} value={v}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                );
                              }
                              return (
                                <input
                                  className="w-full p-1 border rounded"
                                  value={r.components[col.key]}
                                  onChange={(e) =>
                                    updateComponentValue(
                                      idx,
                                      compKey,
                                      attrKey,
                                      e.target.value
                                    )
                                  }
                                />
                              );
                            })()
                          ) : (
                            r.components[col.key]
                          )}
                        </td>
                      )
                  )}
                  <td className="text-center align-middle">
                    <div className="flex justify-center gap-1">
                      {r.assets && r.assets.length > 0 ? (
                        r.assets.map((a, i) =>
                          a.needAsset ? (
                            <span key={`na-${i}`} className="text-red-500 text-xs">Need asset</span>
                          ) : (
                            <span key={a.id} className="relative inline-block group">
                              <a
                                href={a.adUrl || a.firebaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-xl bg-accent-10 text-accent rounded inline-flex items-center justify-center"
                              >
                                <FiImage />
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
                  </td>
                  <td className="whitespace-pre-wrap break-words w-80 align-middle copy-cell">
                    {editIdx === idx ? (
                      <>
                      <textarea
                        className="w-full p-1 border rounded"
                        value={r.copy}
                        onChange={(e) => {
                          const arr = [...results];
                          arr[idx].copy = e.target.value;
                          setResults(arr);
                        }}
                        spellCheck
                      />
                      </>
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
                    {editIdx === idx ? (
                      <>
                        <button
                          type="button"
                          className="mr-2"
                          onClick={() => setEditIdx(null)}
                          aria-label="Save"
                        >
                          <FiSave />
                        </button>
                        <button
                          type="button"
                          className="text-red-600"
                          onClick={() => {
                            setResults((prev) =>
                              prev
                                .filter((_, i) => i !== idx)
                                .map((res, i2) => ({ ...res, recipeNo: i2 + 1 }))
                            );
                          }}
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="mr-2"
                          onClick={() => setEditIdx(idx)}
                          aria-label="Edit"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="mr-2"
                          onClick={() => handleRefresh(idx)}
                          aria-label="Refresh"
                        >
                          <FaMagic />
                        </button>
                        <button
                          type="button"
                          className="text-red-600"
                          onClick={() => {
                            setResults((prev) =>
                              prev
                                .filter((_, i) => i !== idx)
                                .map((res, i2) => ({ ...res, recipeNo: i2 + 1 }))
                            );
                          }}
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.length > 0 && onSave && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onSave(results)}
          >
            Save Recipes
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipePreview;
