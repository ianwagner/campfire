import React from 'react';
import RecipeTypeCard from './RecipeTypeCard.jsx';

const BriefStepSelect = ({
  brandCode,
  onBrandCodeChange,
  brands,
  types,
  selectedType,
  onSelectType,
  hideBrandSelect = false,
}) => (
  <>
    {!hideBrandSelect && (
      <div className="mb-4">
        <label className="block text-sm mb-1">Brand</label>
        <select
          className="w-full p-2 border rounded"
          value={brandCode}
          onChange={(e) => onBrandCodeChange(e.target.value)}
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
      <label id="recipe-type-label" className="block text-sm mb-1">Recipe Type</label>
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
            onClick={() => onSelectType(t.id)}
          />
        ))}
      </div>
    </div>
  </>
);

export default BriefStepSelect;

