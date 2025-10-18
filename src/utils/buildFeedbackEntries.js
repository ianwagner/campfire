import parseAdFilename from './parseAdFilename';

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (err) {
      return null;
    }
  }
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const [base] = url.split('?');
  return base;
};

const createRecipeEntry = ({ groupId, groupName, recipeCode }) => {
  const label = recipeCode ? String(recipeCode) : '';
  return {
    id: `recipe-${groupId || 'unknown'}-${label || 'unassigned'}`,
    type: 'recipe',
    title: label ? `Recipe ${label}` : 'Recipe feedback',
    subtitle: '',
    comment: '',
    copyEdit: '',
    copyEditDiff: null,
    updatedAt: null,
    updatedBy: '',
    adStatus: '',
    assetId: '',
    adUrl: '',
    recipeCode: label,
    groupId,
    groupName: groupName || '',
    detailKeys: new Set(),
    details: [],
    commentList: [],
    copyEditList: [],
    statuses: new Set(),
    assetLabels: new Set(),
  };
};

const pushDetail = (entry, detail) => {
  const key = [
    detail.source || 'unknown',
    detail.assetId || '',
    detail.commentText || '',
    detail.copyEditText || '',
  ].join('|');
  if (entry.detailKeys.has(key)) return;
  entry.detailKeys.add(key);
  entry.details.push(detail);
  if (detail.commentText) {
    entry.commentList.push({
      id: detail.id,
      text: detail.commentText,
      assetLabel: detail.assetLabel || '',
      assetId: detail.assetId || '',
      adUrl: detail.adUrl || '',
      updatedAt: detail.date || null,
      updatedBy: detail.updatedBy || '',
      status: detail.status || '',
    });
  }
  if (detail.copyEditText || detail.copyEditDiff) {
    entry.copyEditList.push({
      id: detail.id,
      text: detail.copyEditText || '',
      diff: detail.copyEditDiff || null,
      assetLabel: detail.assetLabel || '',
      assetId: detail.assetId || '',
      adUrl: detail.adUrl || '',
      updatedAt: detail.date || null,
      updatedBy: detail.updatedBy || '',
      status: detail.status || '',
    });
  }
  if (detail.status) entry.statuses.add(detail.status);
  if (detail.assetLabel) entry.assetLabels.add(detail.assetLabel);
  if (detail.date) {
    if (!entry.updatedAt || entry.updatedAt.getTime() < detail.date.getTime()) {
      entry.updatedAt = detail.date;
      entry.updatedBy = detail.updatedBy || entry.updatedBy || '';
    }
  }
};

const finalizeRecipeEntry = (entry) => {
  const normalizeKey = (value) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.getTime().toString();
    if (typeof value === 'string') return value.trim().toLowerCase();
    return String(value).trim().toLowerCase();
  };

  const aggregateTimelineItems = (list, getKey) => {
    if (!Array.isArray(list)) return [];
    const aggregated = [];
    const keyed = new Map();

    list.forEach((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const key = getKey(rawItem);
      const normalizedItem = {
        ...rawItem,
        text: typeof rawItem.text === 'string' ? rawItem.text.trim() : rawItem.text || '',
        assetLabel:
          typeof rawItem.assetLabel === 'string' ? rawItem.assetLabel.trim() : rawItem.assetLabel || '',
        assetId: rawItem.assetId || '',
        updatedBy: rawItem.updatedBy || '',
        status: rawItem.status || '',
      };

      if (normalizedItem.updatedAt && !(normalizedItem.updatedAt instanceof Date)) {
        try {
          normalizedItem.updatedAt = new Date(normalizedItem.updatedAt);
        } catch (err) {
          normalizedItem.updatedAt = null;
        }
      }

      if (!key) {
        aggregated.push(normalizedItem);
        return;
      }

      if (!keyed.has(key)) {
        normalizedItem._assetLabelSet = new Set(
          normalizedItem.assetLabel ? [normalizedItem.assetLabel] : [],
        );
        normalizedItem._assetIdSet = new Set(
          normalizedItem.assetId ? [normalizedItem.assetId] : [],
        );
        keyed.set(key, normalizedItem);
        return;
      }

      const existing = keyed.get(key);
      if (normalizedItem.assetLabel) {
        existing._assetLabelSet.add(normalizedItem.assetLabel);
      }
      if (normalizedItem.assetId) {
        existing._assetIdSet.add(normalizedItem.assetId);
      }

      const existingTime = existing.updatedAt instanceof Date ? existing.updatedAt.getTime() : 0;
      const nextTime =
        normalizedItem.updatedAt instanceof Date ? normalizedItem.updatedAt.getTime() : 0;
      if (nextTime > existingTime) {
        existing.updatedAt = normalizedItem.updatedAt;
        existing.updatedBy = normalizedItem.updatedBy || existing.updatedBy || '';
        existing.status = normalizedItem.status || existing.status || '';
        existing.adUrl = normalizedItem.adUrl || existing.adUrl || '';
      }
    });

    const merged = [...keyed.values(), ...aggregated].map((item) => {
      if (item._assetLabelSet || item._assetIdSet) {
        const labels = item._assetLabelSet
          ? Array.from(item._assetLabelSet).filter(Boolean)
          : [];
        const ids = item._assetIdSet ? Array.from(item._assetIdSet).filter(Boolean) : [];
        const labelValue = labels.length ? labels.join(', ') : item.assetLabel;
        const idValue = ids.length ? ids.join(', ') : item.assetId;
        const cleaned = {
          ...item,
          assetLabel: labelValue,
          assetId: idValue,
        };
        delete cleaned._assetLabelSet;
        delete cleaned._assetIdSet;
        return cleaned;
      }
      return item;
    });

    return merged;
  };

  const sortByDateDesc = (list) =>
    list.slice().sort((a, b) => {
      const aTime = a?.updatedAt?.getTime?.() || 0;
      const bTime = b?.updatedAt?.getTime?.() || 0;
      return bTime - aTime;
    });

  const statusString = Array.from(entry.statuses).filter(Boolean);
  const assetSummary = Array.from(entry.assetLabels).filter(Boolean);
  const subtitleParts = [];
  if (entry.groupName) subtitleParts.push(`Group: ${entry.groupName}`);
  if (statusString.length === 1) subtitleParts.push(`Status: ${statusString[0].replace(/_/g, ' ')}`);
  else if (statusString.length > 1) subtitleParts.push('Status: mixed');
  if (assetSummary.length === 1) subtitleParts.push(assetSummary[0]);
  if (assetSummary.length > 1) subtitleParts.push(`${assetSummary.length} assets`);
  entry.subtitle = subtitleParts.join(' • ');

  const normalizedComments = sortByDateDesc(
    aggregateTimelineItems(entry.commentList, (item) => normalizeKey(item?.text || '')),
  );
  const normalizedCopyEdits = sortByDateDesc(
    aggregateTimelineItems(entry.copyEditList, (item) => normalizeKey(item?.text || '')),
  );

  entry.commentList = normalizedComments;
  entry.copyEditList = normalizedCopyEdits;

  entry.comment = normalizedComments
    .map((item) => {
      if (!item.text) return '';
      const prefix = item.assetLabel ? `${item.assetLabel}: ` : '';
      return `${prefix}${item.text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  entry.copyEdit = normalizedCopyEdits
    .map((item) => {
      if (!item.text) return '';
      const prefix = item.assetLabel ? `${item.assetLabel}: ` : '';
      return `${prefix}${item.text}`;
    })
    .filter(Boolean)
    .join('\n\n');
  return {
    ...entry,
    detailKeys: undefined,
    statuses: undefined,
    assetLabels: undefined,
    details: undefined,
  };
};

export const buildFeedbackEntriesForGroup = ({
  groupId,
  groupName,
  feedback = [],
  responses = [],
  assets = [],
  recipesMeta = {},
  renderCopyEditDiff,
} = {}) => {
  const entries = [];
  const assetById = new Map();
  const assetByUrl = new Map();
  assets.forEach((asset) => {
    if (!asset || typeof asset !== 'object') return;
    if (asset.id) assetById.set(asset.id, asset);
    [asset.firebaseUrl, asset.cdnUrl, asset.adUrl].forEach((url) => {
      const key = normalizeUrl(url);
      if (key) assetByUrl.set(key, asset);
    });
  });

  const recipeMap = new Map();
  const getEntry = (recipeCode) => {
    const code = recipeCode || '';
    const key = `${groupId || 'unknown'}-${code || 'unassigned'}`;
    if (!recipeMap.has(key)) {
      recipeMap.set(key, createRecipeEntry({ groupId, groupName, recipeCode: code }));
    }
    return recipeMap.get(key);
  };

  (Array.isArray(feedback) ? feedback : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const comment = (item.comment || '').trim();
    const copyEdit = (item.copyEdit || '').trim();
    if (!comment && !copyEdit) return;
    entries.push({
      id: `general-${groupId || 'unknown'}-${item.id || Math.random().toString(36).slice(2)}`,
      type: 'general',
      title: 'General feedback',
      subtitle: groupName ? `Group: ${groupName}` : '',
      comment,
      copyEdit,
      copyEditDiff: null,
      updatedAt: normalizeDate(item.updatedAt || item.createdAt),
      updatedBy: item.updatedBy || '',
      adStatus: '',
      assetId: '',
      adUrl: '',
      recipeCode: '',
      groupId,
      groupName: groupName || '',
      commentList: comment
        ? [
            {
              id: `general-${groupId || 'unknown'}-${item.id || Math.random().toString(36).slice(2)}-comment`,
              text: comment,
              assetLabel: '',
              assetId: '',
              adUrl: '',
              updatedAt: normalizeDate(item.updatedAt || item.createdAt),
              updatedBy: item.updatedBy || '',
              status: '',
            },
          ]
        : [],
      copyEditList: [],
    });
  });

  const resolveRecipeMeta = (recipeCode) => {
    if (!recipeCode) return null;
    const direct = recipesMeta?.[recipeCode];
    if (direct) return direct;
    const lower = recipesMeta?.[String(recipeCode).toLowerCase?.()];
    if (lower) return lower;
    return null;
  };

  (Array.isArray(responses) ? responses : []).forEach((resp) => {
    if (!resp || typeof resp !== 'object') return;
    const respType = (resp.response || '').toLowerCase();
    if (respType && respType !== 'edit') return;
    const comment = (resp.comment || '').trim();
    const copyEdit = (resp.copyEdit || '').trim();
    if (!comment && !copyEdit) return;

    const urlKey = normalizeUrl(resp.adUrl);
    const matchedAsset =
      (resp.assetId && assetById.get(resp.assetId)) ||
      (urlKey && assetByUrl.get(urlKey)) ||
      (resp.adUrl && assetByUrl.get(resp.adUrl)) ||
      null;

    const filename = matchedAsset?.filename || matchedAsset?.name || resp.assetName || resp.groupName || '';
    const parsed = matchedAsset?.filename ? parseAdFilename(matchedAsset.filename) : parseAdFilename(resp.assetName || '');
    const recipeCode =
      resp.recipeCode ||
      matchedAsset?.recipeCode ||
      parsed.recipeCode ||
      '';
    const aspect = parsed.aspectRatio ? String(parsed.aspectRatio).toUpperCase() : '';
    const version = parsed.version ? `V${parsed.version}` : '';
    const status = matchedAsset?.status || resp.assetStatus || '';
    const assetLabel = [filename, aspect, version].filter(Boolean).join(' • ');
    const entry = getEntry(recipeCode);

    const recipeMeta = resolveRecipeMeta(recipeCode);
    let copyEditDiff = null;
    let copyEditText = copyEdit;
    if (copyEdit && recipeMeta && typeof renderCopyEditDiff === 'function') {
      const baseCopy = recipeMeta.copy || recipeMeta.latestCopy || matchedAsset?.origCopy || '';
      const diff = renderCopyEditDiff(recipeCode, copyEdit, baseCopy);
      if (diff) {
        copyEditDiff = diff;
        copyEditText = '';
      }
    }

    pushDetail(entry, {
      id: `resp-${resp.id || Math.random().toString(36).slice(2)}`,
      source: 'response',
      assetId: matchedAsset?.id || resp.assetId || '',
      adUrl: matchedAsset?.firebaseUrl || matchedAsset?.cdnUrl || resp.adUrl || '',
      assetLabel,
      status,
      commentText: comment,
      copyEditText: copyEditText,
      copyEditDiff,
      updatedBy: resp.reviewerName || resp.userEmail || resp.userId || '',
      date: normalizeDate(resp.timestamp || resp.updatedAt || resp.createdAt),
    });
  });

  (Array.isArray(assets) ? assets : []).forEach((asset) => {
    if (!asset || typeof asset !== 'object') return;
    const comment = (asset.comment || '').trim();
    const copyEdit = (asset.copyEdit || '').trim();
    if (!comment && !copyEdit) return;
    const parsed = asset.filename ? parseAdFilename(asset.filename) : {};
    const recipeCode = asset.recipeCode || parsed.recipeCode || '';
    const aspect = parsed.aspectRatio ? String(parsed.aspectRatio).toUpperCase() : '';
    const version = parsed.version ? `V${parsed.version}` : '';
    const status = asset.status || '';
    const assetLabel = [asset.filename || asset.name || '', aspect, version]
      .filter(Boolean)
      .join(' • ');

    const entry = getEntry(recipeCode);
    const recipeMeta = resolveRecipeMeta(recipeCode);
    let copyEditDiff = null;
    let copyEditText = copyEdit;
    if (copyEdit && recipeMeta && typeof renderCopyEditDiff === 'function') {
      const baseCopy = recipeMeta.copy || recipeMeta.latestCopy || '';
      const diff = renderCopyEditDiff(recipeCode, copyEdit, baseCopy);
      if (diff) {
        copyEditDiff = diff;
        copyEditText = '';
      }
    }

    pushDetail(entry, {
      id: `asset-${asset.id || Math.random().toString(36).slice(2)}`,
      source: 'asset',
      assetId: asset.id || '',
      adUrl: asset.firebaseUrl || asset.cdnUrl || '',
      assetLabel,
      status,
      commentText: comment,
      copyEditText,
      copyEditDiff,
      updatedBy: asset.lastUpdatedBy || '',
      date: normalizeDate(asset.lastUpdatedAt || asset.updatedAt),
    });
  });

  recipeMap.forEach((entry) => {
    const finalized = finalizeRecipeEntry(entry);
    entries.push(finalized);
  });

  entries.sort((a, b) => {
    const aTime = a.updatedAt?.getTime?.() || 0;
    const bTime = b.updatedAt?.getTime?.() || 0;
    return bTime - aTime;
  });

  return entries;
};

const buildFeedbackEntries = (groups = [], options = {}) => {
  if (!Array.isArray(groups)) return [];
  const entries = groups.flatMap((group) =>
    buildFeedbackEntriesForGroup({
      groupId: group.groupId,
      groupName: group.groupName,
      feedback: group.feedback,
      responses: group.responses,
      assets: group.assets,
      recipesMeta: group.recipesMeta,
      renderCopyEditDiff: group.renderCopyEditDiff || options.renderCopyEditDiff,
    })
  );
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry || !entry.id) return;
    if (!map.has(entry.id)) {
      map.set(entry.id, entry);
    } else {
      const prev = map.get(entry.id);
      const prevTime = prev.updatedAt?.getTime?.() || 0;
      const nextTime = entry.updatedAt?.getTime?.() || 0;
      if (nextTime > prevTime) {
        map.set(entry.id, entry);
      }
    }
  });
  const list = Array.from(map.values());
  list.sort((a, b) => {
    const aTime = a.updatedAt?.getTime?.() || 0;
    const bTime = b.updatedAt?.getTime?.() || 0;
    return bTime - aTime;
  });
  return list;
};

export default buildFeedbackEntries;
