import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from './firebase/config';

const useSubscriptionPlans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const plansCollection = collection(db, 'siteSettings', 'site', 'subscriptionPlans');

  const loadPlans = async () => {
    const snap = await getDocs(plansCollection);
    setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    loadPlans()
      .catch((err) => {
        console.error('Failed to load subscription plans', err);
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const createPlan = async (data) => {
    const docRef = await addDoc(plansCollection, data);
    setPlans((prev) => [...prev, { id: docRef.id, ...data }]);
  };

  const updatePlan = async (id, data) => {
    await updateDoc(doc(plansCollection, id), data);
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  };

  const deletePlan = async (id) => {
    await deleteDoc(doc(plansCollection, id));
    setPlans((prev) => prev.filter((p) => p.id !== id));
  };

  return { plans, loading, createPlan, updatePlan, deletePlan };
};

export default useSubscriptionPlans;
