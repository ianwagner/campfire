import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ClientDashboard from './ClientDashboard';
import OptimizedImage from './components/OptimizedImage.jsx';
import { db } from './firebase/config';

const PublicBrandDashboard = () => {
  const { brandCode: rawBrandCode = '' } = useParams();
  const normalizedCode = useMemo(
    () => (rawBrandCode || '').trim().toUpperCase(),
    [rawBrandCode]
  );
  const [brandCode, setBrandCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandLogo, setBrandLogo] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadBrand = async () => {
      const code = normalizedCode;
      if (!code) {
        if (!cancelled) {
          setBrandCode('');
          setBrandName('');
          setBrandLogo('');
          setNotFound(true);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'brands'), where('code', '==', code))
        );
        if (cancelled) return;
        if (snap.empty) {
          setBrandCode('');
          setBrandName('');
          setBrandLogo('');
          setNotFound(true);
        } else {
          const data = snap.docs[0].data();
          setBrandCode(code);
          setBrandName(data.name || code);
          setBrandLogo(data.logos?.[0] || data.logoUrl || '');
          setNotFound(false);
        }
      } catch (err) {
        console.error('Failed to load brand for public dashboard', err);
        if (!cancelled) {
          setBrandCode('');
          setBrandName('');
          setBrandLogo('');
          setNotFound(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBrand();
    return () => {
      cancelled = true;
    };
  }, [normalizedCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-gray-600 dark:text-gray-300">
        Loading brand dashboard...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">
            Brand dashboard unavailable
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            We couldn't find a public dashboard for this brand code.
          </p>
        </div>
      </div>
    );
  }

  const headerContent = (
    <div className="max-w-4xl mx-auto mb-6 flex flex-col items-center text-center">
      {brandLogo ? (
        <OptimizedImage
          pngUrl={brandLogo}
          alt={`${brandName} logo`}
          className="h-20 w-20 object-contain rounded-full shadow mb-4"
        />
      ) : null}
      <h1 className="text-3xl font-semibold text-gray-800 dark:text-white">
        {brandName}
      </h1>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        Explore ready-to-share creative with public review links for {brandName}.
      </p>
    </div>
  );

  const logos = brandLogo && brandCode ? { [brandCode]: brandLogo } : {};

  return (
    <ClientDashboard
      user={null}
      brandCodes={brandCode ? [brandCode] : []}
      allowAnonymous
      publicOnly
      sortByMonth
      enableCreditCheck={false}
      initialBrandLogos={logos}
      headerContent={headerContent}
    />
  );
};

export default PublicBrandDashboard;

