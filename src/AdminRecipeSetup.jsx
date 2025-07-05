import React, { useState } from 'react';
import RecipePreview from './RecipePreview.jsx';
import AdminRecipeTabs, { VIEWS } from './components/AdminRecipeTabs.jsx';
import RecipeTypes from './components/RecipeTypes.jsx';
import ComponentsView from './components/ComponentsView.jsx';
import InstancesView from './components/InstancesView.jsx';

const AdminRecipeSetup = () => {
  const [view, setView] = useState(VIEWS.TYPES);
  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Ad Recipe Setup</h1>
      <AdminRecipeTabs view={view} setView={setView} />
      {view === VIEWS.TYPES && <RecipeTypes />}
      {view === VIEWS.COMPONENTS && <ComponentsView />}
      {view === VIEWS.INSTANCES && <InstancesView />}
      {view === VIEWS.PREVIEW && <RecipePreview />}
    </div>
  );
};

export default AdminRecipeSetup;
