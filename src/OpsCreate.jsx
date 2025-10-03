import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ClientProjects from './ClientProjects.jsx';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import { auth, db } from './firebase/config';

const OpsCreate = () => {
  const user = auth.currentUser;
  const { agencyId: userAgencyId } = useUserRole(user?.uid);
  const { agencies, loading: agenciesLoading } = useAgencies();
  const [agencyOverride, setAgencyOverride] = useState('');
  const activeAgencyId = userAgencyId || agencyOverride;
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientError, setClientError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      if (!activeAgencyId) {
        if (!cancelled) {
          setClients([]);
          setSelectedClientId('');
          setClientError('');
        }
        return;
      }
      setLoadingClients(true);
      setClientError('');
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users'),
            where('role', '==', 'client'),
            where('agencyId', '==', activeAgencyId)
          )
        );
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setClients(list);
        if (list.length === 0) {
          setSelectedClientId('');
        } else if (!list.some((c) => c.id === selectedClientId)) {
          setSelectedClientId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load clients', err);
        if (!cancelled) {
          setClients([]);
          setSelectedClientId('');
          setClientError('Failed to load clients.');
        }
      } finally {
        if (!cancelled) {
          setLoadingClients(false);
        }
      }
    };

    loadClients();
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId, selectedClientId]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const brandCodes = useMemo(() => {
    if (!selectedClient) return [];
    if (Array.isArray(selectedClient.brandCodes)) {
      return selectedClient.brandCodes.filter(Boolean);
    }
    return [];
  }, [selectedClient]);

  const selectedClientName = selectedClient
    ? selectedClient.fullName || selectedClient.email || selectedClient.id
    : '';

  return (
    <div className="min-h-screen">
      {!userAgencyId && (
        <div className="max-w-4xl mx-auto w-full p-4">
          <label htmlFor="ops-agency-select" className="block mb-2 font-medium">
            Agency
          </label>
          {agenciesLoading ? (
            <p>Loading agencies...</p>
          ) : (
            <select
              id="ops-agency-select"
              className="border p-2 rounded w-full"
              value={agencyOverride}
              onChange={(e) => setAgencyOverride(e.target.value)}
            >
              <option value="">Select agency</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name || agency.id}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {activeAgencyId ? (
        <div className="max-w-4xl mx-auto w-full p-4">
          <label htmlFor="ops-client-select" className="block mb-2 font-medium">
            Client
          </label>
          {loadingClients ? (
            <p>Loading clients...</p>
          ) : clients.length ? (
            <select
              id="ops-client-select"
              className="border p-2 rounded w-full"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName || client.email || client.id}
                </option>
              ))}
            </select>
          ) : (
            <p>No clients found for this agency.</p>
          )}
          {clientError && <p className="text-red-600 text-sm mt-2">{clientError}</p>}
        </div>
      ) : (
        <div className="max-w-4xl mx-auto w-full p-4">
          <p>Select an agency to create projects.</p>
        </div>
      )}

      {activeAgencyId && selectedClient ? (
        brandCodes.length ? (
          <ClientProjects
            brandCodes={brandCodes}
            agencyIdOverride={activeAgencyId}
            uploadedByOverride={selectedClient.id}
            introTextOverride={`Create a project for ${selectedClientName}.`}
            showUpgradeNotice={false}
          />
        ) : (
          <div className="max-w-4xl mx-auto w-full p-4">
            <p>This client does not have any brand codes assigned yet.</p>
          </div>
        )
      ) : null}
    </div>
  );
};

export default OpsCreate;
