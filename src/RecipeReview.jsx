import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase/config';
import parseAdFilename from './utils/parseAdFilename';
import {
  fetchReadyRecipes,
  recordRecipeDecision,
} from './utils/recipeReview';

const RecipeReview = ({
  user,
  brandCodes = [],
  groupId = null,
  reviewerName = '',
  userRole = null,
}) => {
  const [recipes, setRecipes] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const list = await fetchReadyRecipes({ groupId, brandCodes });
        const full = await Promise.all(
          list.map(async (r) => {
            const snap = await getDocs(
              collection(db, 'adGroups', r.groupId, 'recipes', r.id, 'assets')
            );
            const assets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const order = { '9x16': 0, '3x5': 1, '1x1': 2 };
            assets.sort(
              (a, b) => (order[a.aspectRatio] ?? 99) - (order[b.aspectRatio] ?? 99)
            );
            return { ...r, assets, hero: assets[0] || null };
          })
        );
        setRecipes(full);
        setIndex(0);
      } catch (err) {
        console.error('Failed to load recipes', err);
        setRecipes([]);
      } finally {
        setLoading(false);
      }
    };
    if (user?.uid) load();
  }, [user, groupId, brandCodes]);

  const current = recipes[index];

  const submit = async (dec) => {
    if (!current) return;
    await recordRecipeDecision(current.groupId, current.id, dec, {
      userId: user?.uid || null,
      userEmail: user?.email || null,
      reviewerName,
      userRole,
    }, dec === 'edit' ? comment : '');
    setComment('');
    setDecision(null);
    setIndex((i) => i + 1);
  };

  const startEdit = () => {
    setDecision('edit');
    setComment('');
  };

  if (loading) return <div className="text-center mt-10">Loading...</div>;
  if (!current) {
    return <div className="text-center mt-10">No recipes ready for review.</div>;
  }

  const filename = current.hero?.filename || '';
  const info = parseAdFilename(filename);

  return (
    <div className="flex flex-col items-center space-y-4 mt-4">
      {current.hero && (
        <img
          src={current.hero.firebaseUrl}
          alt={current.hero.filename}
          className="max-h-[70vh]"
        />
      )}
      <div>Recipe {info.recipeCode || current.id}</div>
      <div className="flex space-x-2">
        <button className="btn-approve" onClick={() => submit('approve')}>
          Approve
        </button>
        <button className="btn-reject" onClick={() => submit('reject')}>
          Reject
        </button>
        <button className="btn-edit" onClick={startEdit}>
          Request Edit
        </button>
      </div>
      {decision === 'edit' && (
        <div className="flex flex-col items-center space-y-2 w-full max-w-sm">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="border p-2 w-full"
            rows={3}
          />
          <button className="btn-primary" onClick={() => submit('edit')}>
            Submit Edit
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipeReview;

