# Compass Ad Log Integration – Field Mapping & Validation

## Field Mapping
| Internal Ad Field | Partner Field | Notes |
|-------------------|---------------|-------|
| shop | shop | Must be a valid Compass shop identifier; required. |
| group_desc | group_desc | Non-empty string describing ad group. |
| recipe_no | recipe_no | Numeric recipe identifier; non-zero. |
| product | product | Product name or SKU sent as-is. |
| product_url | product_url | Must be a valid URL pointing to the product landing page. |
| go_live_date (YYYY-MM-DD) | go_live_date | Required date string formatted `YYYY-MM-DD`. |
| funnel | funnel | Required funnel stage label. |
| angle (ID or text) | angle | Prefer numeric ID 1–32 when available; otherwise free-text description. |
| persona | persona | Required persona label. |
| primary_text | primary_text | Required body copy. |
| headline | headline | Required headline copy. |
| image_1x1 | image_1x1 | Must be a direct media file URL (image or video). |
| image_9x16 | image_9x16 | Must be a direct media file URL (image or video). |
| moment (optional) | moment | Optional string passed through when provided. |
| description (optional) | description | Optional string passed through when provided. |
| status (optional) | status | Optional string passed through when provided. |

## Validation & Handling Rules
1. **Required fields:** All mapped fields except `moment`, `description`, and `status` must be present and non-empty after trimming.
2. **Shop validation:** Ensure the `shop` value matches a known Compass shop before sending; treat "Invalid store" 500 responses as actionable errors.
3. **Recipe number:** Validate `recipe_no` is numeric and non-zero.
4. **Dates:** Confirm `go_live_date` is formatted as `YYYY-MM-DD`.
5. **URLs:** `product_url`, `image_1x1`, and `image_9x16` must be syntactically valid URLs. Media URLs must point directly to a file (not a folder or preview page).
6. **Media duplicates:** Treat "Duplicate Media" responses as idempotent success—log but do not retry.
7. **Angle format:** When a predefined angle ID (1–32) exists, send the numeric ID; otherwise send the descriptive text.
8. **Whitespace:** Trim leading/trailing whitespace on all strings before validation and submission (API also trims, but enforce client-side).
9. **Error handling:** On 400 responses (validation issues), mark the ad as "Error" with the response message. On success or duplicate, mark as "Received".

## Notes
- Endpoint: `POST https://api.compass.statlas.io/compass/RA9cCzM5Ux`
- Content-Type: `application/json`
- Authentication: None (internal server-to-server).
