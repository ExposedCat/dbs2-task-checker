import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { useForm } from 'react-hook-form';
import { FaTrashAlt } from 'react-icons/fa';
import { Badge } from '~/components/elements/Badge';
import { Button } from '~/components/elements/Button';
import { FilePicker } from '~/components/elements/FilePicker';
import { Flex } from '~/components/elements/Flex';
import { Input } from '~/components/elements/Input';
import { Label } from '~/components/elements/Label';
import { Page } from '~/components/elements/Page.js';
import { usePostRequest } from '~/hooks/usePostRequest';
import { useDatasets } from '~/providers/DatasetsProvider';

type Data = {
  id: string;
  name: string;
  kind: string;
  files: FileList;
};

export function AdminPage() {
  const datasets = useDatasets();
  const { register, handleSubmit, reset } = useForm<Data>();

  const query = usePostRequest('/dataset', {
    contentType: 'form',
    onSuccess: () => reset()
  });

  // TODO: Remove

  const onRemove = React.useCallback(() => {
    alert('Datasets removal is not implemented yet');
  }, []);

  const onSubmit = React.useCallback((data: Data) => {
    const { files, ...rest } = data;
    query.request({
      ...rest,
      file: files[0]
    })
  }, []);

  return (
    <Page>
      <Label text="Manage Datasets" kind="header" />
      {datasets.map((dataset, i) => (
        <Flex
          key={i}
          justify="space-between"
          align="center"
          width="container.lg"
          className={css({
            border: 'base',
            rounded: 'common',
            padding: 'sm'
          })}>
          <Flex align="center" gap="sm">
            <Label text={dataset.name} />
            <Badge text={dataset.id} preserveCase />
          </Flex>
          <Button icon={FaTrashAlt} colorVariant="error" onClick={onRemove} />
        </Flex>
      ))}
      <Label text="Upload Dataset" kind="header" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Flex direction="column" gap="sm">
          <Input required type="text" placeholder="ID" {...register('id')} />
          <Input required type="text" placeholder="Name" {...register('name')} />
          <Input required type="text" placeholder="Kind" {...register('kind')} />
          <FilePicker required {...register('files')} />
          <Button label='Upload' />
        </Flex>
      </form>
      {query.state === 'success' && <Label text="Successfully Uploaded" color="success" />}
      {query.state === 'error' && <Label text="Upload Failed. See Console (F12) for details" />}
    </Page>
  );
}
