import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';
import Review from './Review';
import AgencyTheme from './AgencyTheme';

const ClientReview = (props) => {
  const { groupId } = useParams();
  const reviewerName = props.user?.displayName || '';
  const { userRole } = props;
  const [agencyId, setAgencyId] = useState(null);

  useEffect(() => {
    const loadAgency = async () => {
      if (!groupId) { setAgencyId(null); return; }
      try {
        const groupSnap = await getDoc(doc(db, 'adGroups', groupId));
        if (!groupSnap.exists()) { setAgencyId(null); return; }
        const code = groupSnap.data().brandCode;
        if (!code) { setAgencyId(null); return; }
        const q = query(collection(db, 'brands'), where('code', '==', code));
        const bSnap = await getDocs(q);
        if (!bSnap.empty) {
          const data = bSnap.docs[0].data();
          setAgencyId(data.agencyId || null);
        } else {
          setAgencyId(null);
        }
      } catch (err) {
        console.error('Failed to fetch agency', err);
        setAgencyId(null);
      }
    };
    loadAgency();
  }, [groupId]);

  const reviewElem = (
    <Review
      {...props}
      groupId={groupId}
      reviewerName={reviewerName}
      userRole={userRole}
    />
  );

  return agencyId ? (
    <AgencyTheme agencyId={agencyId}>{reviewElem}</AgencyTheme>
  ) : (
    <div className="min-h-screen">{reviewElem}</div>
  );
};

export default ClientReview;
