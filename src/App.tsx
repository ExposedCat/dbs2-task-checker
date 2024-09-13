import { useState } from 'react';

import { css } from '../public/styled-system/css/css.mjs';
import reactLogo from './public/react.svg';
import { Flex } from './components/Flex.js';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <Flex direction="column" full align="center" justify="center">
      <div>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>React Essential</h1>
      <Flex direction="column" align="center">
        <button
          onClick={() => setCount(count => count + 1)}
          className={css({
            backgroundColor: 'blue.200',
            padding: '1',
            rounded: 'md',
          })}
        >
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </Flex>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </Flex>
  );
}
