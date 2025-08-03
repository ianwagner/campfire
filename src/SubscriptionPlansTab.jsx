import React, { useEffect, useState } from 'react';
import useSubscriptionPlans from './useSubscriptionPlans';

const emptyPlan = {
  name: '',
  description: '',
  monthlyCredits: '',
  isEnterprise: false,
  stripePriceId: '',
};

const SubscriptionPlansTab = () => {
  const { plans, loading, createPlan, updatePlan, deletePlan } = useSubscriptionPlans();
  const [newPlan, setNewPlan] = useState(emptyPlan);
  const [editPlans, setEditPlans] = useState({});

  useEffect(() => {
    const map = {};
    plans.forEach((p) => {
      map[p.id] = {
        name: p.name || '',
        description: p.description || '',
        monthlyCredits: p.monthlyCredits ?? '',
        isEnterprise: p.isEnterprise || false,
        stripePriceId: p.stripePriceId || '',
      };
    });
    setEditPlans(map);
  }, [plans]);

  const handleEditChange = (id, field, value) => {
    setEditPlans((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSave = async (id) => {
    const data = editPlans[id];
    const payload = {
      name: data.name,
      description: data.description,
      monthlyCredits: Number(data.monthlyCredits) || 0,
      isEnterprise: !!data.isEnterprise,
    };
    if (data.stripePriceId) {
      payload.stripePriceId = data.stripePriceId;
    }
    await updatePlan(id, payload);
  };

  const handleCreate = async () => {
    const payload = {
      name: newPlan.name,
      description: newPlan.description,
      monthlyCredits: Number(newPlan.monthlyCredits) || 0,
      isEnterprise: !!newPlan.isEnterprise,
    };
    if (newPlan.stripePriceId) {
      payload.stripePriceId = newPlan.stripePriceId;
    }
    await createPlan(payload);
    setNewPlan(emptyPlan);
  };

  const handleDelete = async (id) => {
    await deletePlan(id);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-xl">
      {plans.map((plan) => (
        <div key={plan.id} className="border p-4 rounded space-y-2">
          <input
            type="text"
            placeholder="Name"
            value={editPlans[plan.id]?.name || ''}
            onChange={(e) => handleEditChange(plan.id, 'name', e.target.value)}
            className="w-full p-2 border rounded"
          />
          <textarea
            placeholder="Description"
            value={editPlans[plan.id]?.description || ''}
            onChange={(e) => handleEditChange(plan.id, 'description', e.target.value)}
            className="w-full p-2 border rounded"
          />
          <input
            type="number"
            placeholder="Monthly Credits"
            value={editPlans[plan.id]?.monthlyCredits}
            onChange={(e) => handleEditChange(plan.id, 'monthlyCredits', e.target.value)}
            className="w-full p-2 border rounded"
          />
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={editPlans[plan.id]?.isEnterprise || false}
              onChange={(e) => handleEditChange(plan.id, 'isEnterprise', e.target.checked)}
            />
            <span>Enterprise</span>
          </label>
          <input
            type="text"
            placeholder="Stripe Price ID"
            value={editPlans[plan.id]?.stripePriceId || ''}
            onChange={(e) => handleEditChange(plan.id, 'stripePriceId', e.target.value)}
            className="w-full p-2 border rounded"
          />
          <div className="flex space-x-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleSave(plan.id)}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleDelete(plan.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <div className="border p-4 rounded space-y-2">
        <h3 className="font-medium">Create New Plan</h3>
        <input
          type="text"
          placeholder="Name"
          value={newPlan.name}
          onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
          className="w-full p-2 border rounded"
        />
        <textarea
          placeholder="Description"
          value={newPlan.description}
          onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
          className="w-full p-2 border rounded"
        />
        <input
          type="number"
          placeholder="Monthly Credits"
          value={newPlan.monthlyCredits}
          onChange={(e) => setNewPlan({ ...newPlan, monthlyCredits: e.target.value })}
          className="w-full p-2 border rounded"
        />
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={newPlan.isEnterprise}
            onChange={(e) => setNewPlan({ ...newPlan, isEnterprise: e.target.checked })}
          />
          <span>Enterprise</span>
        </label>
        <input
          type="text"
          placeholder="Stripe Price ID"
          value={newPlan.stripePriceId}
          onChange={(e) => setNewPlan({ ...newPlan, stripePriceId: e.target.value })}
          className="w-full p-2 border rounded"
        />
        <button type="button" className="btn-primary" onClick={handleCreate}>
          Create Plan
        </button>
      </div>
    </div>
  );
};

export default SubscriptionPlansTab;
