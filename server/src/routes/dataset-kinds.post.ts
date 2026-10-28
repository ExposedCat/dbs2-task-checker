import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { setDatasetKinds } from '../services/dataset';

export const SetDatasetKindsRoute = new Elysia({
  name: 'Route.SetDatasetKinds',
}) //
  .use(RequireAuth)
  .post(
    '/dataset-kinds',
    async ({ database, user, body: { id, kinds, minPoints } }) => {
      if (!user.admin) {
        return { ok: false, data: null, error: 'Unauthorized' };
      }
      return await setDatasetKinds({ database, datasetId: id, kinds, minPoints });
    },
    {
      body: t.Object({
        id: t.String(),
        minPoints: t.Optional(t.Integer({ minimum: 1 })),
        kinds: t.Record(t.String(), t.Number()),
      }),
    },
  );
