# Copy Recipe Setup

## Overview
The Copy Recipe Setup tab mirrors the functionality of Ad Recipe Setup but focuses on generating copy-only instructions.

## Brand and Product Data
Copy recipes can reference all brand and product information available in the Brands tab. When a recipe type includes the built-in `brand` or `product` components, values are automatically loaded using the selected `brandCode` just like ad recipes. Placeholders such as `{{brand.name}}` or `{{product.name}}` can be used inside the GPT prompt and will be replaced with the appropriate values.

## Components and Fields
Copy recipe types support the same component system as ad recipes. Components may define attributes and instances, and instances can be tied to specific brands using a `relationships.brandCode` field. Write‑in fields behave identically and are inserted into prompts via `{{key}}` placeholders.

