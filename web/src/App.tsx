import { ProvideQueryClient } from './providers/QueryClientProvider.js';
import { ProvideNavigation } from './providers/NavigationProvider.js';
import { Body } from './components/partials/Body.js';

export function App() {
  return (
    <ProvideQueryClient>
      <ProvideNavigation>
        <Body />
      </ProvideNavigation>
    </ProvideQueryClient>
  );
}
