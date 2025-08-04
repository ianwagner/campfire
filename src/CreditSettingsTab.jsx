import React, { useEffect, useState } from 'react';

const CreditSettingsTab = ({ settings, saveSettings }) => {
  const [projectCreationCost, setProjectCreationCost] = useState('1');
  const [editRequestCost, setEditRequestCost] = useState('1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setProjectCreationCost(
      String(settings.creditCosts?.projectCreation ?? 1)
    );
    setEditRequestCost(
      String(settings.creditCosts?.editRequest ?? 1)
    );
  }, [settings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await saveSettings({
        creditCosts: {
          projectCreation: Number(projectCreationCost) || 0,
          editRequest: Number(editRequestCost) || 0,
        },
      });
      setMessage('Settings saved');
    } catch (err) {
      console.error('Failed to save credit settings', err);
      setMessage('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label className="block mb-1 text-sm font-medium">Project Creation Cost</label>
        <input
          type="number"
          min="0"
          value={projectCreationCost}
          onChange={(e) => setProjectCreationCost(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      <div>
        <label className="block mb-1 text-sm font-medium">Edit Request Cost</label>
        <input
          type="number"
          min="0"
          value={editRequestCost}
          onChange={(e) => setEditRequestCost(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      {message && <p className="text-sm">{message}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  );
};

export default CreditSettingsTab;

