import React from 'react';
import { Link } from 'react-router-dom';
import CreateAdGroup from './CreateAdGroup.jsx';

const ClientProjects = ({ brandCodes = [] }) => {
  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-[var(--dark-border)] dark:bg-[var(--dark-card)] dark:text-[var(--dark-text)]">
        <p className="mb-0 text-base">
          Projects have been upgraded - see them here:{' '}
          <Link
            to="/ad-groups"
            className="font-medium text-blue-600 underline hover:text-blue-500"
          >
            Ad Groups
          </Link>
        </p>
      </div>
      <CreateAdGroup asModal brandCodes={brandCodes} />
    </div>
  );
};

export default ClientProjects;
