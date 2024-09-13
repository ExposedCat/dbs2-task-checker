import type { RecipeRuntimeFn, RecipeVariantRecord } from '../../public/styled-system/types';

export type PropsFromCVA<T extends RecipeRuntimeFn<RecipeVariantRecord>> = Exclude<Parameters<T>['0'], undefined>;
