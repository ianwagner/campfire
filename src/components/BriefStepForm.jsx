import React from 'react';
import { FiPlus, FiInfo, FiUpload, FiImage, FiPaperclip } from 'react-icons/fi';
import IconButton from './IconButton.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import TagChecklist from './TagChecklist.jsx';
import TagInput from './TagInput.jsx';
import OptimizedImage from './OptimizedImage.jsx';
import ProductCard from './ProductCard.jsx';
import AddProductCard from './AddProductCard.jsx';
import ProductEditModal from './ProductEditModal.jsx';
import ProductImportModal from '../ProductImportModal.jsx';
import DueDateMonthSelector from './DueDateMonthSelector.jsx';
import saveBrandProducts from '../utils/saveBrandProducts.js';

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
  isPlanning,
  lastPlannedCount,
  lastPlannedTotal,
}) {

  React.useEffect(() => {
    const defaults = {
      funnel: { names: ['Acquisition'] },
      market: { names: ['US'], multi: true },
      format: { names: ['Static'] },
    };
    const updates = {};
    let shouldUpdate = false;
    displayedComponents.forEach((component) => {
      const desired = defaults[component.key];
      if (!desired) return;
      if (selectedInstances[component.key] !== undefined) return;
      const instOptions = allInstances.filter(
        (i) =>
          i.componentKey === component.key &&
          (!i.relationships?.brandCode || i.relationships.brandCode === brandCode),
      );
      const matches = instOptions.filter((i) => desired.names?.includes(i.name));
      if (component.selectionMode === 'dropdown') {
        const match = matches[0];
        if (match) {
          updates[component.key] = match.id;
          shouldUpdate = true;
        }
      } else if (component.selectionMode === 'checklist') {
        const ids = matches.map((i) => i.id);
        if (ids.length > 0) {
          updates[component.key] = ids;
          shouldUpdate = true;
        }
      }
    });
    if (shouldUpdate) {
      setSelectedInstances((prev) => ({ ...prev, ...updates }));
    }
  }, [
    allInstances,
    brandCode,
    displayedComponents,
    selectedInstances,
    setSelectedInstances,
  ]);

  const parsedAdsCount = Number.parseInt(generateCount, 10);
  const adsCount = Number.isNaN(parsedAdsCount) ? 0 : Math.max(0, parsedAdsCount);
  const planningMessage = isPlanning
    ? `Planning ${(lastPlannedCount || adsCount).toString()} ads…`
    : lastPlannedTotal !== null
    ? `Total ads planned: ${lastPlannedTotal}`
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
            {currentType?.name || 'Create Project'}
          </h2>
          {currentType?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {currentType.description}
            </p>
          )}
        </div>
        <DueDateMonthSelector
          dueDate={dueDate}
          setDueDate={setDueDate}
          month={month}
          setMonth={setMonth}
          isAgency={isAgency}
        />
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
                      <FiPaperclip /> Brief Attachments
                      <InfoTooltip text="Upload logos, lockups, inspiration, or campaign-specific files for this brief. These are only used for this request. This is different from your brand’s Asset Library, which includes reusable product photos, videos, and brand elements that power your creative recipes.">
                        <FiInfo className="text-gray-500" />
                      </InfoTooltip>
                    </span>
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Files specific to this brief only — e.g., PDF guidelines, logo lockups.
                  </p>
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
                      <FiUpload /> Upload attachments
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
                {currentType?.enableAssetCsv && (
                  <div className="mt-4 space-y-2">
                    <label className="block mb-1 text-sm font-medium">
                      <span className="inline-flex items-center gap-1">
                        <FiImage /> Brand Asset Library
                      </span>
                    </label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Auto-tagged assets stored in your brand’s library. Add more assets to pull into any brief.
                    </p>
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
                )}
              </>
            )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayedComponents.map((c) => {
              if (c.key === 'brand') return null;
              const instOptions = allInstances.filter(
                (i) =>
                  i.componentKey === c.key &&
                  (!i.relationships?.brandCode || i.relationships.brandCode === brandCode)
              );
              const defaultList = instOptions.map((i) => i.id);
              const defaultChecklist = (() => {
                if (c.key === 'market') {
                  const desired = instOptions.filter((i) => i.name === 'US').map((i) => i.id);
                  if (desired.length > 0) return desired;
                }
                return defaultList;
              })();
              const current =
                selectedInstances[c.key] !== undefined
                  ? selectedInstances[c.key]
                  : c.selectionMode === 'checklist'
                  ? defaultChecklist
                  : '';
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
                  <div
                    key={c.id}
                    className="space-y-2 md:col-span-2 xl:col-span-3"
                  >
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
                          url: '',
                          description: [],
                          benefits: [],
                          featuredImage: '',
                          images: [],
                        }}
                        brandCode={brandCode}
                        onSave={(p) => {
                          const id = `product-${brandProducts.length}`;
                          const newProd = {
                            id,
                            componentKey: 'product',
                            name: p.name,
                            values: {
                              name: p.name,
                              url: p.url || '',
                              description: p.description,
                              benefits: p.benefits,
                              featuredImage: p.featuredImage || p.images?.[0]?.url || '',
                              images: Array.isArray(p.images)
                                ? p.images.map((img) => img.url)
                                : [],
                            },
                            relationships: { brandCode },
                          };
                          const updated = [...brandProducts, newProd];
                          setBrandProducts(updated);
                          setSelectedInstances((prev) => ({
                            ...prev,
                            [c.key]: [...currentList, id],
                          }));
                          const brand = brands.find((b) => b.code === brandCode);
                          saveBrandProducts(brand?.id, updated);
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
                              url: p.url || '',
                              description: p.description,
                              benefits: p.benefits,
                              featuredImage: p.featuredImage || p.images?.[0]?.url || '',
                              images: Array.isArray(p.images)
                                ? p.images.map((img) => img.url)
                                : [],
                            },
                            relationships: { brandCode },
                          };
                          const updated = [...brandProducts, newProd];
                          setBrandProducts(updated);
                          setSelectedInstances((prev) => ({
                            ...prev,
                            [c.key]: [...currentList, id],
                          }));
                          const brand = brands.find((b) => b.code === brandCode);
                          saveBrandProducts(brand?.id, updated);
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
                    ) : (
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
                    )
                  )}
                  {c.selectionMode === 'checklist' && instOptions.length > 0 && (
                    <TagChecklist
                      options={instOptions.map((i) => ({ id: i.id, name: i.name }))}
                      value={current}
                      onChange={(arr) =>
                        setSelectedInstances({ ...selectedInstances, [c.key]: arr })
                      }
                      id={`check-${c.id}`}
                    />
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
                          required={a.required}
                        />
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
          {writeFields.map((f) => (
            <div key={f.key}>
              <label className="block mb-1 text-sm font-medium">{f.label}</label>
              {f.inputType === 'textarea' ? (
                <textarea
                  className="w-full p-2 border rounded"
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  required={f.required}
                />
              ) : f.inputType === 'list' ? (
                <TagInput
                  id={`list-${f.key}`}
                  value={formData[f.key] || []}
                  onChange={(arr) =>
                    setFormData({ ...formData, [f.key]: arr })
                  }
                  addOnBlur
                />
              ) : (
                <input
                  className="w-full p-2 border rounded"
                  type={f.inputType}
                  value={formData[f.key] || ''}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  required={f.required}
                />
              )}
            </div>
          ))}
          <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
            <h3 className="mb-4 text-lg font-semibold">Add ads to your brief</h3>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="w-full md:max-w-xs">
                <label className="block mb-1 text-sm font-medium" htmlFor="ads-count-input">
                  How many ads?
                </label>
                <input
                  id="ads-count-input"
                  type="number"
                  min="0"
                  className="w-full p-2 border rounded"
                  value={generateCount}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    setGenerateCount(Number.isNaN(value) ? 0 : Math.max(0, value));
                  }}
                />
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  We’ll use your selections above (product, audience, angle, market, funnel) to
                  create this many ads.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:justify-end w-full md:w-auto">
                <button type="submit" className="order-2 btn-primary md:order-1">
                  {`Plan ${adsCount} ${adsCount === 1 ? 'ad' : 'ads'}`}
                </button>
                <div className="order-1 min-h-[1.25rem] text-right text-sm text-gray-600 dark:text-gray-400 md:order-2 md:min-w-[12rem]">
                  {planningMessage}
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your ads will appear below — you can edit them once they’re added.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
