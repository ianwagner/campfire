import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './firebase/config';
import DescribeProjectModal from './DescribeProjectModal.jsx';

const ProjectStaging = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editRequest, setEditRequest] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (!snap.exists()) {
          setProject(null);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const proj = {
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
        setProject(proj);

        if (!auth.currentUser?.uid) {
          throw new Error('User not authenticated');
        }
        const reqSnap = await getDocs(
          query(
            collection(db, 'requests'),
            where('projectId', '==', projectId),
            where('createdBy', '==', auth.currentUser.uid)
          )
        );
        if (!reqSnap.empty) {
          const r = reqSnap.docs[0];
          setRequest({ id: r.id, ...r.data() });
        }
      } catch (err) {
        console.error('Failed to load project staging', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const q = query(
      collection(db, 'adGroups'),
      where('name', '==', project.title),
      where('brandCode', '==', project.brandCode),
      where('uploadedBy', '==', project.userId)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        navigate(`/projects/${projectId}`, { replace: true });
      }
    });
    return () => unsub();
  }, [project, projectId, navigate]);

  if (loading) return <div className="min-h-screen p-4">Loading...</div>;
  if (!project || !request)
    return <div className="min-h-screen p-4">Project not found.</div>;

  return (
    <div className="min-h-screen p-4 w-full max-w-[60rem] mx-auto">
      <div className="flex items-center mb-4">
        <Link to="/projects" className="btn-arrow mr-2" aria-label="Back">
          &lt;
        </Link>
      </div>
      <div className="border rounded p-4 max-w-[60rem] space-y-1">
        <h1 className="text-xl font-semibold mb-1">
          {request.title || 'New Ads Ticket'}
        </h1>
        {request.brandCode && <p className="mb-0">Brand: {request.brandCode}</p>}
        {request.dueDate && (
          <p className="mb-0">
            Due Date{' '}
            {request.dueDate.toDate
              ? request.dueDate.toDate().toLocaleDateString()
              : new Date(request.dueDate).toLocaleDateString()}
          </p>
        )}
        <p className="mb-0"># Ads: {request.numAds}</p>
        {request.details && (
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: request.details }}
          />
        )}
        <button className="btn-primary mt-2" onClick={() => setEditRequest(true)}>
          Edit
        </button>
      </div>
      {editRequest && (
        <DescribeProjectModal
          onClose={(updated) => {
            setEditRequest(false);
            if (updated) {
              setRequest((r) => ({ ...r, ...updated }));
              setProject((p) => ({
                ...p,
                title: updated.title,
                brandCode: updated.brandCode,
              }));
            }
          }}
          brandCodes={[project.brandCode]}
          request={{ ...request, projectId: project.id, id: request.id }}
        />
      )}
    </div>
  );
};

export default ProjectStaging;
