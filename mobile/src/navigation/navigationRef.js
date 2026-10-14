import { createNavigationContainerRef } from '@react-navigation/native';

/** Lets non-component code (notification taps) navigate once the container is ready. */
export const navigationRef = createNavigationContainerRef();
