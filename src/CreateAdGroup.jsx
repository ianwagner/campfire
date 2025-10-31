// © 2025 Studio Tak. All rights reserved.
// This file is part of a proprietary software project. Do not distribute.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  getDoc,
  Timestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import RecipePreview from './RecipePreview.jsx';
import { uploadFile } from './uploadFile.js';
import { deductRecipeCredits } from './utils/credits.js';

const CreateAdGroup = ({ showSidebar = true, asModal = false }) => {
  const [title, setTitle] = useState('');
  const [step, setStep] = useState(1);
  const [brandCodes, setBrandCodes] = useState([]);
  const [brandCode, setBrandCode] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCodes = async () => {
      if (!auth.currentUser?.uid) {
        setBrandCodes([]);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const codes = snap.exists() ? snap.data().brandCodes : [];
        if (Array.isArray(codes)) {
          setBrandCodes(codes);
          setBrandCode(codes[0] || '');
        } else {
          setBrandCodes([]);
        }
      } catch (err) {
        console.error('Failed to fetch brand codes', err);
        setBrandCodes([]);
      }
    };
    fetchCodes();
  }, []);

  const handleSave = async (recipes, briefNote, briefAssets, month, dueDate) => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) return;
    try {
      let defaultIntegrationId = null;
      let defaultIntegrationName = '';
      let defaultDesignerId = null;
      let defaultEditorId = null;
      if (brandCode) {
        try {
          const brandSnap = await getDocs(
            query(collection(db, 'brands'), where('code', '==', brandCode)),
          );
          if (!brandSnap.empty) {
            const brandData = brandSnap.docs[0].data() || {};
            if (typeof brandData.defaultIntegrationId === 'string') {
              defaultIntegrationId = brandData.defaultIntegrationId;
            }
            if (typeof brandData.defaultIntegrationName === 'string') {
              defaultIntegrationName = brandData.defaultIntegrationName;
            }
            if (typeof brandData.defaultDesignerId === 'string') {
              defaultDesignerId = brandData.defaultDesignerId;
            }
            if (typeof brandData.defaultEditorId === 'string') {
              defaultEditorId = brandData.defaultEditorId;
            }
            const agencyId = typeof brandData.agencyId === 'string' ? brandData.agencyId : '';
            if (!defaultIntegrationId && agencyId) {
              try {
                const agencySnap = await getDoc(doc(db, 'agencies', agencyId));
                if (agencySnap.exists()) {
                  const agencyData = agencySnap.data() || {};
                  if (typeof agencyData.defaultIntegrationId === 'string') {
                    defaultIntegrationId = agencyData.defaultIntegrationId;
                  }
                  if (typeof agencyData.defaultIntegrationName === 'string') {
                    defaultIntegrationName = agencyData.defaultIntegrationName;
                  }
                }
              } catch (err) {
                console.error('Failed to load agency defaults for integration', err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to load brand defaults for integration', err);
        }
      }

      const groupRef = await addDoc(collection(db, 'adGroups'), {
        name: title.trim(),
        brandCode,
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
        reviewVersion: 2,
        month: month || null,
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        ...(briefNote ? { notes: briefNote } : {}),
        assignedIntegrationId: defaultIntegrationId || null,
        assignedIntegrationName: defaultIntegrationName || '',
        designerId: defaultDesignerId || null,
        editorId: defaultEditorId || null,
      });

      if (Array.isArray(briefAssets) && briefAssets.length > 0) {
        for (const file of briefAssets) {
          try {
            const url = await uploadFile(file, groupRef.id, brandCode, title.trim());
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

      navigate(`/ad-group/${groupRef.id}`);
    } catch (err) {
      console.error('Failed to create ad group', err);
    }
  };

  return (
    <div className={`${asModal ? '' : 'min-h-screen mt-10'} p-4 max-w-[50rem] mx-auto`}>
      {step === 1 && <h2 className="text-xl font-semibold mb-4">Create Project</h2>}
      <RecipePreview
        onSave={handleSave}
        brandCode={brandCode}
        allowedBrandCodes={brandCodes}
        hideBrandSelect={brandCodes.length <= 1}
        externalOnly
        title={title}
        onTitleChange={setTitle}
        onStepChange={setStep}
        onBrandCodeChange={setBrandCode}
        showBriefExtras
      />
    </div>
  );
};

export default CreateAdGroup;

