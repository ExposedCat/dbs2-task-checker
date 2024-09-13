import { TopBar } from '~/components/TopBar';
import { ProvideQueryClient } from './components/QueryClient.js';
import { ProvideNavigation } from './components/Navigation.js';
import { Flex } from './components/Flex.js';

export function App() {
  return (
    <ProvideQueryClient>
      <ProvideNavigation>
        <Body />
      </ProvideNavigation>
    </ProvideQueryClient>
  );
}

const Body: React.FC = () => (
  <Flex full direction="column">
    <TopBar />
  </Flex>
);
