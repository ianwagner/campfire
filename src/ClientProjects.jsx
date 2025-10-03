import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import Modal from './components/Modal.jsx';
import RecipePreview from './RecipePreview.jsx';
import DescribeProjectModal from './DescribeProjectModal.jsx';
import OptimizedImage from './components/OptimizedImage.jsx';
import useSiteSettings from './useSiteSettings';
import { FiFileText } from 'react-icons/fi';
import { FilePlus } from 'lucide-react';
import { uploadFile } from './uploadFile.js';
import { deductRecipeCredits } from './utils/credits.js';
import useUserRole from './useUserRole';
import useAgencyTheme from './useAgencyTheme';

const OptionButton = ({ icon: Icon, title, desc, onClick }) => (
  <button
    className="border rounded-xl p-4 text-left hover:bg-gray-100 dark:hover:bg-[var(--dark-sidebar-hover)] bg-white dark:bg-[var(--dark-sidebar-bg)] flex flex-col items-start w-full"
    onClick={onClick}
  >
    <div className="text-2xl mb-2">
      <Icon />
    </div>
    <span className="font-semibold mb-1">{title}</span>
    <p className="text-sm text-gray-600 dark:text-gray-300">{desc}</p>
  </button>
);

const CreateProjectModal = ({
  onClose,
  brandCodes = [],
  allowedRecipeTypes = [],
  agencyIdOverride,
  uploadedByOverride,
}) => {
  const [title, setTitle] = useState('');
  const [step, setStep] = useState(1);
  const [brandCode, setBrandCode] = useState(brandCodes[0] || '');
  const { agencyId: userAgencyId } = useUserRole(auth.currentUser?.uid);
  const effectiveAgencyId = agencyIdOverride ?? userAgencyId;
  const uploadedBy = uploadedByOverride ?? auth.currentUser?.uid ?? null;

  const handleSave = async (
    recipes,
    briefNote,
    briefAssets,
    month,
    dueDate
  ) => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) {
      window.alert('Please enter a title before saving.');
      return;
    }
    try {
      const groupRef = await addDoc(collection(db, 'adGroups'), {
        name: title.trim(),
        brandCode,
        status: 'new',
        uploadedBy,
        agencyId: effectiveAgencyId || null,
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
        reviewVersion: 2,
        month: month || null,
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        ...(briefNote ? { notes: briefNote } : {}),
      });

      if (Array.isArray(briefAssets) && briefAssets.length > 0) {
        for (const file of briefAssets) {
          try {
            const url = await uploadFile(
              file,
              groupRef.id,
              brandCode,
              title.trim(),
            );
            await addDoc(collection(db, 'adGroups', groupRef.id, 'groupAssets'), {
              filename: file.name,
              firebaseUrl: url,
              uploadedAt: serverTimestamp(),
              brandCode,
              note: '',
            });
          } catch (err) {
            console.error('Brief upload failed', err);
          }
        }
      }

      if (Array.isArray(recipes) && recipes.length > 0) {
        const typeIds = [...new Set(recipes.map((r) => r.type).filter(Boolean))];
        const costMap = {};
        for (const t of typeIds) {
          try {
            const snap = await getDoc(doc(db, 'recipeTypes', t));
            costMap[t] =
              snap.exists() && typeof snap.data().creditCost === 'number'
                ? snap.data().creditCost
                : 0;
          } catch {
            costMap[t] = 0;
          }
        }
        const batch = writeBatch(db);
        recipes.forEach((r) => {
          const cost = costMap[r.type] || 0;
          const ref = doc(db, 'adGroups', groupRef.id, 'recipes', String(r.recipeNo));
          batch.set(
            ref,
            {
              components: r.components,
              copy: r.copy,
              assets: r.assets || [],
              type: r.type || '',
              selected: r.selected || false,
              brandCode: r.brandCode || brandCode,
              creditsCharged: cost > 0,
            },
            { merge: true }
          );
        });
        await batch.commit();
        for (const r of recipes) {
          const cost = costMap[r.type] || 0;
          if (cost > 0) {
            await deductRecipeCredits(
              r.brandCode || brandCode,
              cost,
              `${groupRef.id}_${r.recipeNo}`
            );
          }
        }
      }

      onClose({
        groupId: groupRef.id,
      });
    } catch (err) {
      console.error('Failed to create project', err);
    }
  };

  return (
    <Modal sizeClass="max-w-[50rem] w-full max-h-[90vh] overflow-auto">
      {step === 1 && <h2 className="text-xl font-semibold mb-4">New Project</h2>}
      <RecipePreview
        onSave={handleSave}
        brandCode={brandCode}
        allowedBrandCodes={brandCodes}
        hideBrandSelect={brandCodes.length <= 1}
        externalOnly
        allowedTypeIds={allowedRecipeTypes}
        title={title}
        onTitleChange={setTitle}
        onStepChange={setStep}
        onBrandCodeChange={setBrandCode}
        showBriefExtras
      />
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={() => onClose(null)}>Cancel</button>
      </div>
    </Modal>
  );
};

const ClientProjects = ({
  brandCodes = [],
  agencyIdOverride,
  uploadedByOverride,
  introTextOverride,
  showUpgradeNotice = true,
  showHero = true,
}) => {
  const [modalStep, setModalStep] = useState(null); // null | 'brief' | 'describe'
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const { agencyId: userAgencyId } = useUserRole(auth.currentUser?.uid);
  const effectiveAgencyId = agencyIdOverride ?? userAgencyId;
  const { agency } = useAgencyTheme(effectiveAgencyId);

  const handleCreated = (proj) => {
    setModalStep(null);
    if (proj?.groupId) {
      navigate(`/ad-group/${proj.groupId}`);
    }
  };

  const firstName = auth.currentUser?.displayName?.split(' ')[0];
  const introText =
    introTextOverride ||
    (firstName
      ? `Hey ${firstName}, how would you like to start?`
      : 'How would you like to start?');

  return (
    <div className="min-h-screen p-4 flex flex-col items-center overflow-y-auto snap-y snap-mandatory scroll-smooth">
      <div className="w-full flex flex-col items-center">
        {showHero && settings?.artworkUrl && (
          <section className="snap-start w-full">
            <div className="max-w-[60rem] w-full mx-auto mt-4 h-[25rem] overflow-hidden rounded-lg mb-6 flex items-center justify-center">
              <OptimizedImage
                pngUrl={settings.artworkUrl}
                alt="Artwork"
                loading="eager"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </section>
        )}
        <section className="snap-start w-full flex flex-col items-center">
          <div className="max-w-xl w-full flex flex-col items-center text-center mb-6">
            <h1 className="text-2xl mb-4">{introText}</h1>
            {(() => {
              const describeEnabled = agency.enableDescribeProject !== false;
              const briefEnabled = agency.enableGenerateBrief !== false;
              const optionCount = (describeEnabled ? 1 : 0) + (briefEnabled ? 1 : 0);
              return (
                <div
                  className={`grid grid-cols-1 gap-4 w-full justify-items-center ${
                    optionCount > 1 ? 'sm:grid-cols-2' : ''
                  }`}
                >
                  {describeEnabled && (
                    <OptionButton
                      icon={FiFileText}
                      title="Describe Project"
                      desc="Just tell us what you need. We'll generate a brief"
                      onClick={() => setModalStep('describe')}
                    />
                  )}
                  {briefEnabled && (
                    <OptionButton
                      icon={FilePlus}
                      title="Create Project"
                      desc="Craft your own brief. Choose copy, visuals and layouts"
                      onClick={() => setModalStep('brief')}
                    />
                  )}
                </div>
              );
            })()}
          </div>
          {showUpgradeNotice && (
            <p className="mt-16 text-sm text-gray-600 dark:text-gray-300">
              Projects have been upgraded - see them here:{' '}
              <a className="text-blue-600 underline" href="/ad-groups">
                Ad Groups
              </a>
            </p>
          )}
        </section>
      </div>
      {modalStep === 'brief' && (
        <CreateProjectModal
          onClose={handleCreated}
          brandCodes={brandCodes}
          allowedRecipeTypes={agency.allowedRecipeTypes || []}
          agencyIdOverride={effectiveAgencyId}
          uploadedByOverride={uploadedByOverride}
        />
      )}
      {modalStep === 'describe' && agency.enableDescribeProject !== false && (
        <DescribeProjectModal
          onClose={handleCreated}
          brandCodes={brandCodes}
          agencyIdOverride={effectiveAgencyId}
          createdByOverride={uploadedByOverride}
        />
      )}
    </div>
  );
};

export default ClientProjects;
