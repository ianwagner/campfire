import React from 'react';
import { FiPlus, FiInfo, FiUpload, FiImage, FiChevronDown } from 'react-icons/fi';
import IconButton from './IconButton.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import TagChecklist from './TagChecklist.jsx';
import TagInput from './TagInput.jsx';
import OptimizedImage from './OptimizedImage.jsx';
import ProductCard from './ProductCard.jsx';
import AddProductCard from './AddProductCard.jsx';
import ProductEditModal from './ProductEditModal.jsx';
import ProductImportModal from '../ProductImportModal.jsx';
import getMonthString from '../utils/getMonthString.js';
import useSiteSettings from '../useSiteSettings';
import { DEFAULT_MONTH_COLORS } from '../constants.js';

export default function BriefStepForm({
  onBack,
  currentType,
  onTitleChange,
  title,
  brands,
  brandCode,
  setBrandCode,
  onBrandCodeChange,
  hideBrandSelect,
  assetRows,
  filteredAssetRows,
  setShowTagger,
  assetFilter,
  setAssetFilter,
  showBriefExtras,
  briefNote,
  handleBriefNoteChange,
  briefFiles,
  briefFileInputRef,
  handleBriefFilesChange,
  displayedComponents,
  allInstances,
  selectedInstances,
  setSelectedInstances,
  showOptionLists,
  setShowOptionLists,
  showProductModal,
  setShowProductModal,
  showImportModal,
  setShowImportModal,
  brandProducts,
  setBrandProducts,
  formData,
  setFormData,
  writeFields,
  generateCount,
  setGenerateCount,
  month,
  setMonth,
  dueDate,
  setDueDate,
  isAgency,
}) {
  const { settings } = useSiteSettings();
  const monthColors = settings.monthColors || DEFAULT_MONTH_COLORS;
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      value: getMonthString(d),
      label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
    };
  });

  const monthColorEntry = monthColors[month?.slice(-2)] || null;
  const monthLabel =
    month
      ? new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(-2)) - 1,
          1
        ).toLocaleString('default', { month: 'short' })
      : '';

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="btn-arrow mb-2"
        aria-label="Back"
      >
        &lt;
      </button>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">
            {currentType?.name || 'Generate a Brief'}
          </h2>
          {currentType?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentType.description}
            </p>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Due Date:
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="border tag-pill px-2 py-1 text-sm"
            />
          </div>
          {isAgency && (
            <div className="relative">
              <select
                aria-label="Month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div
                className="pointer-events-none text-white tag-pill px-2 py-0.5 pr-3 text-xs flex items-center"
                style={{ backgroundColor: monthColorEntry?.color }}
              >
                {monthLabel}
                <FiChevronDown className="ml-1" />
              </div>
            </div>
          )}
        </div>
      </div>
      {!hideBrandSelect && (
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium">Brand</label>
          <select
            className="w-full p-2 border rounded"
            value={brandCode}
            onChange={(e) => {
              setBrandCode(e.target.value);
              if (onBrandCodeChange) onBrandCodeChange(e.target.value);
            }}
          >
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.code}>
                {b.code} {b.name ? `- ${b.name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {onTitleChange && (
        <div className="mb-4">
          <label className="block mb-1 text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full p-2 border rounded"
          />
        </div>
      )}
      {currentType?.enableAssetCsv && (
        <div className="space-y-2">
          <div>
          <label className="block mb-1 text-sm font-medium">Asset Library</label>
            {assetRows.length > 0 && (
              <div className="flex items-center mt-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm">
                    <span className="font-semibold text-accent">
                      {filteredAssetRows.length}
                    </span>{' '}
                    assets found
                  </p>
                  <IconButton
                    type="button"
                    aria-label="Add Assets"
                    onClick={() => setShowTagger(true)}
                    className="text-sm"
                  >
                    <FiPlus /> Assets
                  </IconButton>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="text"
                    placeholder="Filter"
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="p-1 border rounded text-xs"
                  />
                  <InfoTooltip text="Type here to narrow down assets for this brief.">
                    <FiInfo className="text-gray-500" />
                  </InfoTooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {currentType && (
        <div className="space-y-4">
          {showBriefExtras && (
            <>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1">
                    Brief Note (Optional)
                    <InfoTooltip text="Add any specific instructions for this brief. These notes will be seen by the designers.">
                      <FiInfo className="text-gray-500" />
                    </InfoTooltip>
                  </span>
                </label>
                <textarea
                  value={briefNote}
                  onChange={handleBriefNoteChange}
                  placeholder="E.g. Only use red. Avoid lifestyle imagery."
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1">
                    Brief-Specific Assets
                    <InfoTooltip text="Upload logos, lockups, inspiration, or campaign-specific files for this brief. These are only used for this request. This is different from your brand’s Asset Library, which includes reusable product photos, videos, and brand elements that power your creative recipes.">
                      <FiInfo className="text-gray-500" />
                    </InfoTooltip>
                  </span>
                </label>
                <div className="flex items-center gap-2 mb-1">
                  <input
                    id="brief-file-input"
                    type="file"
                    multiple
                    ref={briefFileInputRef}
                    onChange={handleBriefFilesChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="brief-file-input"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        briefFileInputRef.current &&
                          briefFileInputRef.current.click();
                      }
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:bg-[var(--accent-color-10)] hover:text-gray-900 dark:hover:text-white focus:outline-none active:bg-[var(--accent-color-10)] cursor-pointer"
                  >
                    <FiUpload /> Upload brief assets
                  </label>
                </div>
                {briefFiles.length > 0 && (
                  <ul className="text-sm list-disc ml-5">
                    {briefFiles.map((f, idx) => (
                      <li key={idx}>{f.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          {displayedComponents.map((c) => {
            if (c.key === 'brand') return null;
            const instOptions = allInstances.filter(
              (i) =>
                i.componentKey === c.key &&
                (!i.relationships?.brandCode || i.relationships.brandCode === brandCode)
            );
            const defaultList = instOptions.map((i) => i.id);
            const current =
              selectedInstances[c.key] !== undefined
                ? selectedInstances[c.key]
                : c.selectionMode === 'checklist'
                ? defaultList
                : '';
            const listVisible = !!showOptionLists[c.id];
            const inst =
              c.selectionMode === 'dropdown'
                ? allInstances.find(
                    (i) =>
                      i.id === current &&
                      i.componentKey === c.key &&
                      (!i.relationships?.brandCode ||
                        i.relationships.brandCode === brandCode)
                  )
                : null;
            const imgAttr = c.attributes?.find((a) => a.inputType === 'image');
            if (c.key === 'product') {
              const currentList = Array.isArray(current) ? current : defaultList;
              const toggle = (id) => {
                setSelectedInstances({
                  ...selectedInstances,
                  [c.key]: currentList.includes(id)
                    ? currentList.filter((x) => x !== id)
                    : [...currentList, id],
                });
              };
              return (
                <div key={c.id} className="space-y-2">
                  <label className="block mb-1 text-sm font-medium">Products</label>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                    {instOptions.map((i) => (
                      <ProductCard
                        key={i.id}
                        product={{ ...i.values, name: i.name }}
                        selected={currentList.includes(i.id)}
                        onClick={() => toggle(i.id)}
                      />
                    ))}
                    <AddProductCard
                      onAdd={() => setShowProductModal(true)}
                      onImport={() => setShowImportModal(true)}
                    />
                  </div>
                  {showProductModal && (
                    <ProductEditModal
                      product={{
                        name: '',
                        description: [],
                        benefits: [],
                        featuredImage: '',
                        images: [],
                      }}
                      brandCode={brandCode}
                      onAdd={(p) => {
                        const id = `product-${brandProducts.length}`;
                        const newProd = {
                          id,
                          componentKey: 'product',
                          name: p.name,
                          values: {
                            name: p.name,
                            description: p.description,
                            benefits: p.benefits,
                            featuredImage: p.featuredImage || p.images?.[0]?.url || '',
                            images: Array.isArray(p.images)
                              ? p.images.map((img) => img.url)
                              : [],
                          },
                          relationships: { brandCode },
                        };
                        setBrandProducts((arr) => [...arr, newProd]);
                        setSelectedInstances((prev) => ({
                          ...prev,
                          [c.key]: [...currentList, id],
                        }));
                      }}
                      onClose={() => setShowProductModal(false)}
                    />
                  )}
                  {showImportModal && (
                    <ProductImportModal
                      brandCode={brandCode}
                      onAdd={(p) => {
                        const id = `product-${brandProducts.length}`;
                        const newProd = {
                          id,
                          componentKey: 'product',
                          name: p.name,
                          values: {
                            name: p.name,
                            description: p.description,
                            benefits: p.benefits,
                            featuredImage: p.featuredImage || p.images?.[0]?.url || '',
                            images: Array.isArray(p.images)
                              ? p.images.map((img) => img.url)
                              : [],
                          },
                          relationships: { brandCode },
                        };
                        setBrandProducts((arr) => [...arr, newProd]);
                        setSelectedInstances((prev) => ({
                          ...prev,
                          [c.key]: [...currentList, id],
                        }));
                      }}
                      onClose={() => setShowImportModal(false)}
                    />
                  )}
                </div>
              );
            }
            return (
              <div key={c.id} className="space-y-2">
                <label className="block mb-1 text-sm font-medium">{c.label}</label>
                {c.selectionMode === 'dropdown' && instOptions.length > 0 && (
                  imgAttr ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {instOptions.map((i) => {
                        const imgUrl = i.values?.[imgAttr.key] || '';
                        const selected = current === i.id;
                        return (
                          <button
                            type="button"
                            key={i.id}
                            onClick={() =>
                              setSelectedInstances({ ...selectedInstances, [c.key]: i.id })
                            }
                            className={`border rounded p-2 flex flex-col items-center ${
                              selected ? 'ring-2 ring-blue-500' : ''
                            }`}
                          >
                            {imgUrl ? (
                              <OptimizedImage
                                pngUrl={imgUrl}
                                alt={i.name}
                                className="w-full h-24 object-cover mb-2"
                              />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center bg-gray-100 mb-2">
                                <FiImage className="text-3xl text-gray-400" />
                              </div>
                            )}
                            <span className="text-xs sm:text-sm text-center">
                              {i.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : !listVisible ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowOptionLists((p) => ({ ...p, [c.id]: true }))
                      }
                      className="text-xs underline text-accent"
                    >
                      See options
                    </button>
                  ) : (
                    <>
                      <select
                        className="w-full p-2 border rounded"
                        value={current}
                        onChange={(e) =>
                          setSelectedInstances({
                            ...selectedInstances,
                            [c.key]: e.target.value,
                          })
                        }
                      >
                        <option value="">Custom...</option>
                        {instOptions.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setShowOptionLists((p) => ({ ...p, [c.id]: false }))
                        }
                        className="text-xs underline text-accent"
                      >
                        Hide options
                      </button>
                    </>
                  )
                )}
                {c.selectionMode === 'checklist' && instOptions.length > 0 && (
                  !listVisible ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowOptionLists((p) => ({ ...p, [c.id]: true }))
                      }
                      className="text-xs underline text-accent"
                    >
                      See options
                    </button>
                  ) : (
                    <>
                      <TagChecklist
                        options={instOptions.map((i) => ({ id: i.id, name: i.name }))}
                        value={current}
                        onChange={(arr) => setSelectedInstances({ ...selectedInstances, [c.key]: arr })}
                        id={`check-${c.id}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowOptionLists((p) => ({ ...p, [c.id]: false }))
                        }
                        className="text-xs underline text-accent"
                      >
                        Hide options
                      </button>
                    </>
                  )
                )}
                {c.selectionMode === 'random' && instOptions.length > 0 && (
                  <p className="text-sm italic">Random instance</p>
                )}
                {((c.selectionMode === 'dropdown' && !inst) || instOptions.length === 0) &&
                  c.attributes?.map((a) => (
                    <div key={a.key}>
                      <label className="block mb-1 text-sm font-medium">{a.label}</label>
                      <input
                        className="w-full p-2 border rounded"
                        value={formData[`${c.key}.${a.key}`] || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, [`${c.key}.${a.key}`]: e.target.value })
                        }
                      />
                    </div>
                  ))}
              </div>
            );
          })}
          {writeFields.map((f) => (
            <div key={f.key}>
              <label className="block mb-1 text-sm font-medium">{f.label}</label>
              {f.inputType === 'textarea' ? (
                <textarea
                  className="w-full p-2 border rounded"
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                />
              ) : f.inputType === 'list' ? (
                <TagInput
                  id={`list-${f.key}`}
                  value={formData[f.key] || []}
                  onChange={(arr) =>
                    setFormData({ ...formData, [f.key]: arr })
                  }
                />
              ) : (
                <input
                  className="w-full p-2 border rounded"
                  type={f.inputType}
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary">
              Generate
            </button>
            <input
              type="number"
              min="1"
              className="p-2 border rounded w-20"
              value={generateCount}
              onChange={(e) =>
                setGenerateCount(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
