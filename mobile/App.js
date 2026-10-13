import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Provider, useDispatch } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { store as defaultStore } from './src/store';
import { bootstrap } from './src/store/listeners';
import { useTheme } from './src/theme';

function Shell() {
  const { c } = useTheme();
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(bootstrap());
  }, [dispatch]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <RootNavigator />
    </View>
  );
}

/** `store` is injectable for tests. */
export default function App({ store = defaultStore }) {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </Provider>
  );
}
