# Ad Recipe Setup

## Overview
The Ad Recipe Setup tab controls the configuration for ad instructions and briefings. Recipes appear as rows in a table, with each row representing a single recipe.

## User Input
Recipes are assembled from values that users provide through a form. Inputs can be free text or predefined **components**. Recipe types may also declare **write-in fields** for information like "angle" or "audience" that should not be restricted to predefined options.

Each component is comprised of one or more **attributes** which define the fields in the form (text, number, textarea or image). Components can also have named **instances**. An instance stores values for all of the component's attributes—for example the `audience` component could have an instance called "young adults" that provides the age range and interests. When a recipe is generated the selected instances are substituted into the GPT prompt.

Instances may also include a `relationships` object. This links the instance to other records. The first supported relationship is `brandCode`, referencing a brand code from the Brands tab. Use it when an instance only applies to a particular brand.

The system also provides a built-in **`brand`** component. Each brand document stores values for this component—fields such as `name`, `toneOfVoice`, and `offering`—which administrators manage in the Brands tab. When a recipe type includes the `brand` component, these values are automatically loaded using the selected `brandCode` and inserted into the GPT prompt with placeholders like `{{brand.name}}`, `{{brand.toneOfVoice}}`, and `{{brand.offering}}`. No user selection is required.

Components also define a `selectionMode` that controls how an instance is chosen when generating a recipe:

- **`random`** – one instance is randomly selected for each recipe.
- **`dropdown`** – the user chooses a single instance from a dropdown.
- **`checklist`** – the user may pick multiple instances which are either used as-is or randomly sampled.

The chosen mode determines how components contribute their values to the final recipe.

Write-in fields are simpler than components. Each field specifies a `label`, `key`, and `inputType` (text, number, textarea, image or **list**). When `list` is chosen the user may enter multiple values and one will be selected at random during generation. Values are inserted into the GPT prompt using `{{key}}` placeholders.

## Output
The system intelligently matches the chosen options to generate an ad recipe. The resulting recipe is displayed in the table.

## Recipe Table
Generated recipes appear as rows in a table. The table columns list the chosen component values, the copy, and the ad recipe number. This structure lets you scan component selections alongside the resulting text.

## Recipe Type Tab
The Recipe Type tab lets an admin define:
- The form layout presented to the user.
- The message that is sent to chat when the recipe is generated.
- The order in which components and chat output appear in each recipe row.
- A description displayed below the title when generating a brief.

When creating a type, list the component keys in the desired order separated by
commas (e.g. `headline,cta,image`). These keys correspond to components defined
in the **Components** tab.

### GPT Prompt

Each recipe type stores a GPT prompt that is sent to the language model when a
recipe is generated. Use double curly braces to reference component values
inside the prompt. For example:

```
Write a headline for {{product}} that highlights {{feature}}.
```

During generation the placeholders will be replaced with the user's input for
the matching components.

The generation feature uses OpenAI's ChatGPT API. Provide your API key via the
`VITE_OPENAI_API_KEY` environment variable so the preview can send requests to
the language model.


## Firestore Rules

Admins must be able to read and write recipe configuration data. Ensure your
`firestore.rules` file includes collections for `recipeTypes` and
`componentTypes` and `componentInstances` with write access restricted to administrators:

```
match /recipeTypes/{docId} {
  allow read: if true;
  allow write: if isAdmin();
}

match /componentTypes/{docId} {
  allow read: if true;
  allow write: if isAdmin();
}

match /componentInstances/{docId} {
  allow read: if true;
  allow write: if isAdmin();
}
```
