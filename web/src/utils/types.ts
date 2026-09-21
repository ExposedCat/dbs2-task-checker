import type { RecipeRuntimeFn, RecipeVariantRecord } from '@styled-system/types/recipe.mjs';

export type PropsFromCVA<T extends RecipeRuntimeFn<RecipeVariantRecord>> = Exclude<Parameters<T>['0'], undefined>;
