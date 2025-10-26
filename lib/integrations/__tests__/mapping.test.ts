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
        "1x1": "https://cdn.example.com/square.png",
        "9x16": "https://cdn.example.com/vertical.png",
      })
    );
    expect(exports[0].asset1x1Url).toBe("https://cdn.example.com/square.png");
    expect(exports[0].asset9x16Url).toBe("https://cdn.example.com/vertical.png");
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
      summary,
      defaultExport,
      generatedAt,
      data: { standardAds },
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
