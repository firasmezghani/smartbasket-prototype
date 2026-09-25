// One ingredient row on a personal recipe. Amount is free-text, never a package count.
export type PersonalIngredient = {
  id: string;
  name: string;
  amount: string;
};

// A customer-authored recipe stored on this device for one account.
export type PersonalRecipe = {
  id: string;
  title: string;
  ingredients: PersonalIngredient[];
  instructions: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalRecipeDraft = {
  // Null while creating a new recipe.
  id: string | null;
  title: string;
  ingredients: PersonalIngredient[];
  instructions: string;
};
