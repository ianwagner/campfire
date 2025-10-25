import { __TESTING__, type FirestoreRecord } from "../mapping";
import type { Integration } from "../types";

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

describe("groupAdsByRecipeIdentifier", () => {
  it("merges aspect ratios when ads share a recipe number", () => {
    const review: FirestoreRecord = { id: "review-1", name: "Review" };
    const generatedAt = "2024-01-01T00:00:00.000Z";

    const integration: Integration = {
      id: "integration-1",
      version: "1",
      name: "Test Integration",
      slug: "test-integration",
      description: "",
      active: true,
      baseUrl: "https://example.com",
      endpointPath: "/hook",
      method: "POST",
      auth: { strategy: "none" },
      mapping: { type: "literal", version: "1", template: {} },
      schemaRef: null,
      recipeTypeId: null,
      retryPolicy: {
        maxAttempts: 1,
        initialIntervalMs: 1000,
        maxIntervalMs: 1000,
        backoffMultiplier: 1,
      },
      headers: {},
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };

    const ads: FirestoreRecord[] = [
      {
        id: "ad-square",
        aspectRatio: "1x1",
        recipeFields: {
          "Recipe Number": "RC-100",
        },
        assets: [
          {
            aspectRatio: "1x1",
            url: "https://cdn.example.com/square.png",
          },
        ],
      },
      {
        id: "ad-vertical",
        aspectRatio: "9x16",
        recipeFields: {
          "Recipe Number": "RC-100",
        },
        assets: [
          {
            aspectRatio: "9x16",
            url: "https://cdn.example.com/vertical.png",
          },
        ],
      },
    ];

    const grouped = __TESTING__.groupAdsByRecipeIdentifier(ads, {
      review,
      client: null,
      recipeType: null,
    });

    expect(grouped).toHaveLength(1);

    const summary = {
      reviewId: review.id,
      reviewName: review.name,
    };

    const exports = __TESTING__.buildStandardAdExports(grouped, {
      review,
      client: null,
      recipeType: null,
      summary,
      generatedAt,
      integration,
      dryRun: true,
    });

    expect(exports).toHaveLength(1);
    expect(exports[0].assets).toEqual(
      expect.objectContaining({
        "1x1": "https://cdn.example.com/square.png",
        "9x16": "https://cdn.example.com/vertical.png",
      })
    );
    expect(exports[0].asset1x1Url).toBe("https://cdn.example.com/square.png");
    expect(exports[0].asset9x16Url).toBe("https://cdn.example.com/vertical.png");
  });

  it("preserves recipe number values when exporting standard ads", () => {
    const review: FirestoreRecord = { id: "review-1", name: "Review" };
    const generatedAt = "2024-01-01T00:00:00.000Z";

    const integration: Integration = {
      id: "integration-1",
      version: "1",
      name: "Test Integration",
      slug: "test-integration",
      description: "",
      active: true,
      baseUrl: "https://example.com",
      endpointPath: "/hook",
      method: "POST",
      auth: { strategy: "none" },
      mapping: { type: "literal", version: "1", template: {} },
      schemaRef: null,
      recipeTypeId: null,
      retryPolicy: {
        maxAttempts: 1,
        initialIntervalMs: 1000,
        maxIntervalMs: 1000,
        backoffMultiplier: 1,
      },
      headers: {},
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };

    const ads: FirestoreRecord[] = [
      {
        id: "ad-1",
        name: "Square",
        recipeFields: {
          "Recipe Number": "RC-200",
        },
        assets: [
          {
            aspectRatio: "1x1",
            url: "https://cdn.example.com/square.png",
          },
        ],
      },
    ];

    const exports = __TESTING__.buildStandardAdExports(ads, {
      review,
      client: null,
      recipeType: null,
      summary: { reviewId: review.id, reviewName: review.name },
      generatedAt,
      integration,
      dryRun: true,
    });

    expect(exports).toHaveLength(1);
    expect(exports[0].recipeNumber).toBe("RC-200");
    expect(exports[0].recipeFields).toEqual(
      expect.objectContaining({ "Recipe Number": "RC-200" })
    );
  });

  it("adds common alias keys to the standard export rows", () => {
    const review: FirestoreRecord = {
      id: "review-1",
      name: "Review",
      brandStoreId: "BRAND-001",
    };
    const generatedAt = "2024-01-01T00:00:00.000Z";

    const integration: Integration = {
      id: "integration-1",
      version: "1",
      name: "Test Integration",
      slug: "test-integration",
      description: "",
      active: true,
      baseUrl: "https://example.com",
      endpointPath: "/hook",
      method: "POST",
      auth: { strategy: "none" },
      mapping: { type: "literal", version: "1", template: {} },
      schemaRef: null,
      recipeTypeId: null,
      retryPolicy: {
        maxAttempts: 1,
        initialIntervalMs: 1000,
        maxIntervalMs: 1000,
        backoffMultiplier: 1,
      },
      headers: {},
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };

    const ads: FirestoreRecord[] = [
      {
        id: "ad-1",
        name: "Example",
        recipeFields: {
          "Recipe Number": "RC-300",
          Product: "Widget",
          Primary: "Primary copy",
          Headline: "Headline text",
          Description: "Description text",
          Persona: "Persona 1",
          Funnel: "Middle",
          "Go Live": "2025-01-01",
          URL: "https://example.com/product",
          "Ad Group": "Example Group",
          Moment: "Holiday",
          Angle: "Fresh",
          Audience: "Parents",
          Status: "approved",
          "Store ID": "STORE-123",
          "1x1": "https://cdn.example.com/square.png",
          "9x16": "https://cdn.example.com/vertical.png",
        },
        assets: [
          { aspectRatio: "1x1", url: "https://cdn.example.com/square.png" },
          { aspectRatio: "9x16", url: "https://cdn.example.com/vertical.png" },
        ],
      },
    ];

    const exports = __TESTING__.buildStandardAdExports(ads, {
      review,
      client: null,
      recipeType: null,
      summary: { reviewId: review.id, reviewName: review.name, brandStoreId: "BRAND-001" },
      generatedAt,
      integration,
      dryRun: true,
    });

    expect(exports).toHaveLength(1);
    const row = exports[0] as Record<string, unknown>;

    expect(row.recipeNumber).toBe("RC-300");
    expect(row.recipe_no).toBe("RC-300");
    expect(row.productName).toBe("Widget");
    expect(row.product).toBe("Widget");
    expect(row.primaryCopy).toBe("Primary copy");
    expect(row.primary_text).toBe("Primary copy");
    expect(row.destinationUrl).toBe("https://example.com/product");
    expect(row.product_url).toBe("https://example.com/product");
    expect(row.asset1x1Url).toBe("https://cdn.example.com/square.png");
    expect(row.image_1x1).toBe("https://cdn.example.com/square.png");
    expect(row.asset9x16Url).toBe("https://cdn.example.com/vertical.png");
    expect(row.image_9x16).toBe("https://cdn.example.com/vertical.png");
    expect(row.adGroupName).toBe("Example Group");
    expect(row.group_desc).toBe("Example Group");
    expect(row.storeId).toBe("STORE-123");
    expect(row.shop).toBe("STORE-123");
    expect(row.brandStoreId).toBe("BRAND-001");
    expect(row.brand_store_id).toBe("BRAND-001");
  });
});
