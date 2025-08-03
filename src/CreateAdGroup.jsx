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
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import RecipePreview from './RecipePreview.jsx';
import { uploadFile } from './uploadFile.js';

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

  const handleSave = async (recipes, briefNote, briefAssets) => {
    if (!brandCode) {
      console.warn('handleSave called without brandCode');
    }
    if (!title.trim()) return;
    try {
      const groupRef = await addDoc(collection(db, 'adGroups'), {
        name: title.trim(),
        brandCode,
        status: 'briefed',
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
        ...(briefNote ? { notes: briefNote } : {}),
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
        const batch = writeBatch(db);
        recipes.forEach((r) => {
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
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      navigate(`/ad-group/${groupRef.id}`);
    } catch (err) {
      console.error('Failed to create ad group', err);
    }
  };

  return (
    <div className={`${asModal ? '' : 'min-h-screen mt-10'} p-4 max-w-[50rem] mx-auto`}>
      {step === 1 && <h2 className="text-xl font-semibold mb-4">Generate a Brief</h2>}
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

