module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['android/', 'ios/', 'vendor/', 'coverage/', 'node_modules/'],
  rules: {
    // Static layout goes in ScaledSheet stylesheets; inline objects here carry theme colours or computed,
    // already-scaled values (react-native-size-matters), which the rule cannot tell apart.
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      files: ['jest.setup.js', '__tests__/**/*.js', '**/*.test.js'],
      env: { jest: true },
    },
  ],
};
