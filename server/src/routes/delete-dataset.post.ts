import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';

export const DeleteDatasetRoute = new Elysia({ name: 'Route.DeleteDataset' }) //
  .use(RequireAuth)
  .post(
    '/delete-dataset',
    async ({ database, user, body: { id } }) => {
      if (!user.admin) {
        return { ok: false, data: null, error: 'Unauthorized' };
      }
      // TODO: Move to service
      await database.datasets.deleteOne({ id });
      return { ok: true, data: null, error: null };
    },
    { body: t.Object({ id: t.String() }) },
  );
