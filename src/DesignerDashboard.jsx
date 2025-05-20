import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase/config';
import CreateAdGroup from './CreateAdGroup';

const DesignerDashboard = () => {
  return (
    <div className="p-4">
      <div className="flex justify-between items-start">
        <h1 className="text-2xl mb-4">Designer Dashboard</h1>
        <button
          onClick={() => signOut(auth)}
          className="text-sm text-gray-500 hover:text-black underline mt-4"
        >
          Log Out
        </button>
      </div>
      <CreateAdGroup />
    </div>
  );
};

export default DesignerDashboard;
