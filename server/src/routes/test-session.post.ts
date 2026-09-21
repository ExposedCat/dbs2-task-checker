import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import type { DatasetName } from '../services/execute';
import { quitTestSession, startTestSession } from '../services/user';

export const TestSessionRoute = new Elysia({ name: 'Route.TestSession' }) //
  .use(RequireAuth)
  .post(
    '/test-session',
    async ({ database, user, body }) => {
      const datasetId = body.datasetId as DatasetName;
      // TODO: move to service
      const dataset = await database.datasets.findOne({ id: datasetId });
      if (dataset) {
        return await startTestSession({
          datasetId,
          database,
          user,
          cathegories: dataset.kinds,
          minPoints: 10,
        });
      }
    },
    { body: t.Object({ datasetId: t.String() }) },
  );

export const QuitTestSessionRoute = new Elysia({ name: 'Route.QuitTestSession' }) //
  .use(RequireAuth)
  .post('/quit', async ({ database, user }) => await quitTestSession({ database, user, force: true }));
