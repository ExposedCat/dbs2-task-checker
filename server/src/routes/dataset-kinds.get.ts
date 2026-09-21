import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { extractDatasetKinds } from '../services/dataset';

export const DatasetKindsRoute = new Elysia({ name: 'Route.DatasetKinds' })
  .use(RequireAuth)
  .get('/dataset-kinds', ({ database, query }) => extractDatasetKinds({ database, datasetId: query.datasetId }), {
    query: t.Object({ datasetId: t.String() }),
  });
