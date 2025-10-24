import { describe, expect, it } from "@jest/globals";

import { TransformSpecError, transformReview } from "./engine";

describe("transformReview", () => {
  const input = {
    brand: { brandCode: "ACME" },
    adGroup: { name: "Launch" },
    recipes: [
      {
        recipeCode: "R1",
        goLive: "2024-05-01T12:34:56Z",
        product: { name: "Widget" },
      },
      {
        recipeCode: "R2",
      },
    ],
    ads: [
      {
        recipeCode: "R1",
        aspectRatio: "9x16",
        status: "approved",
        firebaseUrl: "https://example.com/latest.mp4",
        uploadedAt: "2024-05-03T10:00:00Z",
      },
      {
        recipeCode: "R1",
        aspectRatio: "9x16",
        status: "approved",
        firebaseUrl: "https://example.com/older.mp4",
        uploadedAt: "2024-05-02T10:00:00Z",
      },
      {
        recipeCode: "R1",
        aspectRatio: "1x1",
        status: "approved",
        firebaseUrl: "https://example.com/square.mp4",
        uploadedAt: "2024-05-04T10:00:00Z",
      },
      {
        recipeCode: "R2",
        aspectRatio: "9x16",
        status: "pending",
        firebaseUrl: "https://example.com/pending.mp4",
        uploadedAt: "2024-05-05T10:00:00Z",
      },
    ],
  };

  it("builds rows for each recipe with helpers applied", () => {
    const spec = {
      rows: {
        source: "recipes",
        fields: {
          brandCode: "brand.brandCode",
          adGroupName: { path: "adGroup.name" },
          goLiveDate: { path: "recipe.goLive", format: "date" },
          productName: "recipe.product.name",
          portraitUrl: { image: { aspectRatio: "9x16" } },
          squareUrl: { image: "1x1" },
        },
      },
    };

    const rows = transformReview(spec, input);

    expect(rows).toEqual([
      {
        brandCode: "ACME",
        adGroupName: "Launch",
        goLiveDate: "2024-05-01",
        productName: "Widget",
        portraitUrl: "https://example.com/latest.mp4",
        squareUrl: "https://example.com/square.mp4",
      },
      {
        brandCode: "ACME",
        adGroupName: "Launch",
        goLiveDate: null,
        productName: null,
        portraitUrl: null,
        squareUrl: null,
      },
    ]);
  });

  it("throws a friendly error for invalid specs", () => {
    expect(() => transformReview("{", input)).toThrow(TransformSpecError);
    expect(() =>
      transformReview(
        {
          rows: {
            fields: {
              invalid: { image: {} },
            },
          },
        },
        input
      )
    ).toThrow(TransformSpecError);
  });
});
