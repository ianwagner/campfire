import React from 'react';
import { Link } from 'react-router-dom';
import { FiGrid, FiType, FiDownload, FiList, FiColumns, FiArchive } from 'react-icons/fi';
import Table from './common/Table';
import AdGroupCard from './AdGroupCard.jsx';
import TabButton from './TabButton.jsx';
import IconButton from './IconButton.jsx';
import PageToolbar from './PageToolbar.jsx';
import StatusBadge from './StatusBadge.jsx';
import computeKanbanStatus from '../utils/computeKanbanStatus';

const statusOrder = {
  pending: 1,
  briefed: 2,
  ready: 3,
  'review pending': 4,
  'in review': 4,
  reviewed: 5,
  archived: 6,
};

const AdGroupListView = ({
  groups = [],
  loading,
  filter,
  onFilterChange,
  view,
  onViewChange,
  showArchived,
  onToggleArchived,
  onShare,
  onGallery,
  onCopy,
  onDownload,
}) => {
  const term = (filter || '').toLowerCase();
  const displayGroups = groups
    .filter(
      (g) =>
        !term ||
        g.name?.toLowerCase().includes(term) ||
        g.brandCode?.toLowerCase().includes(term)
    )
    .sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));

  return (
    <div className="mb-8">
      <PageToolbar
        left={(
          <>
            <input
              type="text"
              placeholder="Filter"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              className="p-1 border rounded"
            />
            {typeof showArchived !== 'undefined' && (
              <TabButton
                type="button"
                active={showArchived}
                onClick={onToggleArchived}
                aria-label={showArchived ? 'Hide archived' : 'Show archived'}
              >
                <FiArchive />
              </TabButton>
            )}
            <div className="border-l h-6 mx-2" />
            <TabButton active={view === 'table'} onClick={() => onViewChange('table')} aria-label="Table view">
              <FiList />
            </TabButton>
            <TabButton active={view === 'kanban'} onClick={() => onViewChange('kanban')} aria-label="Kanban view">
              <FiColumns />
            </TabButton>
          </>
        )}
      />
      {loading ? (
        <p>Loading groups...</p>
      ) : displayGroups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <>
          <div className="sm:hidden space-y-4">
            {displayGroups.map((g) => (
              <AdGroupCard
                key={g.id}
                group={g}
                onGallery={onGallery ? () => onGallery(g.id) : undefined}
                onCopy={onCopy ? () => onCopy(g.id) : undefined}
                onDownload={onDownload ? () => onDownload(g.id) : undefined}
                triggerClickMenu
              />
            ))}
          </div>
          {view === 'table' ? (
            <div className="hidden sm:block mt-[0.8rem]">
              <Table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Brand</th>
                    <th className="text-center">Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayGroups.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.brandCode}</td>
                      <td className="text-center">
                        <StatusBadge status={g.status} />
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center">
                          <IconButton onClick={() => onGallery(g.id)} aria-label="See Gallery">
                            <FiGrid />
                          </IconButton>
                          <IconButton onClick={() => onCopy(g.id)} className="ml-2" aria-label="See Platform Copy">
                            <FiType />
                          </IconButton>
                          <IconButton onClick={() => onDownload(g.id)} className="ml-2" aria-label="Download Approved Assets">
                            <FiDownload />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="hidden sm:block overflow-x-auto mt-[0.8rem]">
              <div className="min-w-max flex gap-4">
                {[
                  { label: 'New', status: 'new' },
                  { label: 'Designed', status: 'designed' },
                  { label: 'Edit Request', status: 'edit request' },
                  { label: 'Done', status: 'done' },
                ].map((col) => (
                  <div key={col.status} className="flex-shrink-0 w-[240px] sm:w-[320px]">
                    <h2 className="text-xl mb-2 capitalize">{col.label}</h2>
                    <div
                      className="bg-[#F7F7F7] dark:bg-[var(--dark-bg)] border border-gray-300 dark:border-gray-600 rounded-t-[1rem] rounded-b-[1rem] flex flex-col items-center gap-4 p-[0.6rem] overflow-y-auto"
                      style={{ maxHeight: 'calc(100vh - 13rem)' }}
                    >
                      {displayGroups
                        .filter((g) => computeKanbanStatus(g) === col.status)
                        .map((g) => (
                          <AdGroupCard
                            key={g.id}
                            group={g}
                            onGallery={onGallery ? () => onGallery(g.id) : undefined}
                            onCopy={onCopy ? () => onCopy(g.id) : undefined}
                            onDownload={onDownload ? () => onDownload(g.id) : undefined}
                            triggerClickMenu
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdGroupListView;
