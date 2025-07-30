import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import useSiteSettings from './useSiteSettings';
import OptimizedImage from './components/OptimizedImage.jsx';

const ProjectDetail = () => {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useSiteSettings();

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (snap.exists()) {
          setProject({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error('Failed to load project', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  if (loading) return <div className="min-h-screen p-4">Loading...</div>;
  if (!project) return <div className="min-h-screen p-4">Project not found.</div>;

  return (
    <div className="min-h-screen p-4">
      {settings.artworkUrl && (
        <div className="-mx-4 px-4 mt-4 mb-6 max-h-40 overflow-hidden rounded">
          <OptimizedImage
            pngUrl={settings.artworkUrl}
            alt="Artwork"
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <h1 className="text-2xl mb-4">{project.title}</h1>
      <h2 className="text-lg mb-2">Plan</h2>
      <ul className="list-disc list-inside">
        {(project.recipeTypes || []).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
};

export default ProjectDetail;
