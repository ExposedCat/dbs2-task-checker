import Elysia, { t } from 'elysia';
import { readDataset } from '../services/dataset';

export const DatasetRoute = new Elysia({ name: 'Route.Dataset' }) //
  .get('/dataset', ({ query }) => readDataset({ ...query }), {
    query: t.Object({
      datasetId: t.String(),
      format: t.Union([t.Literal('txt'), t.Literal('json')]),
    }),
  });
