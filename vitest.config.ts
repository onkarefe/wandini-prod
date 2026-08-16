import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({projects: ['./tsconfig.json']})],
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
    restoreMocks: true,
  },
});
