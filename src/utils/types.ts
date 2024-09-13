import type { RecipeRuntimeFn, RecipeVariantRecord } from '../../public/styled-system/types/recipe.mjs';

export type PropsFromCVA<T extends RecipeRuntimeFn<RecipeVariantRecord>> = Exclude<Parameters<T>['0'], undefined>;
