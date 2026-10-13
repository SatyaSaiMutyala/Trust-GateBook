const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// react-native-size-matters/extend imports its guideline screen size from '@env'; point that at our constants file.
const SIZE_MATTERS_ENV = path.resolve(__dirname, 'src/theme/sizeMattersBase.js');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@env') {
        return { type: 'sourceFile', filePath: SIZE_MATTERS_ENV };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
