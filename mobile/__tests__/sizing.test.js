import { Dimensions } from 'react-native';
import {
  scale,
  verticalScale,
  moderateScale,
} from 'react-native-size-matters/extend';
import {
  SIZE_MATTERS_BASE_WIDTH,
  SIZE_MATTERS_BASE_HEIGHT,
} from '../src/theme/sizeMattersBase';

// react-native-size-matters/extend must read the 390 × 844 guideline (via the '@env' alias), not its 350 × 680 default.
test('size-matters scales from the 390 × 844 guideline screen', () => {
  const { width, height } = Dimensions.get('window');
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  expect(SIZE_MATTERS_BASE_WIDTH).toBe(390);
  expect(SIZE_MATTERS_BASE_HEIGHT).toBe(844);
  expect(scale(100)).toBeCloseTo((short / 390) * 100, 5);
  expect(verticalScale(100)).toBeCloseTo((long / 844) * 100, 5);
  expect(moderateScale(100)).toBeCloseTo(
    100 + ((short / 390) * 100 - 100) * 0.5,
    5,
  );
});
