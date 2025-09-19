import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import FullScreenSpinner from './FullScreenSpinner.jsx';

const ClientProjectRedirect = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const performRedirect = async () => {
      if (!projectId) {
        navigate('/projects', { replace: true });
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (!active) return;
        const data = snap.exists() ? snap.data() : null;
        const groupId = data?.groupId;
        if (groupId) {
          navigate(`/ad-group/${groupId}`, { replace: true });
        } else {
          navigate('/projects', { replace: true });
        }
      } catch (err) {
        console.error('Failed to load project for redirect', err);
        if (active) {
          navigate('/projects', { replace: true });
        }
      }
    };
    performRedirect();
    return () => {
      active = false;
    };
  }, [navigate, projectId]);

  return <FullScreenSpinner />;
};

export default ClientProjectRedirect;
