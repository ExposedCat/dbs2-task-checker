import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { useForm } from 'react-hook-form';
import { FaEdit, FaTrashAlt } from 'react-icons/fa';
import { Badge } from '~/components/elements/Badge';
import { Button } from '~/components/elements/Button';
import { FilePicker } from '~/components/elements/FilePicker';
import { Flex } from '~/components/elements/Flex';
import { Input } from '~/components/elements/Input';
import { Label } from '~/components/elements/Label';
import { Page } from '~/components/elements/Page.js';
import { Popup } from '~/components/elements/Popup';
import { useGetRequest } from '~/hooks/useGetRequest';
import { usePostRequest } from '~/hooks/usePostRequest';
import { type Dataset, useDatasets } from '~/providers/DatasetsProvider';

type ManageDatasetProps = {
  dataset: Dataset;
};

const ManageDataset: React.FC<ManageDatasetProps> = ({ dataset }) => {
  const [editKindsOpen, setEditKindsOpen] = React.useState(false);

  const { register, handleSubmit } = useForm<{ kinds: Record<string, string> }>();

  const queryUrl = React.useMemo(() => `/dataset-kinds?datasetId=${dataset.id}`, [dataset.id]);
  const query = useGetRequest<{ kind: string; current?: number; total: number }[]>(queryUrl);

  const saveQuery = usePostRequest('/dataset-kinds', {
    onSuccess: () => setEditKindsOpen(false),
  });

  // TODO:
  const onRemove = React.useCallback(() => {
    alert('Datasets removal is not implemented yet');
  }, []);

  const onSubmit = React.useCallback((data: { kinds: Record<string, string> }) => {
    saveQuery.request({
      id: dataset.id,
      kinds: Object.fromEntries(
        Object.entries(data.kinds)
          .filter(([_, value]) => value)
          .map(([kind, value]) => [kind, Number(value)]),
      ),
    });
  }, []);

  return (
    <Flex
      justify="space-between"
      align="center"
      width="container.lg"
      className={css({
        border: 'base',
        rounded: 'common',
        padding: 'sm',
      })}
    >
      <Popup title="Update Dataset Kinds" open={editKindsOpen} onClose={() => setEditKindsOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Flex full direction="column" gap="sm">
            {query.data &&
              query.data.map(({ kind, current, total }, i) => (
                <Flex full align="center" justify="center" gap="sm" key={i}>
                  <Flex width="container.md" justify="end">
                    <Badge
                      text={kind}
                      preserveCase
                      className={css({
                        fontSize: 'md',
                        paddingX: 'sm',
                      })}
                    />
                  </Flex>
                  <Flex width="container.md" justify="start">
                    <Input
                      className={css({
                        maxWidth: 'container.sm',
                        padding: 'xs',
                      })}
                      placeholder={`${current ?? '?'}/${total}`}
                      {...register(`kinds.${kind}`)}
                    />
                  </Flex>
                </Flex>
              ))}
            <Button label="Save" disabled={query.data?.length === 0} />
          </Flex>
        </form>
      </Popup>
      <Flex align="center" gap="sm">
        <Label text={dataset.name} />
        <Badge text={dataset.id} preserveCase />
      </Flex>
      <Flex align="center" gap="sm">
        <Button
          icon={FaEdit}
          colorVariant="active"
          disabled={query.state !== 'success'}
          onClick={() => setEditKindsOpen(true)}
        />
        <Button icon={FaTrashAlt} colorVariant="error" onClick={onRemove} />
      </Flex>
    </Flex>
  );
};

type DatasetData = {
  id: string;
  name: string;
  kind: string;
  files: FileList;
};

export function AdminPage() {
  const datasets = useDatasets();
  const { register, handleSubmit, reset } = useForm<DatasetData>();

  const query = usePostRequest('/dataset', {
    contentType: 'form',
    onSuccess: () => reset(),
  });

  const onSubmit = React.useCallback((data: DatasetData) => {
    const { files, ...rest } = data;
    query.request({
      ...rest,
      file: files[0],
    });
  }, []);

  return (
    <Page>
      <Label text="Manage Datasets" kind="header" />
      {datasets.map((dataset, i) => (
        <ManageDataset key={i} dataset={dataset} />
      ))}
      <Label text="Upload Dataset" kind="header" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Flex direction="column" gap="sm">
          <Input required type="text" placeholder="ID" {...register('id')} />
          <Input required type="text" placeholder="Name" {...register('name')} />
          <Input required type="text" placeholder="Kind" {...register('kind')} />
          <FilePicker required {...register('files')} />
          <Button label="Upload" />
        </Flex>
      </form>
      {query.state === 'success' && <Label text="Successfully Uploaded" color="success" />}
      {query.state === 'error' && <Label text="Upload Failed. See Console (F12) for details" />}
    </Page>
  );
}
