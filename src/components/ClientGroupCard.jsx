import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from './OptimizedImage.jsx';
import MonthTag from './MonthTag.jsx';
import parseAdFilename from '../utils/parseAdFilename.js';

const ClientGroupCard = ({ group }) => {
  const previewAds = Array.isArray(group.previewAds) ? group.previewAds : [];
  const rotations = useMemo(
    () => previewAds.map(() => Math.random() * 10 - 5),
    [group.id, previewAds.length]
  );

  const showLogo = group.showLogo;
  const first = previewAds[0] || {};
  const info = parseAdFilename(first.filename || '');
  const name = group.name || 'Untitled group';
  const aspect = showLogo
    ? '1/1'
    : (first.aspectRatio || info.aspectRatio || '9x16').replace('x', '/');

  const containerStyle = showLogo
    ? { aspectRatio: aspect, background: '#efefef', padding: '40px' }
    : { aspectRatio: aspect };

  return (
    <Link to={`/review/${group.id}`} className="block text-center p-3">
      <div className="relative mb-2" style={containerStyle}>
        {showLogo ? (
          <OptimizedImage
            key="logo"
            pngUrl={group.brandLogo}
            alt={name}
            className="absolute inset-0 w-full h-full object-contain rounded shadow"
          />
        ) : (
          previewAds.map((ad, i) => (
            <OptimizedImage
              key={ad.id}
              pngUrl={ad.thumbnailUrl || ad.firebaseUrl}
              alt={name}
              className="absolute inset-0 w-full h-full object-cover rounded shadow"
              style={{
                transform: `rotate(${rotations[i]}deg)`,
                zIndex: i + 1,
                top: `${-i * 4}px`,
                left: `${i * 4}px`,
              }}
            />
          ))
        )}
      </div>
      <h3 className="font-medium text-gray-700 dark:text-white">{name}</h3>
      <div className="flex justify-center items-center gap-2 mt-1 text-sm">
        {group.month && <MonthTag month={group.month} />}
        <span className="text-gray-500 dark:text-gray-300">{group.totalAds ?? 0} ads</span>
      </div>
    </Link>
  );
};

export default ClientGroupCard;
