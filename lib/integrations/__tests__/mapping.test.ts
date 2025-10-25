import { __TESTING__, type FirestoreRecord } from "../mapping";

describe("collectRecipeFieldValues", () => {
  it("returns values from recipeFields containers and aliases", () => {
    const ad: FirestoreRecord = {
      id: "ad-1",
      recipeFields: {
        "Recipe Number": "RC-123",
      },
      recipe_fields: {
        Angle: "Steep",
      } as Record<string, unknown>,
    };

    const result = __TESTING__.collectRecipeFieldValues(
      ad,
      ["Recipe Number", "Angle"],
      {
        review: { id: "review-1" },
        client: null,
        recipeType: null,
      }
    );

    expect(result).toEqual({
      "Recipe Number": "RC-123",
      Angle: "Steep",
    });
  });
});
