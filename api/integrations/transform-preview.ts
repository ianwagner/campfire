import type { ApiHandler } from "../../lib/api/types";
import {
  TransformSpecError,
  transformReview,
  type TransformInput,
} from "../../lib/transform/engine";
import {
  buildTransformInput,
  type TransformContextPayload,
} from "../../lib/transform/context";

function methodNotAllowed(res: Parameters<ApiHandler>[1]) {
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "Method Not Allowed" });
}

const handler: ApiHandler<Record<string, unknown>> = async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res);
  }

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { spec, brand, adGroup, recipes, ads, context, review } =
    req.body as Record<string, unknown>;
  if (spec == null) {
    return res.status(400).json({ error: "Transform spec is required." });
  }

  let payload: TransformInput;
  if (context && typeof context === "object") {
    const transformContext = context as TransformContextPayload & Record<string, unknown>;
    payload = buildTransformInput({
      review: transformContext.review ?? review,
      ads: transformContext.ads ?? ads,
      brand: transformContext.brand ?? brand,
      adGroup: transformContext.adGroup ?? adGroup,
      recipes: transformContext.recipes ?? recipes,
    });
  } else {
    payload = buildTransformInput({ review, ads, brand, adGroup, recipes });
  }

  try {
    const rows = transformReview(spec, payload);
    return res.status(200).json({ rows });
  } catch (error) {
    if (error instanceof TransformSpecError) {
      return res.status(400).json({
        error: error.message,
        code: "transform/invalid_spec",
      });
    }

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate transform preview.",
    });
  }
};

export default handler;
