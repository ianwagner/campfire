import React from 'react';

// TODO: implement a full copy recipe system similar to AdminRecipeSetup.
// The copy recipe generator should output three text boxes: Primary Text,
// Headline and Description. A new Rules tab will eventually describe the
// guidelines for each field. The implementation is left as future work.

const AdminCopyRecipes = () => (
  <div className="min-h-screen p-4">
    <h1 className="text-2xl mb-4">Copy Recipes</h1>
    <p>
      This area will let administrators configure and generate copy recipes. It
      reuses the ad recipe system but produces Primary Text, Headline and
      Description instead of image assets.
    </p>
  </div>
);

export default AdminCopyRecipes;
