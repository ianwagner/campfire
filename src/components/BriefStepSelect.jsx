import RecipeTypeCard from './RecipeTypeCard';

export default function BriefStepSelect({
  hideBrandSelect,
  brands,
  brandCode,
  setBrandCode,
  onBrandCodeChange,
  types,
  selectedType,
  setSelectedType,
  setStep,
}) {
  return (
    <>
      {!hideBrandSelect && (
        <div className="mb-4">
          <label className="block text-sm mb-1">Brand</label>
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
      <div>
        <label id="recipe-type-label" className="block text-sm mb-1">
          Recipe Type
        </label>
        <div
          role="group"
          aria-labelledby="recipe-type-label"
          className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        >
          {types.map((t) => (
            <RecipeTypeCard
              key={t.id}
              type={t}
              selected={selectedType === t.id}
              onClick={() => {
                setSelectedType(t.id);
                setStep(2);
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
