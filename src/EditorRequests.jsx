import React from 'react';
import { auth } from './firebase/config';
import AdminRequests from './AdminRequests';

const EditorRequests = () => {
  const user = auth.currentUser;
  return <AdminRequests filterEditorId={user?.uid} />;
};

export default EditorRequests;
