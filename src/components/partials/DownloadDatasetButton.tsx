import { useNavigation } from '~/providers/NavigationProvider.js';
import { DownloadLink } from '../elements/DownloadLink.js';
import { Button } from '../elements/Button.js';

export const DownlloadDatasetButton: React.FC = () => {
  const { currentDataset } = useNavigation();

  return (
    <DownloadLink path={`/dataset?datasetId=${currentDataset}&format=txt`}>
      <Button label="Open Dataset" variant="outline" />
    </DownloadLink>
  );
};
