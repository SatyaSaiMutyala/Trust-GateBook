import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 30_000,
    // The first run may download a MongoDB binary for mongodb-memory-server.
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
