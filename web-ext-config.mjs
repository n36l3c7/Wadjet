/**
 * web-ext configuration.
 *
 * The extension is built into `dist/`; web-ext operates on that directory for
 * both `run` (launch a temporary Firefox) and `lint` (AMO validation checks).
 */
export default {
  sourceDir: './dist',
  run: {
    // Prefer the current stable/ESR channel available on the machine.
    firefox: 'firefox',
  },
  build: {
    overwriteDest: true,
  },
  ignoreFiles: ['*.map'],
};
