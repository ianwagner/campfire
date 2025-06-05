# Ad Recipe Setup

## Overview
The Ad Recipe Setup tab controls the configuration for ad instructions and briefings. Recipes appear as rows in a table, with each row representing a single recipe.

## User Input
Recipes are assembled from values that users provide through a form. Inputs can be free text or predefined **components**.

Each component is comprised of one or more **attributes** which define the fields in the form (text, number, textarea or image). Components can also have named **instances**. An instance stores values for all of the component's attributes—for example the `audience` component could have an instance called "young adults" that provides the age range and interests. When a recipe is generated the selected instances are substituted into the GPT prompt.

## Output
The system intelligently matches the chosen options to generate an ad recipe. The resulting recipe is displayed in the table.

## Recipe Type Tab
The Recipe Type tab lets an admin define:
- The form layout presented to the user.
- The message that is sent to chat when the recipe is generated.
- The order in which components and chat output appear in each recipe row.

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
