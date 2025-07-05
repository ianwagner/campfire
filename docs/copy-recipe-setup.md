# Copy Recipe Setup

Copy recipes let you generate ad text using predefined components and write-in fields.
This system mirrors the ad recipe generator but is focused solely on copy.

## Brand Component

Every brand document stores values for the built-in **`brand`** component such
as `name`, `toneOfVoice` and `offering`. When a copy recipe includes this
component, these fields are loaded automatically using the selected `brandCode`.
Placeholders like `{{brand.name}}` or `{{brand.toneOfVoice}}` inside the GPT
prompt are replaced with the matching values from the brand profile.

No extra selection is required in the form. Simply reference the placeholders in
your prompt and the generator will substitute the data from the chosen brand.
