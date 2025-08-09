import RecipeTypeCard from './RecipeTypeCard';

export default function BriefStepSelect({
  types,
  selectedType,
  setSelectedType,
  setStep,
}) {
  return (
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
  );
}
