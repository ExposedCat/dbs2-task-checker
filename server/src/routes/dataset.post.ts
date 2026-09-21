import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { type RawDatasetEntry, createOrUpdateDataset, deleteDatasetKind, setDatasetKinds } from '../services/dataset';
import { parseJsonFile } from '../services/file';

export const UploadDatasetRoute = new Elysia({ name: 'Route.UploadDataset' }) //
  .use(RequireAuth)
  .post(
    '/dataset',
    async ({ database, user, body: { file, ...details } }) => {
      if (!user.admin) {
        return { ok: false, data: null, error: 'Unauthorized' };
      }
      if (!file) {
        return await deleteDatasetKind({
          database,
          id: details.id,
          kind: details.kind,
        });
      }
      const { data } = await parseJsonFile<RawDatasetEntry[]>(file);
      if (!data) {
        return { ok: false, error: 'Unable to read file', data: null };
      }
      return await createOrUpdateDataset({ ...details, data, database });
    },
    {
      body: t.Object({
        id: t.String(),
        name: t.String(),
        kind: t.String(),
        file: t.Nullable(t.File()),
      }),
    },
  );
