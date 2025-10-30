import {
  __TESTING__,
  renderPayload,
  type FirestoreRecord,
  type IntegrationAdExport,
  type IntegrationDefaultExport,
  type IntegrationExportSummary,
  type MappingContext,
} from "../mapping";
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

    const summary: IntegrationExportSummary = {
      reviewId: review.id,
      reviewName: review.name as string,
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
        "4x5": null,
        "1x1": "https://cdn.example.com/square.png",
        "9x16": "https://cdn.example.com/vertical.png",
      })
    );
    expect(exports[0].asset1x1Url).toBe("https://cdn.example.com/square.png");
    expect(exports[0].asset4x5Url).toBeNull();
    expect(exports[0].asset9x16Url).toBe("https://cdn.example.com/vertical.png");
  });

  it("exposes 4x5 assets and falls back to asset1x1 when square is missing", () => {
    const generatedAt = "2024-01-01T00:00:00.000Z";

    const review: FirestoreRecord = {
      id: "review-123",
      name: "Test Review",
    };

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
      mapping: { type: "handlebars", version: "1", template: "" },
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
        id: "ad-portrait",
        aspectRatio: "4x5",
        recipeFields: {
          "Recipe Number": "RC-200",
        },
        assets: [
          {
            aspectRatio: "4x5",
            url: "https://cdn.example.com/portrait.png",
          },
        ],
      },
    ];

    const grouped = __TESTING__.groupAdsByRecipeIdentifier(ads, {
      review,
      client: null,
      recipeType: null,
    });

    const summary: IntegrationExportSummary = {
      reviewId: review.id,
      reviewName: review.name as string,
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
        "4x5": "https://cdn.example.com/portrait.png",
        "1x1": "https://cdn.example.com/portrait.png",
        "9x16": null,
      })
    );
    expect(exports[0].asset4x5Url).toBe("https://cdn.example.com/portrait.png");
    expect(exports[0].asset1x1Url).toBe("https://cdn.example.com/portrait.png");
    expect(exports[0].asset9x16Url).toBeNull();
  });

  it("normalizes portrait-labeled assets into the 4x5 slot", () => {
    const generatedAt = "2024-01-01T00:00:00.000Z";

    const review: FirestoreRecord = {
      id: "review-portrait",
      name: "Portrait Review",
    };

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
      mapping: { type: "handlebars", version: "1", template: "" },
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
        id: "ad-portrait",
        recipeFields: {
          "Recipe Number": "RC-201",
        },
        assets: [
          {
            aspectRatio: "portrait",
            url: "https://cdn.example.com/portrait-labelled.png",
          },
        ],
      },
    ];

    const grouped = __TESTING__.groupAdsByRecipeIdentifier(ads, {
      review,
      client: null,
      recipeType: null,
    });

    const summary: IntegrationExportSummary = {
      reviewId: review.id,
      reviewName: review.name as string,
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
        "4x5": "https://cdn.example.com/portrait-labelled.png",
        "1x1": "https://cdn.example.com/portrait-labelled.png",
        "9x16": null,
      })
    );
    expect(exports[0].asset4x5Url).toBe(
      "https://cdn.example.com/portrait-labelled.png"
    );
    expect(exports[0].asset1x1Url).toBe(
      "https://cdn.example.com/portrait-labelled.png"
    );
    expect(exports[0].asset9x16Url).toBeNull();
  });
});

describe("buildAggregatedAdsFromAdGroup", () => {
  it("categorizes firebase assets and exposes them in standard exports", () => {
    const review: FirestoreRecord = {
      id: "review-asset",
      name: "Review With Assets",
      brandCode: "TEST",
    };

    const recipes: FirestoreRecord[] = [
      {
        id: "recipe-1",
        recipeNumber: "1",
        recipeCode: "1",
      },
    ];

    const assets: FirestoreRecord[] = [
      {
        id: "asset-square",
        filename: "FI_SERIES3_1.png",
        recipeCode: "1",
        firebaseUrl: "https://cdn.example.com/square.png",
        status: "pending",
      },
      {
        id: "asset-vertical",
        filename: "FI_SERIES3_1_9x16.png",
        aspectRatio: "9x16",
        recipeCode: "1",
        firebaseUrl: "https://cdn.example.com/vertical.png",
        status: "pending",
      },
    ];

    const aggregated = __TESTING__.buildAggregatedAdsFromAdGroup({
      review,
      adGroup: null,
      recipes,
      assets,
      copyCards: [],
      brandStoreId: undefined,
    });

    expect(aggregated).toHaveLength(1);
    const aggregatedAd = aggregated[0];

    expect(aggregatedAd.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aspectRatio: "1x1",
          label: "1x1",
          url: "https://cdn.example.com/square.png",
        }),
        expect.objectContaining({
          aspectRatio: "9x16",
          label: "9x16",
          url: "https://cdn.example.com/vertical.png",
        }),
      ])
    );

    expect(
      (aggregatedAd.recipeFields as Record<string, unknown>)["1x1"]
    ).toBe("https://cdn.example.com/square.png");
    expect(
      (aggregatedAd.recipeFields as Record<string, unknown>)["9x16"]
    ).toBe("https://cdn.example.com/vertical.png");

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
      mapping: { type: "handlebars", version: "1", template: "" },
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

    const summary: IntegrationExportSummary = {
      reviewId: review.id,
      reviewName: review.name as string,
    };

    const standardAds = __TESTING__.buildStandardAdExports(aggregated, {
      review,
      client: null,
      recipeType: null,
      summary,
      generatedAt,
      integration,
      dryRun: true,
    });

    expect(standardAds).toHaveLength(1);
    expect(standardAds[0].asset1x1Url).toBe("https://cdn.example.com/square.png");
    expect(standardAds[0].asset9x16Url).toBe("https://cdn.example.com/vertical.png");
  });

  it("categorizes portrait-labeled Firebase assets as 4x5", () => {
    const review: FirestoreRecord = {
      id: "review-portrait",
      name: "Review With Portrait",
      brandCode: "TEST",
    };

    const recipes: FirestoreRecord[] = [
      {
        id: "recipe-portrait",
        recipeNumber: "3",
        recipeCode: "3",
      },
    ];

    const assets: FirestoreRecord[] = [
      {
        id: "asset-portrait",
        filename: "FI_SERIES3_3_portrait.png",
        aspectRatio: "portrait",
        recipeCode: "3",
        firebaseUrl: "https://cdn.example.com/portrait.png",
        status: "pending",
      },
    ];

    const aggregated = __TESTING__.buildAggregatedAdsFromAdGroup({
      review,
      adGroup: null,
      recipes,
      assets,
      copyCards: [],
      brandStoreId: undefined,
    });

    expect(aggregated).toHaveLength(1);
    const aggregatedAd = aggregated[0];

    expect(aggregatedAd.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aspectRatio: "4x5",
          label: "4x5",
          url: "https://cdn.example.com/portrait.png",
        }),
      ])
    );

    expect(
      (aggregatedAd.recipeFields as Record<string, unknown>)["4x5"]
    ).toBe("https://cdn.example.com/portrait.png");

    const generatedAt = "2024-01-01T00:00:00.000Z";
    const integration: Integration = {
      id: "integration-portrait",
      version: "1",
      name: "Test Integration",
      slug: "test-integration",
      description: "",
      active: true,
      baseUrl: "https://example.com",
      endpointPath: "/hook",
      method: "POST",
      auth: { strategy: "none" },
      mapping: { type: "handlebars", version: "1", template: "" },
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

    const summary: IntegrationExportSummary = {
      reviewId: review.id,
      reviewName: review.name as string,
    };

    const standardAds = __TESTING__.buildStandardAdExports(aggregated, {
      review,
      client: null,
      recipeType: null,
      summary,
      generatedAt,
      integration,
      dryRun: true,
    });

    expect(standardAds).toHaveLength(1);
    expect(standardAds[0].asset4x5Url).toBe(
      "https://cdn.example.com/portrait.png"
    );
    expect(standardAds[0].asset1x1Url).toBe(
      "https://cdn.example.com/portrait.png"
    );
    expect(standardAds[0].asset9x16Url).toBeNull();
  });

  it("fills missing destination URLs from known brand products", () => {
    const review: FirestoreRecord = {
      id: "review-product",
      name: "Review With Products",
      brandCode: "TEST",
      brand: {
        code: "TEST",
        products: [
          { name: "Product Name", url: "https://example.com/products/one" },
          { name: "Second Product", url: "https://example.com/products/two" },
        ],
      },
    };

    const recipes: FirestoreRecord[] = [
      {
        id: "recipe-1",
        recipeNumber: "1",
        product: { name: "product name" },
      },
      {
        id: "recipe-2",
        recipeNumber: "2",
        product: { name: "Second Product" },
      },
    ];

    const aggregated = __TESTING__.buildAggregatedAdsFromAdGroup({
      review,
      adGroup: null,
      recipes,
      assets: [],
      copyCards: [],
      brandStoreId: undefined,
    });

    expect(aggregated).toHaveLength(2);

    const first = aggregated[0];
    const firstFields = first.recipeFields as Record<string, unknown>;
    expect(first.destinationUrl).toBe("https://example.com/products/one");
    expect(firstFields.URL).toBe("https://example.com/products/one");
    expect(firstFields["product.url"]).toBe("https://example.com/products/one");
    expect(firstFields.product_url).toBe("https://example.com/products/one");

    const second = aggregated[1];
    const secondFields = second.recipeFields as Record<string, unknown>;
    expect(second.destinationUrl).toBe("https://example.com/products/two");
    expect(secondFields.URL).toBe("https://example.com/products/two");
    expect(secondFields["product.url"]).toBe("https://example.com/products/two");
  });
});

describe("renderPayload", () => {
  it("escapes JSON-sensitive characters in Handlebars templates", async () => {
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
      mapping: {
        type: "handlebars",
        version: "1",
        template: `{
  "ads": [
    {{#each standardAds}}
    {
      "headline": "{{ headline }}",
      "primary_text": "{{ primaryCopy }}",
      "persona": "{{ persona }}"
    }{{#unless @last}},{{/unless}}
    {{/each}}
  ]
}`,
      },
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

    const standardAds: IntegrationAdExport[] = [
      {
        id: "ad-1",
        adId: "ad-1",
        reviewId: "review-1",
        generatedAt,
        integrationId: integration.id,
        integrationName: integration.name,
        integrationSlug: integration.slug,
        dryRun: false,
        assets: {},
        headline: 'Boost your "ROI"',
        primaryCopy: "Line 1\nLine 2",
        persona: "Moms & Dads",
      },
    ];

    const summary: IntegrationExportSummary = {
      reviewId: "review-1",
    };

    const defaultExport: IntegrationDefaultExport = {
      reviewId: "review-1",
      generatedAt,
      integrationId: integration.id,
      integrationName: integration.name,
      integrationSlug: integration.slug,
      dryRun: false,
      ads: standardAds,
      currentAd: standardAds[0],
    };

    const context: MappingContext = {
      integration,
      reviewId: "review-1",
      payload: {},
      dryRun: false,
      review: { id: "review-1" },
      ads: [],
      client: null,
      recipeType: null,
      recipeFieldKeys: [],
      standardAds,
      currentAd: standardAds[0],
      summary,
      defaultExport,
      generatedAt,
      data: { standardAds, currentAd: standardAds[0] },
    };

    const payload = await renderPayload(integration, context);

    expect(payload).toEqual({
      ads: [
        {
          headline: 'Boost your "ROI"',
          primary_text: "Line 1\nLine 2",
          persona: "Moms & Dads",
        },
      ],
    });
  });
});

describe("filterApprovedAdsBySelection", () => {
  const generatedAt = "2024-01-01T00:00:00.000Z";

  const buildAd = (
    overrides: Partial<IntegrationAdExport>,
  ): IntegrationAdExport => ({
    reviewId: "review-1",
    generatedAt,
    integrationId: "integration-1",
    integrationName: "Integration",
    integrationSlug: "integration",
    dryRun: false,
    adGroupId: "review-1",
    adGroupName: "Group",
    adId: "ad-1",
    brandId: "brand-1",
    brandName: "Brand",
    assets: {
      "1x1": null,
      "4x5": null,
      "9x16": null,
    },
    status: "approved",
    ...overrides,
  });

  it("prioritizes ads whose recipe matches the requested identifier", () => {
    const ads: IntegrationAdExport[] = [
      buildAd({
        adId: "review-1|recipe-1",
        recipeNumber: "1",
        recipeFields: { "Recipe Number": "1" },
      }),
      buildAd({
        adId: "review-1|recipe-18",
        recipeNumber: "18",
        recipeFields: { "Recipe Number": "18" },
      }),
    ];

    const payload = {
      recipeIdentifier: "18",
      approvedAssetIds: ["non-matching-asset"],
    } as Record<string, unknown>;

    const result = __TESTING__.filterApprovedAdsBySelection(ads, payload);

    expect(result).toHaveLength(1);
    expect(result[0].recipeNumber).toBe("18");
  });

  it("falls back to matching ad ids when no recipe identifiers match", () => {
    const ads: IntegrationAdExport[] = [
      buildAd({
        adId: "selected-ad",
      }),
      buildAd({
        adId: "another-ad",
      }),
      buildAd({
        adId: "pending-ad",
        status: "pending",
      }),
    ];

    const payload = {
      approvedAssetIds: ["selected-ad"],
    } as Record<string, unknown>;

    const result = __TESTING__.filterApprovedAdsBySelection(ads, payload);

    expect(result).toHaveLength(1);
    expect(result[0].adId).toBe("selected-ad");
  });
});
