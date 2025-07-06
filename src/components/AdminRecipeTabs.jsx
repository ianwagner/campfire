import React from 'react';
import { FiList, FiLayers, FiEye } from 'react-icons/fi';
import TabButton from './TabButton.jsx';

export const VIEWS = {
  TYPES: 'types',
  COMPONENTS: 'components',
  INSTANCES: 'instances',
  PREVIEW: 'preview',
};

const AdminRecipeTabs = ({ view, setView }) => (
  <div className="flex space-x-4 mb-4">
    <TabButton active={view === VIEWS.TYPES} onClick={() => setView(VIEWS.TYPES)}>
      <FiList /> <span>Recipe Types</span>
    </TabButton>
    <TabButton
      active={view === VIEWS.COMPONENTS}
      onClick={() => setView(VIEWS.COMPONENTS)}
    >
      <FiLayers /> <span>Components</span>
    </TabButton>
    <TabButton
      active={view === VIEWS.INSTANCES}
      onClick={() => setView(VIEWS.INSTANCES)}
    >
      <FiLayers /> <span>Instances</span>
    </TabButton>
    <TabButton active={view === VIEWS.PREVIEW} onClick={() => setView(VIEWS.PREVIEW)}>
      <FiEye /> <span>Preview</span>
    </TabButton>
  </div>
);

export default AdminRecipeTabs;
