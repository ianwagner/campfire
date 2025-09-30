import React, { useEffect, useState, useRef, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, serverTimestamp, query, where, deleteField } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { FiPlus, FiList, FiColumns, FiArchive, FiCalendar, FiEdit2, FiTrash, FiMoreHorizontal } from 'react-icons/fi';
import PageToolbar from './components/PageToolbar.jsx';
import CreateButton from './components/CreateButton.jsx';
import { db, auth, functions } from './firebase/config';
import { useNavigate } from 'react-router-dom';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import SortButton from './components/SortButton.jsx';
import ScrollModal from './components/ScrollModal.jsx';
import TabButton from './components/TabButton.jsx';
import RequestCard from './components/RequestCard.jsx';
import RequestViewModal from './components/RequestViewModal.jsx';
import Calendar from './components/Calendar.jsx';
import useAgencies from './useAgencies';
import formatDetails from './utils/formatDetails';
import useUserRole from './useUserRole';
import UrlCheckInput from './components/UrlCheckInput.jsx';

const createDefaultProductRequest = () => ({
  productName: '',
  quantity: '1',
  isNew: false,
});

const createEmptyForm = (overrides = {}) => ({
  type: 'newAds',
  brandCode: '',
  title: '',
  dueDate: '',
  numAds: 1,
  numAssets: 1,
  inspiration: '',
  uploadLink: '',
  assetLinks: [''],
  details: '',
  priority: 'low',
  name: '',
  agencyId: '',
  toneOfVoice: '',
  offering: '',
  brandAssetsLink: '',
  contractType: 'production',
  contractDeliverables: '',
  contractStartDate: '',
  contractEndDate: '',
  contractLink: '',
  designerId: '',
  editorId: '',
  infoNote: '',
  productRequests: [createDefaultProductRequest()],
  ...overrides,
});

const AdminRequests = ({ filterEditorId, filterCreatorId, canAssignEditor = true } = {}) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewRequest, setViewRequest] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [brands, setBrands] = useState([]);
  const [aiArtStyle, setAiArtStyle] = useState('');
  const [designers, setDesigners] = useState([]);
  const [editors, setEditors] = useState([]);
  const [view, setView] = useState('kanban');
  const [dragId, setDragId] = useState(null);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [showWeekends, setShowWeekends] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [brandCodeError, setBrandCodeError] = useState('');
  const menuBtnRef = useRef(null);
  const menuRef = useRef(null);
  const calendarRef = useRef(null);
  const editStatus = editId ? requests.find((r) => r.id === editId)?.status : null;
  const navigate = useNavigate();
  const { agencies } = useAgencies();
  const { role, agencyId: userAgencyId } = useUserRole(auth.currentUser?.uid);
  const isOps = role === 'ops';
  const isProjectManager = role === 'project-manager';
  const showDesignerSelect = !isOps && !isProjectManager;
  const showEditorSelect = canAssignEditor && !isOps && !isProjectManager;
  const existingBrandCodes = useMemo(() => {
    const codes = new Set();
    brands.forEach((brand) => {
      const code = typeof brand?.code === 'string' ? brand.code.trim().toUpperCase() : '';
      if (code) codes.add(code);
    });
    requests.forEach((req) => {
      if (req?.type !== 'newBrand' || !req.brandCode) return;
      if (editId && req.id === editId) return;
      const code = String(req.brandCode).trim().toUpperCase();
      if (code) codes.add(code);
    });
    return codes;
  }, [brands, requests, editId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'requests');
        let q = base;
        if (filterEditorId) q = query(q, where('editorId', '==', filterEditorId));
        if (filterCreatorId) q = query(q, where('createdBy', '==', filterCreatorId));
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        setRequests(list);
      } catch (err) {
        console.error('Failed to fetch requests', err);
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    const fetchBrands = async () => {
      try {
        const snap = await getDocs(collection(db, 'brands'));
        setBrands(
          snap.docs.map((d) => {
            const data = d.data();
            const products = Array.isArray(data.products)
              ? data.products
                  .map((p) => {
                    if (!p) return null;
                    if (typeof p === 'string') return p.trim();
                    if (typeof p.name === 'string') return p.name.trim();
                    return null;
                  })
                  .filter((name) => name && name.length)
              : [];
            return {
              code: data.code,
              aiArtStyle: data.aiArtStyle || '',
              products,
            };
          })
        );
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      }
    };

    const fetchDesigners = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'designer'));
        const snap = await getDocs(q);
        setDesigners(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch designers', err);
        setDesigners([]);
      }
    };

    const fetchEditors = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', 'in', ['editor', 'project-manager'])
        );
        const snap = await getDocs(q);
        setEditors(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().fullName || d.data().email || d.id,
          }))
        );
      } catch (err) {
        console.error('Failed to fetch editors', err);
        setEditors([]);
      }
    };

    fetchData();
    fetchBrands();
    if (showDesignerSelect) {
      fetchDesigners();
    } else {
      setDesigners([]);
    }
    if (showEditorSelect) {
      fetchEditors();
    } else {
      setEditors([]);
    }
  }, [filterEditorId, filterCreatorId, showDesignerSelect, showEditorSelect]);

  useEffect(() => {
    const handleClick = (e) => {
      if (
        menuBtnRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      ) {
        return;
      }
      setCalendarMenuOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!userAgencyId || editId) return;
    setForm((prev) => {
      if (prev.agencyId) return prev;
      return { ...prev, agencyId: userAgencyId };
    });
  }, [userAgencyId, editId]);

  useEffect(() => {
    if (form.type !== 'newBrand' || !userAgencyId) return;
    if (form.agencyId) return;
    setForm((prev) => {
      if (prev.type !== 'newBrand' || prev.agencyId) return prev;
      return { ...prev, agencyId: userAgencyId };
    });
  }, [form.type, form.agencyId, userAgencyId]);

  const getBrandProducts = (code) => {
    const brand = brands.find((br) => br.code === code);
    return Array.isArray(brand?.products) ? brand.products : [];
  };

  const currentProductRequests = Array.isArray(form.productRequests) ? form.productRequests : [];
  const brandProducts = form.brandCode ? getBrandProducts(form.brandCode) : [];
  const totalAdsRequested = currentProductRequests.reduce((sum, item) => {
    const qty = Number(item?.quantity);
    if (Number.isNaN(qty) || qty <= 0) return sum;
    return sum + qty;
  }, 0);

  const resetForm = () => {
    setForm(createEmptyForm({ agencyId: userAgencyId || '' }));
    setEditId(null);
    setSaveError('');
    setSaving(false);
    setBrandCodeError('');
  };

  const openCreate = () => {
    resetForm();
    setAiArtStyle('');
    if (!showEditorSelect) {
      setForm((f) => ({
        ...f,
        editorId: filterEditorId || (isProjectManager ? '' : auth.currentUser?.uid || ''),
      }));
    }
    setShowModal(true);
  };

  const openView = (req) => {
    setViewRequest(req);
  };

  const startEdit = (req) => {
    setViewRequest(null);
    setEditId(req.id);
    setSaveError('');
    setSaving(false);
    const brandProducts = getBrandProducts(req.brandCode || '');
    let productRequests = [];
    if (Array.isArray(req.productRequests) && req.productRequests.length) {
      productRequests = req.productRequests
        .map((p) => {
          if (!p) return null;
          const rawName = typeof p === 'string' ? p : p.productName || p.name || '';
          const name = (rawName || '').trim();
          const rawQuantity =
            p.quantity !== undefined
              ? p.quantity
              : p.count !== undefined
              ? p.count
              : p.numAds !== undefined
              ? p.numAds
              : '';
          const quantity =
            rawQuantity === '' || rawQuantity === null || rawQuantity === undefined
              ? '1'
              : String(rawQuantity);
          const isNew = !!p.isNew || (name && !brandProducts.includes(name));
          return {
            ...createDefaultProductRequest(),
            productName: name,
            quantity,
            isNew,
          };
        })
        .filter(Boolean);
    }
    if (!productRequests.length) {
      const fallbackQuantity =
        req.numAds && Number(req.numAds) > 0 ? String(req.numAds) : '1';
      productRequests = [
        {
          ...createDefaultProductRequest(),
          quantity: fallbackQuantity,
          isNew: brandProducts.length === 0,
        },
      ];
    }
    const totalFromProducts = productRequests.reduce((sum, p) => {
      const qty = Number(p.quantity);
      if (Number.isNaN(qty) || qty <= 0) return sum;
      return sum + qty;
    }, 0);
    setForm({
      type: req.type || 'newAds',
      brandCode: (req.brandCode || '').toUpperCase(),
      title: req.title || '',
      dueDate: req.dueDate ? req.dueDate.toDate().toISOString().slice(0,10) : '',
      numAds: req.numAds || totalFromProducts || 1,
      numAssets: req.numAssets || 1,
      inspiration: req.inspiration || '',
      uploadLink: req.uploadLink || '',
      assetLinks: req.assetLinks && req.assetLinks.length ? req.assetLinks : [''],
      details: req.details || '',
      priority: req.priority || 'low',
      name: req.name || '',
      agencyId: req.agencyId || '',
      toneOfVoice: req.toneOfVoice || '',
      offering: req.offering || '',
      brandAssetsLink: req.brandAssetsLink || '',
      contractType: req.contractType || 'production',
      contractDeliverables:
        typeof req.contractDeliverables === 'number' && !Number.isNaN(req.contractDeliverables)
          ? String(req.contractDeliverables)
          : req.contractDeliverables || '',
      contractStartDate: formatDateInputValue(req.contractStartDate),
      contractEndDate: formatDateInputValue(req.contractEndDate),
      contractLink: req.contractLink || '',
      designerId: req.designerId || '',
      editorId: req.editorId || '',
      infoNote: req.infoNote || '',
      productRequests,
    });
    const b = brands.find((br) => br.code === req.brandCode);
    setAiArtStyle(b?.aiArtStyle || '');
    setBrandCodeError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaveError('');
    setSaving(true);
    try {
      const rawBrandCode = (form.brandCode || '').trim();
      const normalizedBrandCode = rawBrandCode.toUpperCase();
      const assetLinks = (form.assetLinks || []).map((l) => l.trim()).filter((l) => l);
      if (form.type === 'newAds' && assetLinks.length === 0) {
        setSaveError('Please provide at least one Google Drive asset link.');
        return;
      }
      let productRequests = [];
      let numAds = Number(form.numAds) || 0;
      let driveVerifierCallable = null;
      const getDriveVerifier = () => {
        if (!driveVerifierCallable) {
          driveVerifierCallable = httpsCallable(functions, 'verifyDriveAccess', { timeout: 60000 });
        }
        return driveVerifierCallable;
      };

      if (form.type === 'newAds') {
        if (!normalizedBrandCode) {
          setSaveError('Brand is required for new ad tickets.');
          return;
        }
        const availableProducts = getBrandProducts(normalizedBrandCode);
        productRequests = (Array.isArray(form.productRequests) ? form.productRequests : [])
          .map((item) => {
            if (!item) return null;
            const name = (item.productName || '').trim();
            const qty = Number(item.quantity);
            if (!name || Number.isNaN(qty) || qty <= 0) return null;
            const isNew = !!item.isNew || !availableProducts.includes(name);
            return { productName: name, quantity: qty, isNew };
          })
          .filter(Boolean);
        if (!productRequests.length) {
          setSaveError('Add at least one product with a quantity.');
          return;
        }
        numAds = productRequests.reduce((sum, item) => sum + item.quantity, 0);
      }

      if (assetLinks.length) {
        try {
          const verifyDriveAccess = getDriveVerifier();
          await Promise.all(assetLinks.map((url) => verifyDriveAccess({ url })));
        } catch (err) {
          console.error('Failed to verify asset link', err);
          setSaveError(
            'One or more asset links cannot be accessed. Please update sharing permissions and try again.'
          );
          return;
        }
      }

      let brandAssetsLink = '';
      let contractType = '';
      let contractDeliverables = null;
      let contractStartDate = null;
      let contractEndDate = null;
      let contractLink = '';

      if (form.type === 'newBrand') {
        const brandName = (form.name || '').trim();
        if (!brandName) {
          setSaveError('Brand name is required.');
          return;
        }
        if (!/^[A-Z]{4}$/.test(normalizedBrandCode)) {
          setBrandCodeError('Brand code must be four letters.');
          setSaveError('Brand code must be four letters.');
          return;
        }
        if (existingBrandCodes.has(normalizedBrandCode)) {
          setBrandCodeError('This brand code is already in use.');
          setSaveError('Brand code is already in use.');
          return;
        }
        if (brandCodeError) setBrandCodeError('');
        const cleanedAssetsLink = (form.brandAssetsLink || '').trim();
        if (!cleanedAssetsLink) {
          setSaveError('Please provide a Brand Assets Google Drive link.');
          return;
        }
        try {
          const verifyDriveAccess = getDriveVerifier();
          await verifyDriveAccess({ url: cleanedAssetsLink });
        } catch (err) {
          console.error('Failed to verify brand assets link', err);
          setSaveError(
            'We cannot access the brand assets link. Please update the sharing permissions and try again.'
          );
          return;
        }
        brandAssetsLink = cleanedAssetsLink;
        contractType = form.contractType === 'briefs' ? 'briefs' : 'production';
        if (form.contractDeliverables !== '') {
          const parsedDeliverables = Number(form.contractDeliverables);
          if (Number.isNaN(parsedDeliverables) || parsedDeliverables <= 0) {
            setSaveError('Number of deliverables must be a positive number.');
            return;
          }
          contractDeliverables = parsedDeliverables;
        }
        const parseDate = (value) => {
          if (!value) return null;
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) return null;
          return parsed;
        };
        const startDateObj = parseDate(form.contractStartDate);
        if (form.contractStartDate && !startDateObj) {
          setSaveError('Invalid contract start date.');
          return;
        }
        const endDateObj = parseDate(form.contractEndDate);
        if (form.contractEndDate && !endDateObj) {
          setSaveError('Invalid contract end date.');
          return;
        }
        contractStartDate = startDateObj ? Timestamp.fromDate(startDateObj) : null;
        contractEndDate = endDateObj ? Timestamp.fromDate(endDateObj) : null;
        contractLink = (form.contractLink || '').trim();
      }

      const data = {
        type: form.type,
        brandCode: normalizedBrandCode,
        title: form.title,
        dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : null,
        numAds,
        numAssets: Number(form.numAssets) || 0,
        inspiration: form.inspiration,
        uploadLink: form.uploadLink,
        assetLinks,
        details: form.details,
        priority: form.priority,
        name: form.name,
        agencyId: form.agencyId,
        toneOfVoice: form.toneOfVoice,
        offering: form.offering,
        brandAssetsLink: form.type === 'newBrand' ? brandAssetsLink : '',
        contractType: form.type === 'newBrand' ? contractType : '',
        contractDeliverables:
          form.type === 'newBrand' && contractDeliverables !== null ? contractDeliverables : null,
        contractStartDate: form.type === 'newBrand' ? contractStartDate : null,
        contractEndDate: form.type === 'newBrand' ? contractEndDate : null,
        contractLink: form.type === 'newBrand' ? contractLink : '',
        designerId: form.designerId || null,
        editorId: showEditorSelect
          ? form.editorId || null
          : filterEditorId || (isProjectManager ? form.editorId || null : auth.currentUser?.uid || form.editorId || null),
        infoNote: form.infoNote,
        productRequests: form.type === 'newAds' ? productRequests : [],
        status: editId ? (requests.find((r) => r.id === editId)?.status || 'new') : 'new',
      };
      if (!editId) {
        data.createdAt = serverTimestamp();
        data.createdBy = auth.currentUser?.uid || null;
        data.createdByName = auth.currentUser?.displayName || auth.currentUser?.email || '';
      }

      if (editId) {
        await updateDoc(doc(db, 'requests', editId), data);
        setRequests((prev) => prev.map((r) => (r.id === editId ? { ...r, ...data } : r)));
        const linked = requests.find((r) => r.id === editId);
        if (linked?.adGroupId) {
          try {
            await updateDoc(doc(db, 'adGroups', linked.adGroupId), {
              dueDate: data.dueDate,
            });
          } catch (err) {
            console.error('Failed to sync ad group due date', err);
          }
        }
        if (
          linked?.projectId &&
          linked.status === 'need info' &&
          linked.infoNote !== data.infoNote
        ) {
          try {
            await updateDoc(doc(db, 'projects', linked.projectId), {
              infoNote: data.infoNote,
            });
          } catch (err) {
            console.error('Failed to sync project info note', err);
          }
        }
      } else {
        const docRef = await addDoc(collection(db, 'requests'), data);
        setRequests((prev) => [...prev, { id: docRef.id, ...data }]);
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save request', err);
      setSaveError('Failed to save request. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this request?')) return;
    try {
      await deleteDoc(doc(db, 'requests', id));
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to delete request', err);
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this request?')) return;
    try {
      await updateDoc(doc(db, 'requests', id), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to archive request', err);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateDoc(doc(db, 'requests', id), { status });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      const req = requests.find((r) => r.id === id);
      if (req?.projectId) {
        if (status === 'need info') {
          try {
            await updateDoc(doc(db, 'projects', req.projectId), {
              status: 'need info',
              infoNote: req.infoNote,
            });
          } catch (err) {
            console.error('Failed to update project status', err);
          }
        } else if (req.status === 'need info') {
          try {
            const update = { infoNote: deleteField() };
            if (status !== 'ready') {
              update.status = status === 'new' ? 'processing' : status;
            }
            await updateDoc(doc(db, 'projects', req.projectId), update);
          } catch (err) {
            console.error('Failed to update project status', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleDragStart = (id) => {
    setDragId(id);
  };

  const handleDrop = (status) => {
    if (!dragId) return;
    handleStatusChange(dragId, status);
    setDragId(null);
  };

  const allowDrop = (e) => e.preventDefault();

  const handleCalendarDrop = async (date) => {
    if (!dragId) return;
    try {
      await updateDoc(doc(db, 'requests', dragId), {
        dueDate: Timestamp.fromDate(date),
      });
      setRequests((prev) =>
        prev.map((r) =>
          r.id === dragId ? { ...r, dueDate: Timestamp.fromDate(date) } : r
        )
      );
      const linked = requests.find((r) => r.id === dragId);
      if (linked?.adGroupId) {
        try {
          await updateDoc(doc(db, 'adGroups', linked.adGroupId), {
            dueDate: Timestamp.fromDate(date),
          });
        } catch (err) {
          console.error('Failed to sync ad group due date', err);
        }
      }
    } catch (err) {
      console.error('Failed to update due date', err);
    }
    setDragId(null);
  };

  const handleBulletList = (e) => {
    if (e.key === ' ' && e.target.selectionStart >= 2) {
      const val = e.target.value;
      const pos = e.target.selectionStart;
      if (
        val.slice(pos - 2, pos) === '- ' &&
        (pos === 2 || val[pos - 3] === '\n')
      ) {
        e.preventDefault();
        const before = val.slice(0, pos - 2);
        const after = val.slice(pos);
        const bullet = '\u2022 ';
        const newVal = before + bullet + after;
        setForm((f) => ({ ...f, details: newVal }));
        setTimeout(() => {
          e.target.selectionStart = e.target.selectionEnd = before.length + bullet.length;
        }, 0);
      }
    }
  };

  const formatDateInputValue = (value) => {
    if (!value) return '';
    try {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value.toDate === 'function') {
        return value.toDate().toISOString().slice(0, 10);
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toISOString().slice(0, 10);
    } catch (err) {
      return '';
    }
  };

  const handleBrandChange = (e) => {
    const code = (e.target.value || '').toUpperCase();
    const availableProducts = getBrandProducts(code);
    setForm((f) => {
      const existing = Array.isArray(f.productRequests) && f.productRequests.length
        ? f.productRequests
        : [createDefaultProductRequest()];
      const resetProducts = existing.map((item) => ({
        ...createDefaultProductRequest(),
        quantity: item?.quantity || '1',
        isNew: availableProducts.length === 0,
      }));
      return {
        ...f,
        brandCode: code,
        productRequests: resetProducts.length
          ? resetProducts
          : [{ ...createDefaultProductRequest(), isNew: availableProducts.length === 0 }],
      };
    });
    const b = brands.find((br) => br.code === code);
    setAiArtStyle(b?.aiArtStyle || '');
  };

  const handleBrandCodeChange = (value) => {
    const sanitized = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    setForm((prev) => ({ ...prev, brandCode: sanitized }));
    if (sanitized.length === 4 && existingBrandCodes.has(sanitized)) {
      setBrandCodeError('This brand code is already in use.');
    } else if (brandCodeError) {
      setBrandCodeError('');
    }
  };

  const generateBrandCode = () => {
    const cleanedName = (form.name || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!cleanedName) {
      setBrandCodeError('Enter a brand name to generate a code.');
      return;
    }
    if (!cleanedName.length) {
      setBrandCodeError('Unable to generate a code from this brand name.');
      return;
    }
    let generated = '';
    const seen = new Set();
    const cycleLength = Math.max(cleanedName.length, 1);
    let attempt = 0;
    while (attempt < cycleLength * 5) {
      let candidate = '';
      for (let i = 0; i < 4; i += 1) {
        candidate += cleanedName[(attempt + i) % cleanedName.length];
      }
      if (!existingBrandCodes.has(candidate)) {
        generated = candidate;
        break;
      }
      if (seen.has(candidate)) {
        break;
      }
      seen.add(candidate);
      attempt += 1;
    }
    if (!generated) {
      setBrandCodeError(
        'All possible codes from this brand name are already in use. Please adjust the name or enter a custom code.'
      );
      return;
    }
    setForm((prev) => ({ ...prev, brandCode: generated }));
    setBrandCodeError('');
  };

  const addAssetLink = () => {
    setForm((f) => ({ ...f, assetLinks: [...(f.assetLinks || []), ''] }));
  };

  const handleAssetLinkChange = (idx, val) => {
    setForm((f) => {
      const arr = [...(f.assetLinks || [])];
      arr[idx] = val;
      return { ...f, assetLinks: arr };
    });
  };

  const handleProductChange = (idx, value) => {
    setForm((f) => {
      const arr = Array.isArray(f.productRequests) && f.productRequests.length
        ? [...f.productRequests]
        : [createDefaultProductRequest()];
      if (!arr[idx]) {
        arr[idx] = createDefaultProductRequest();
      }
      if (value === '__new__') {
        arr[idx] = { ...arr[idx], productName: '', isNew: true };
      } else {
        arr[idx] = { ...arr[idx], productName: value, isNew: false };
      }
      return { ...f, productRequests: arr };
    });
  };

  const handleProductNameChange = (idx, value) => {
    setForm((f) => {
      const arr = Array.isArray(f.productRequests) && f.productRequests.length
        ? [...f.productRequests]
        : [createDefaultProductRequest()];
      if (!arr[idx]) {
        arr[idx] = createDefaultProductRequest();
      }
      arr[idx] = { ...arr[idx], productName: value };
      return { ...f, productRequests: arr };
    });
  };

  const handleProductQuantityChange = (idx, value) => {
    setForm((f) => {
      const arr = Array.isArray(f.productRequests) && f.productRequests.length
        ? [...f.productRequests]
        : [createDefaultProductRequest()];
      if (!arr[idx]) {
        arr[idx] = createDefaultProductRequest();
      }
      let nextValue = value;
      if (value !== '') {
        const num = Number(value);
        if (Number.isNaN(num)) {
          nextValue = arr[idx].quantity || '1';
        } else {
          nextValue = String(Math.max(1, num));
        }
      }
      arr[idx] = { ...arr[idx], quantity: nextValue };
      return { ...f, productRequests: arr };
    });
  };

  const addProductRequest = () => {
    setForm((f) => {
      const list = Array.isArray(f.productRequests) ? [...f.productRequests] : [];
      const availableProducts = getBrandProducts(f.brandCode);
      list.push({
        ...createDefaultProductRequest(),
        isNew: availableProducts.length === 0,
      });
      return { ...f, productRequests: list };
    });
  };

  const removeProductRequest = (idx) => {
    setForm((f) => {
      const list = Array.isArray(f.productRequests) ? [...f.productRequests] : [];
      if (list.length <= 1) return f;
      list.splice(idx, 1);
      return { ...f, productRequests: list };
    });
  };

  // URL verification handled by UrlCheckInput component

  const handleCreateGroup = async (req) => {
    if (req.type === 'newBrand') {
      try {
        await addDoc(collection(db, 'brands'), {
          code: req.brandCode || '',
          name: req.name || '',
          agencyId: req.agencyId || '',
          toneOfVoice: req.toneOfVoice || '',
          offering: req.offering || '',
          archived: false,
          archivedAt: null,
          archivedBy: null,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'requests', req.id), { status: 'done' });
        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'done' } : r)));
      } catch (err) {
        console.error('Failed to create brand', err);
      }
    } else {
      const groupName = req.title?.trim() || `Group ${Date.now()}`;
      try {
        const docRef = await addDoc(collection(db, 'adGroups'), {
          name: groupName,
          brandCode: req.brandCode || '',
          notes: req.details || '',
          uploadedBy: req.createdBy || null,
          projectId: req.projectId || null,
          createdAt: serverTimestamp(),
          status: 'new',
          reviewedCount: 0,
          approvedCount: 0,
          editCount: 0,
          rejectedCount: 0,
          archivedCount: 0,
          thumbnailUrl: '',
          lastUpdated: serverTimestamp(),
          visibility: 'private',
          requireAuth: false,
          requirePassword: false,
          password: '',
          reviewVersion: 2,
          dueDate: req.dueDate || null,
          clientNote: '',
          designerId: req.designerId || null,
          editorId: req.editorId || null,
          requestId: req.id,
        });
        if (req.projectId) {
          await updateDoc(doc(db, 'projects', req.projectId), {
            groupId: docRef.id,
          });
        }
        await updateDoc(doc(db, 'requests', req.id), {
          status: 'done',
          adGroupId: docRef.id,
        });
        setRequests((prev) =>
          prev.map((r) =>
            r.id === req.id ? { ...r, status: 'done', adGroupId: docRef.id } : r
          )
        );
        navigate(`/ad-group/${docRef.id}`);
      } catch (err) {
        console.error('Failed to create group', err);
      }
    }
  };

  const term = filter.toLowerCase();
  const filteredRequests = requests
    .filter(
      (r) =>
        !term ||
        r.brandCode?.toLowerCase().includes(term) ||
        r.title?.toLowerCase().includes(term)
    )
    .sort((a, b) => {
      if (sortField === 'brand') return (a.brandCode || '').localeCompare(b.brandCode || '');
      if (sortField === 'dueDate') {
        const ad = a.dueDate ? (a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate)) : null;
        const bd = b.dueDate ? (b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate)) : null;
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad - bd;
      }
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });

  const newReq = filteredRequests.filter((r) => r.status === 'new');
  const pending = filteredRequests.filter((r) => r.status === 'pending');
  const needInfo = filteredRequests.filter((r) => r.status === 'need info');
  const ready = filteredRequests.filter((r) => r.status === 'ready');
  const done = filteredRequests.filter((r) => r.status === 'done');
  const grouped = { new: newReq, pending, 'need info': needInfo, ready, done };

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Tickets</h1>
      <PageToolbar
        left={(
          <>
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
            <SortButton
              value={sortField}
              onChange={setSortField}
              options={[
                { value: 'createdAt', label: 'Date Created' },
                { value: 'dueDate', label: 'Due Date' },
                { value: 'brand', label: 'Brand' },
              ]}
            />
            {view === 'dashboard' && (
              <div className="relative">
                <IconButton
                  ref={menuBtnRef}
                  onClick={() => setCalendarMenuOpen((o) => !o)}
                  className="bg-transparent hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
                  aria-label="Menu"
                >
                  <FiMoreHorizontal />
                </IconButton>
                {calendarMenuOpen && (
                  <div
                    ref={menuRef}
                    className="absolute left-0 mt-6 z-10 bg-white dark:bg-[var(--dark-sidebar-bg)] border border-gray-300 dark:border-gray-600 rounded shadow text-sm"
                  >
                    <button
                      onClick={() => {
                        setShowWeekends((p) => !p);
                        setCalendarMenuOpen(false);
                      }}
                      className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
                    >
                      {showWeekends ? 'Hide weekends' : 'See weekends'}
                    </button>
                    <button
                      onClick={() => {
                        calendarRef.current?.goToToday();
                        setCalendarMenuOpen(false);
                      }}
                      className="block w-full text-left px-3 py-1 hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)]"
                    >
                      Go to today
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="border-l h-6 mx-2" />
            <TabButton active={view === 'table'} onClick={() => setView('table')} aria-label="Table view">
              <FiList />
            </TabButton>
            <TabButton active={view === 'kanban'} onClick={() => setView('kanban')} aria-label="Kanban view">
              <FiColumns />
            </TabButton>
            <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')} aria-label="Dashboard view">
              <FiCalendar />
            </TabButton>
          </>
        )}
        right={<CreateButton onClick={openCreate} ariaLabel="Add Ticket" />}
      />
      {view === 'table' ? (
        <>
          <div className="mb-8">
            <h2 className="text-xl mb-2">New</h2>
            {loading ? (
              <p>Loading...</p>
            ) : newReq.length === 0 ? (
              <p>No tickets.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Due Date</th>
                    <th># Items</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {newReq.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate && typeof req.dueDate.toDate === 'function' ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds ?? req.numAssets}</td>
                      <td dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="need info">Need Info</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <div className="mb-8">
            <h2 className="text-xl mb-2">Pending</h2>
            {loading ? (
              <p>Loading...</p>
            ) : pending.length === 0 ? (
              <p>No tickets.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Due Date</th>
                    <th># Items</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate && typeof req.dueDate.toDate === 'function' ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds ?? req.numAssets}</td>
                      <td dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="need info">Need Info</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <div className="mb-8">
            <h2 className="text-xl mb-2">Need Info</h2>
            {loading ? (
              <p>Loading...</p>
            ) : needInfo.length === 0 ? (
              <p>No tickets.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Due Date</th>
                    <th># Items</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {needInfo.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate && typeof req.dueDate.toDate === 'function' ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds ?? req.numAssets}</td>
                      <td dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="need info">Need Info</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <div className="mb-8">
            <h2 className="text-xl mb-2">Ready</h2>
            {loading ? (
              <p>Loading...</p>
            ) : ready.length === 0 ? (
              <p>No tickets.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Due Date</th>
                    <th># Items</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ready.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate && typeof req.dueDate.toDate === 'function' ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds ?? req.numAssets}</td>
                      <td dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="need info">Need Info</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <div>
            <h2 className="text-xl mb-2">Done</h2>
            {done.length === 0 ? (
              <p>No tickets.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Due Date</th>
                    <th># Items</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((req) => (
                    <tr key={req.id}>
                      <td>{req.brandCode}</td>
                      <td>{req.dueDate && typeof req.dueDate.toDate === 'function' ? req.dueDate.toDate().toLocaleDateString() : ''}</td>
                      <td>{req.numAds ?? req.numAssets}</td>
                      <td dangerouslySetInnerHTML={{ __html: formatDetails(req.details) }}></td>
                      <td>
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req.id, e.target.value)}
                          className={`status-select status-${req.status.replace(/\s+/g, '_')}`}
                        >
                          <option value="new">New</option>
                          <option value="pending">Pending</option>
                          <option value="need info">Need Info</option>
                          <option value="ready">Ready</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => startEdit(req)} className="mr-2" aria-label="Edit">
                            <FiEdit2 />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(req.id)} aria-label="Delete">
                            <FiTrash />
                          </IconButton>
                          <IconButton onClick={() => handleArchive(req.id)} className="ml-2" aria-label="Archive">
                            <FiArchive />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </>
      ) : view === 'kanban' ? (
        <div className="overflow-x-auto mt-[0.8rem]">
          <div className="min-w-max flex gap-4">
          {['new', 'pending', 'need info', 'ready', 'done'].map((status) => (
            <div
              key={status}
              className="flex-shrink-0 w-[240px] sm:w-[320px]"
              onDragOver={allowDrop}
              onDrop={() => handleDrop(status)}
            >
              <h2 className="text-xl mb-2 capitalize">{status}</h2>
              <div
                className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                style={{ maxHeight: 'calc(100vh - 13rem)' }}
              >
                {loading ? (
                  <p>Loading...</p>
                ) : grouped[status].length === 0 ? (
                  <p>No tickets.</p>
                ) : (
                  <>
                    {grouped[status].map((req) => (
                        <RequestCard
                          key={req.id}
                          request={req}
                          onEdit={startEdit}
                          onDelete={handleDelete}
                          onArchive={handleArchive}
                          onDragStart={handleDragStart}
                          onCreateGroup={handleCreateGroup}
                          onView={openView}
                        />
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto mt-2" style={{ maxHeight: 'calc(100vh - 13rem)' }}>
          <Calendar
            ref={calendarRef}
            requests={filteredRequests}
            showWeekends={showWeekends}
            onDragStart={handleDragStart}
            onDateChange={handleCalendarDrop}
            onCardClick={openView}
          />
        </div>
      )}

      {showModal && (
        <ScrollModal
          header={<h2 className="text-xl p-2 mb-0">{editId ? 'Edit Ticket' : 'Add Ticket'}</h2>}
        >
          <div className="space-y-4 p-2">
          <div>
          <label className="block mb-1 text-sm font-medium">Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="w-full p-2 border rounded"
          >
            <option value="newAds">New Ads</option>
            {!isOps && <option value="newAIAssets">New AI Assets</option>}
            <option value="newBrand">New Brand</option>
            <option value="bug">Bug</option>
            <option value="feature">Feature</option>
          </select>
        </div>
        {showEditorSelect && (
          <div>
            <label className="block mb-1 text-sm font-medium">Editor</label>
            <select
              value={form.editorId}
              onChange={(e) => setForm((f) => ({ ...f, editorId: e.target.value }))}
              className="w-full p-2 border rounded"
            >
              <option value="">Select editor</option>
              {editors.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}
        {form.type === 'newAds' && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand</label>
                <select
                  value={form.brandCode}
                  onChange={handleBrandChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.code} value={b.code}>{b.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              {showDesignerSelect && (
                <div>
                  <label className="block mb-1 text-sm font-medium">Designer</label>
                  <select
                    value={form.designerId}
                    onChange={(e) => setForm((f) => ({ ...f, designerId: e.target.value }))}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select designer</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block mb-1 text-sm font-medium">Products</label>
                <div className="space-y-3">
                  {currentProductRequests.map((prod, idx) => {
                    const selectId = `product-select-${idx}`;
                    const quantityId = `product-quantity-${idx}`;
                    return (
                      <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3 bg-white dark:bg-[var(--dark-card-bg)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label className="block mb-1 text-xs font-medium" htmlFor={selectId}>
                              {`Product${currentProductRequests.length > 1 ? ` ${idx + 1}` : ''}`}
                            </label>
                            <select
                              id={selectId}
                              value={prod.isNew ? '__new__' : prod.productName}
                              onChange={(event) => handleProductChange(idx, event.target.value)}
                              className="w-full p-2 border rounded"
                              disabled={!form.brandCode}
                            >
                              <option value="">Select product</option>
                              {brandProducts.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                              <option value="__new__">Add new product…</option>
                            </select>
                          </div>
                          <div className="w-full sm:w-40">
                            <label className="block mb-1 text-xs font-medium" htmlFor={quantityId}>
                              Quantity
                            </label>
                            <input
                              id={quantityId}
                              type="number"
                              min="1"
                              value={prod.quantity}
                              onChange={(e) => handleProductQuantityChange(idx, e.target.value)}
                              className="w-full p-2 border rounded"
                            />
                          </div>
                          {currentProductRequests.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeProductRequest(idx)}
                              className="text-sm text-red-600 underline self-start sm:self-end"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {prod.isNew && (
                          <div className="mt-3">
                            <label className="block mb-1 text-xs font-medium" htmlFor={`product-name-${idx}`}>
                              New Product Name
                            </label>
                            <input
                              id={`product-name-${idx}`}
                              type="text"
                              value={prod.productName}
                              onChange={(e) => handleProductNameChange(idx, e.target.value)}
                              className="w-full p-2 border rounded"
                              placeholder="Enter product name"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addProductRequest}
                  disabled={!form.brandCode}
                  className={`text-sm underline mt-2 ${form.brandCode ? 'text-blue-600' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                >
                  Add another product
                </button>
                {!form.brandCode && (
                  <p className="text-xs text-gray-500 mt-1">Select a brand to choose products.</p>
                )}
                {totalAdsRequested > 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Total ads requested: {totalAdsRequested}
                  </p>
                )}
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Gdrive Asset Link</label>
                {form.assetLinks.map((link, idx) => (
                  <UrlCheckInput
                    key={idx}
                    value={link}
                    onChange={(val) => handleAssetLinkChange(idx, val)}
                    inputClass="p-2"
                    className="mb-1"
                    required={idx === 0}
                  />
                ))}
                <button type="button" onClick={addAssetLink} className="text-sm text-blue-600 underline mb-2">
                  Add another link
                </button>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Details</label>
                <textarea
                  value={form.details}
                  onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  onKeyDown={handleBulletList}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
            </>
        )}

        {form.type === 'newAIAssets' && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand</label>
                <select
                  value={form.brandCode}
                  onChange={handleBrandChange}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.code} value={b.code}>{b.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <button type="button" onClick={async () => aiArtStyle && navigator.clipboard.writeText(aiArtStyle)} className="btn-secondary">
                  Copy AI Art Style
                </button>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Number of Assets</label>
                <input
                  type="number"
                  min="1"
                  value={form.numAssets}
                  onChange={(e) => setForm((f) => ({ ...f, numAssets: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Inspiration</label>
                <textarea
                  value={form.inspiration}
                  onChange={(e) => setForm((f) => ({ ...f, inspiration: e.target.value }))}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Upload Link</label>
                <input
                  type="text"
                  value={form.uploadLink}
                  onChange={(e) => setForm((f) => ({ ...f, uploadLink: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
            </>
          )}

          {form.type === 'newBrand' && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    if (brandCodeError) setBrandCodeError('');
                  }}
                  className="w-full p-2 border rounded"
                  placeholder="Enter brand name"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Brand Code</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <input
                    type="text"
                    value={form.brandCode}
                    onChange={(e) => handleBrandCodeChange(e.target.value)}
                    className="w-full p-2 border rounded uppercase tracking-widest"
                    maxLength={4}
                    placeholder="Auto-generate or enter code"
                  />
                  <button
                    type="button"
                    onClick={generateBrandCode}
                    disabled={!form.name.trim()}
                    className={`btn-secondary whitespace-nowrap ${
                      form.name.trim() ? '' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    Generate Code
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                  Code must be four letters derived from the brand name.
                </p>
                {brandCodeError && (
                  <p className="text-xs text-red-600 mt-1">{brandCodeError}</p>
                )}
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Agency ID</label>
                <select
                  value={form.agencyId}
                  onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select agency</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Tone of Voice</label>
                <input
                  type="text"
                  value={form.toneOfVoice}
                  onChange={(e) => setForm((f) => ({ ...f, toneOfVoice: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Offering</label>
                <input
                  type="text"
                  value={form.offering}
                  onChange={(e) => setForm((f) => ({ ...f, offering: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-semibold text-black dark:text-[var(--dark-text)] mb-2">
                  Brand Assets
                </h3>
                <label className="block mb-1 text-sm font-medium">Google Drive Link</label>
                <UrlCheckInput
                  value={form.brandAssetsLink}
                  onChange={(val) => setForm((f) => ({ ...f, brandAssetsLink: val }))}
                  inputClass="p-2"
                  required
                />
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-semibold text-black dark:text-[var(--dark-text)] mb-2">
                  Contract
                </h3>
                <div className="mb-3">
                  <span className="block mb-1 text-sm font-medium">Type</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, contractType: 'production' }))}
                      className={`px-3 py-1 rounded border text-sm transition-colors ${
                        form.contractType === 'briefs'
                          ? 'bg-white dark:bg-[var(--dark-card-bg)] text-gray-700 dark:text-[var(--dark-text)] border-gray-300 dark:border-gray-600'
                          : 'bg-blue-600 text-white border-blue-600'
                      }`}
                    >
                      Production
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, contractType: 'briefs' }))}
                      className={`px-3 py-1 rounded border text-sm transition-colors ${
                        form.contractType === 'briefs'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-[var(--dark-card-bg)] text-gray-700 dark:text-[var(--dark-text)] border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      Briefs
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block mb-1 text-sm font-medium">Number of Deliverables</label>
                  <input
                    type="number"
                    min="1"
                    value={form.contractDeliverables}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, contractDeliverables: e.target.value }))
                    }
                    className="w-full p-2 border rounded"
                    placeholder="Enter number of deliverables"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block mb-1 text-sm font-medium">Start Date</label>
                    <input
                      type="date"
                      value={form.contractStartDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, contractStartDate: e.target.value }))
                      }
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium">End Date</label>
                    <input
                      type="date"
                      value={form.contractEndDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, contractEndDate: e.target.value }))
                      }
                      className="w-full p-2 border rounded"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block mb-1 text-sm font-medium">Contract Link</label>
                  <input
                    type="text"
                    value={form.contractLink}
                    onChange={(e) => setForm((f) => ({ ...f, contractLink: e.target.value }))}
                    className="w-full p-2 border rounded"
                    placeholder="Paste contract link"
                  />
                </div>
              </div>
            </>
        )}

          {(form.type === 'bug' || form.type === 'feature') && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Description</label>
                <textarea
                  value={form.details}
                  onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                  onKeyDown={handleBulletList}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full p-2 border rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </>
          )}
        {editStatus === 'need info' && (
          <div>
            <label className="block mb-1 text-sm font-medium">Info Needed</label>
            <textarea
              value={form.infoNote}
              onChange={(e) => setForm((f) => ({ ...f, infoNote: e.target.value }))}
              className="w-full p-2 border rounded"
              rows={3}
            />
          </div>
        )}
        </div>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        <div className="text-right mt-4 space-x-2">
            <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button
              onClick={() => { setShowModal(false); resetForm(); }}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </ScrollModal>
      )}
      {viewRequest && (
        <RequestViewModal
          request={viewRequest}
          onClose={() => setViewRequest(null)}
          onEdit={startEdit}
        />
      )}
    </div>
  );
};

export default AdminRequests;
