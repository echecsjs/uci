import { defineConfig } from 'vitest/config';

const config = defineConfig({
  test: {
    coverage: {
      // noop.ts is an intentionally empty function. v8 cannot instrument an
      // empty body, so it reports 0% despite the function being called and
      // tested. Exclude it from the report to avoid noise.
      exclude: ['src/parser/noop.ts'],
    },
  },
});

export default config;
