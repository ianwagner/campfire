import React, { useMemo } from 'react';
import { auth } from './firebase/config';
import AdminRequests from './AdminRequests';
import useUserRole from './useUserRole';

const PmRequests = () => {
  const user = auth.currentUser;
  const { brandCodes, loading } = useUserRole(user?.uid);
  const normalizedCodes = useMemo(() => {
    if (!Array.isArray(brandCodes)) return [];
    return Array.from(
      new Set(
        brandCodes
          .filter((code) => typeof code === 'string' && code.trim().length > 0)
          .map((code) => code.trim().toUpperCase()),
      ),
    );
  }, [brandCodes]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-300">Loading requests…</div>
    );
  }

  return (
    <AdminRequests allowedBrandCodes={normalizedCodes} canAssignEditor={false} />
  );
};

export default PmRequests;

