const preset = require('@react-native/jest-preset');

module.exports = {
  preset: '@react-native/jest-preset',
  // The app is plain JavaScript with .jsx components.
  transform: { ...preset.transform, '^.+\\.(js|jsx)$': 'babel-jest' },
  moduleFileExtensions: ['js', 'jsx', 'json'],
  // Same '@env' mapping as metro.config.js (react-native-size-matters/extend guideline size).
  moduleNameMapper: { '^@env$': '<rootDir>/src/theme/sizeMattersBase.js' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@reduxjs|react-redux|immer|redux|reselect|react-native-size-matters|react-native-safe-area-context|react-native-screens|@react-native-async-storage)/)',
  ],
  setupFiles: [...(preset.setupFiles ?? []), '<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
