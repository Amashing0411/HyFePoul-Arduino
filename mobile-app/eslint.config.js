// ESLint flat config, using Expo's base config (JSX, TypeScript, React
// Native globals and platform file extensions).
// Run with `npm run lint` (expo lint).
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    // Generated native projects and build output are not linted.
    ignores: ['android/*', 'ios/*', 'dist/*', '.expo/*'],
  },
  {
    rules: {
      // Baseline (R-33): FirebaseDataContext, useDeviceAlerts and
      // useDeviceHistory reset their state synchronously when the owned
      // device list becomes empty. That costs an extra render but is not a
      // bug; restructuring the data hooks is left for a change that can be
      // tested on a device. Kept visible as a warning, not an error.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Integration tests must set the emulator environment variables before
    // importing Firebase, so their imports intentionally follow code.
    files: ['src/**/__tests__/**'],
    rules: {
      'import/first': 'off',
    },
  },
]);
