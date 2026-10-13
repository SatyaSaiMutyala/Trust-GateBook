/**
 * Guideline screen for react-native-size-matters (`react-native-size-matters/extend` reads these from '@env',
 * which metro.config.js and jest.config.js map to this file). 390 × 844 pt = iPhone 12–16, so sizes are 1:1 on today's common
 * phones and scale gently up on larger ones and down on small ones. The library default (350 × 680, a 5" phone)
 * blew everything up by 12–40% on modern devices.
 */
export const SIZE_MATTERS_BASE_WIDTH = 390;
export const SIZE_MATTERS_BASE_HEIGHT = 844;
