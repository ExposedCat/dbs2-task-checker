import Elysia from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { hasPassed } from '../services/test-policy';
import { getDatasets } from '../services/dataset';

export const SessionRoute = new Elysia({ name: 'Route.Session' })
  .use(RequireAuth)
  .get('/session', async ({ user, database }) => {
    // FIXME:
    const { data } = await getDatasets({ database });
    const availableTests = data
      .filter(dataset => !hasPassed(user.submissions, dataset.id, dataset.minPoints))
      .map(dataset => dataset.id);
    const nextTaskIndex = user.testSession?.tasks.findIndex(task => !task.userSolution);
    const nextTask =
      nextTaskIndex === undefined || nextTaskIndex === -1 ? null : user.testSession!.tasks[nextTaskIndex];
    return {
      ok: true,
      data: {
        date: Date.now(),
        login: user.user,
        testSession: nextTask && {
          sessionId: user.testSession!.id,
          taskId: nextTask.id,
          kind: nextTask.kind,
          datasetId: user.testSession!.datasetId,
          question: nextTask.question,
          questionNumber: nextTaskIndex! + 1,
          questionTotal: user.testSession!.tasks.length,
        },
        availableTests,
        admin: user.admin,
      },
      error: null,
    };
  });
