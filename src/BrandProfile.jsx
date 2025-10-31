import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase/config';
import useUserRole from './useUserRole';
import BrandSetup from './BrandSetup';
import AssetLibrary from './AssetLibrary.jsx';
import ReviewLibrary from './ReviewLibrary.jsx';
import BrandProducts from './BrandProducts.jsx';
import BrandCampaigns from './BrandCampaigns.jsx';
import TabButton from './components/TabButton.jsx';
import BrandCard from './components/BrandCard.jsx';
import {
  FiSettings,
  FiFolder,
  FiStar,
  FiShoppingCart,
  FiMessageCircle,
  FiFileText,
  FiFeather,
  FiFlag,
  FiBookOpen,
  FiMessageSquare,
  FiUser,
  FiAtSign,
  FiUsers,
} from 'react-icons/fi';
import BrandTone from './BrandTone.jsx';
import BrandContracts from './BrandContracts.jsx';
import BrandAIArtStyle from './BrandAIArtStyle.jsx';
import BrandNotes from './BrandNotes.jsx';
import BrandFeedback from './BrandFeedback.jsx';
import BrandSlackMentions from './BrandSlackMentions.jsx';
import BrandStaffAssignment from './BrandStaffAssignment.jsx';

const BrandProfile = ({ brandId: propId = null, backPath }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const brandId = propId || id || null;
  const user = auth.currentUser;
  const { role, brandCodes } = useUserRole(user?.uid);
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tab, setTab] = useState('setup');
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const isAdmin = role === 'admin';
  const canManageSlackMentions = ['admin', 'ops', 'client'].includes(role);
  const canManageStaffAssignments = ['admin', 'project-manager'].includes(role);
  const adminDirectoryRole = ['admin', 'manager', 'project-manager'].includes(role);
  const resolvedBackPath = backPath || (adminDirectoryRole ? '/admin/brands' : '/brand-profile');

  useEffect(() => {
    const load = async () => {
      if (brandId) {
        try {
          const snap = await getDoc(doc(db, 'brands', brandId));
          if (snap.exists()) {
            const data = snap.data();
            setBrand({ id: snap.id, ...data });
            setBrandCode(data.code || '');
            setBrandName(data.name || '');
          } else {
            setBrand(null);
            setBrandCode('');
            setBrandName('');
          }
        } catch (err) {
          console.error('Failed to load brand', err);
          setBrand(null);
          setBrandCode('');
          setBrandName('');
        }
      } else if (brandCodes.length === 1) {
        const code = brandCodes[0];
        setBrandCode(code);
        try {
          const q = query(collection(db, 'brands'), where('code', '==', code));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            setBrand({ id: snap.docs[0].id, ...data });
            setBrandName(data.name || code);
          } else {
            setBrand(null);
            setBrandName(code);
          }
        } catch (err) {
          console.error('Failed to load brand by code', err);
          setBrand(null);
          setBrandName(code);
        }
      } else if (brandCodes.length > 1) {
        setLoading(true);
        try {
          const base = collection(db, 'brands');
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const docs = [];
          for (const chunk of chunks) {
            const q = query(base, where('code', 'in', chunk));
            const snap = await getDocs(q);
            docs.push(...snap.docs);
          }
          setBrands(docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
          console.error('Failed to load brands', err);
          setBrands([]);
        } finally {
          setLoading(false);
        }
      }
    };
    load();
  }, [brandId, brandCodes]);

  useEffect(() => {
    setActionMessage('');
    setActionError('');
  }, [tab, brandId]);

  const handleArchive = async () => {
    if (!brandId) return;
    setActionBusy(true);
    setActionMessage('');
    setActionError('');
    try {
      await updateDoc(doc(db, 'brands', brandId), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user?.uid || null,
      });
      setBrand((prev) =>
        prev
          ? {
              ...prev,
              archived: true,
              archivedAt: new Date(),
              archivedBy: user?.uid || null,
            }
          : prev
      );
      setActionMessage('Brand archived.');
    } catch (err) {
      console.error('Failed to archive brand', err);
      setActionError('Failed to archive brand.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!brandId) return;
    setActionBusy(true);
    setActionMessage('');
    setActionError('');
    try {
      await updateDoc(doc(db, 'brands', brandId), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
      });
      setBrand((prev) =>
        prev
          ? {
              ...prev,
              archived: false,
              archivedAt: null,
              archivedBy: null,
            }
          : prev
      );
      setActionMessage('Brand restored.');
    } catch (err) {
      console.error('Failed to restore brand', err);
      setActionError('Failed to restore brand.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!brandId) return;
    if (!window.confirm('Delete this brand? This cannot be undone.')) return;
    setActionBusy(true);
    setActionMessage('');
    setActionError('');
    try {
      await deleteDoc(doc(db, 'brands', brandId));
      setActionMessage('Brand deleted.');
      navigate(resolvedBackPath);
    } catch (err) {
      console.error('Failed to delete brand', err);
      setActionError('Failed to delete brand.');
    } finally {
      setActionBusy(false);
    }
  };
  if (!brandId && brandCodes.length > 1) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
        <div className="px-4 py-6">
          <div className="mx-auto max-w-6xl">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Profile</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Select a brand to view setup, feedback, and assets in one place.
                  </p>
                </div>
              </div>
              <div className="mt-6">
                {loading ? (
                  <div className="flex justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                    Loading brands...
                  </div>
                ) : brands.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {brands.map((b) => (
                      <Link
                        key={b.id}
                        to={`/brand-profile/${b.id}`}
                        className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[var(--dark-sidebar)]"
                      >
                        <BrandCard brand={b} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)] dark:text-gray-400">
                    No brands available yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--dark-bg)]">
      <div className="px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center">
            {id && (
              <Link to={resolvedBackPath} className="btn-arrow mr-2" aria-label="Back">
                &lt;
              </Link>
            )}
            <h1 className="text-2xl">{brandName || 'Brand Profile'}</h1>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
            <TabButton active={tab === 'setup'} onClick={() => setTab('setup')}>
              <FiSettings /> <span>Brand Setup</span>
            </TabButton>
            <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
              <FiFolder /> <span>Asset Library</span>
            </TabButton>
            <TabButton active={tab === 'tone'} onClick={() => setTab('tone')}>
              <FiMessageCircle /> <span>Tone of Voice</span>
            </TabButton>
            <TabButton active={tab === 'ai'} onClick={() => setTab('ai')}>
              <FiFeather /> <span>AI Art Style</span>
            </TabButton>
            <TabButton active={tab === 'reviews'} onClick={() => setTab('reviews')}>
              <FiStar /> <span>Customer Reviews</span>
            </TabButton>
            <TabButton active={tab === 'products'} onClick={() => setTab('products')}>
              <FiShoppingCart /> <span>Products</span>
            </TabButton>
            <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
              <FiFlag /> <span>Campaigns</span>
            </TabButton>
            <TabButton active={tab === 'feedback'} onClick={() => setTab('feedback')}>
              <FiMessageSquare /> <span>Feedback</span>
            </TabButton>
            {canManageSlackMentions && (
              <TabButton active={tab === 'slack'} onClick={() => setTab('slack')}>
                <FiAtSign /> <span>Slack Mentions</span>
              </TabButton>
            )}
            <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
              <FiBookOpen /> <span>Notes</span>
            </TabButton>
            <TabButton active={tab === 'contracts'} onClick={() => setTab('contracts')}>
              <FiFileText /> <span>Contracts</span>
            </TabButton>
            {canManageStaffAssignments && brandId && (
              <TabButton active={tab === 'staff'} onClick={() => setTab('staff')}>
                <FiUsers /> <span>Staff Assignment</span>
              </TabButton>
            )}
            {isAdmin && brandId && (
              <TabButton active={tab === 'account'} onClick={() => setTab('account')}>
                <FiUser /> <span>Account</span>
              </TabButton>
            )}
          </div>
          <div className="pb-6">
            {tab === 'setup' && <BrandSetup brandId={brandId} />}
            {tab === 'tone' && <BrandTone brandId={brandId} brandCode={brandCode} />}
            {tab === 'ai' && <BrandAIArtStyle brandId={brandId} brandCode={brandCode} />}
            {tab === 'library' && <AssetLibrary brandCode={brandCode} />}
            {tab === 'reviews' && <ReviewLibrary brandCode={brandCode} />}
            {tab === 'products' && <BrandProducts brandId={brandId} brandCode={brandCode} />}
            {tab === 'campaigns' && <BrandCampaigns brandId={brandId} brandCode={brandCode} />}
            {tab === 'feedback' && (
              <BrandFeedback brandId={brandId} brandCode={brandCode} brandName={brandName} />
            )}
            {tab === 'slack' && canManageSlackMentions && (
              <BrandSlackMentions brandId={brandId} brandCode={brandCode} />
            )}
            {tab === 'notes' && <BrandNotes brandId={brandId} />}
            {tab === 'contracts' && (
              <BrandContracts brandId={brandId} brandCode={brandCode} />
            )}
            {tab === 'staff' && canManageStaffAssignments && brandId && (
              <BrandStaffAssignment brandId={brandId} brand={brand} onBrandUpdate={setBrand} />
            )}
            {tab === 'account' && isAdmin && brandId && (
              <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Brand account</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Archive the brand to hide it from most listings, restore it to reactivate, or permanently delete it.
                  </p>
                </div>
                {actionMessage && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
                    {actionMessage}
                  </div>
                )}
                {actionError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                    {actionError}
                  </div>
                )}
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]">
                    <dt className="font-medium text-gray-700 dark:text-gray-200">Status</dt>
                    <dd className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                      {brand ? (brand.archived ? 'Archived' : 'Active') : 'Unknown'}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-[var(--border-color-default)] dark:bg-[var(--dark-bg)]">
                    <dt className="font-medium text-gray-700 dark:text-gray-200">Brand code</dt>
                    <dd className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{brandCode || '—'}</dd>
                  </div>
                </dl>
                {!brand && (
                  <p className="text-sm text-gray-500 dark:text-gray-300">
                    Brand details are still loading. Account actions will be enabled once the brand information is available.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {brand?.archived ? (
                    <button
                      type="button"
                      onClick={handleRestore}
                      disabled={actionBusy || !brand}
                      className={`btn-primary ${
                        actionBusy || !brand ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                    >
                      Restore Brand
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={actionBusy || !brand}
                      className={`btn-secondary ${
                        actionBusy || !brand ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                    >
                      Archive Brand
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={actionBusy}
                    className={[
                      'rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
                      'hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500 dark:bg-red-600',
                    ].join(' ')}
                  >
                    Delete Brand
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandProfile;
