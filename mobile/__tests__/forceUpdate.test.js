import fs from 'fs';
import path from 'path';
import React from 'react';
import { AppState, Linking, Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  ANDROID_PACKAGE_ID,
  APP_VERSION,
  PLAY_STORE_URL,
} from '../src/config/appVersion';
import { ForceUpdateDialog } from '../src/components/ForceUpdateDialog';
import { useForceUpdate } from '../src/state/useForceUpdate';
import { fetchPlayStoreVersion, isNewer } from '../src/utils/playStoreVersion';

const gradle = fs.readFileSync(
  path.join(__dirname, '../android/app/build.gradle'),
  'utf8',
);

describe('appVersion.js follows build.gradle', () => {
  // The syncAppVersion Gradle task rewrites the file on every Android build; this catches a stale copy in the repo.
  test('APP_VERSION = versionName, ANDROID_PACKAGE_ID = applicationId', () => {
    expect(APP_VERSION).toBe(gradle.match(/versionName\s+"([^"]+)"/)[1]);
    expect(ANDROID_PACKAGE_ID).toBe(
      gradle.match(/applicationId\s+"([^"]+)"/)[1],
    );
    expect(PLAY_STORE_URL).toBe(
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`,
    );
  });
});

describe('isNewer', () => {
  test.each([
    ['1.10', '1.9', true],
    ['1.0.1', '1.0', true],
    ['2.0', '1.99.99', true],
    ['1.0', '1.0', false],
    ['1.0', '1.0.0', false],
    ['1.9', '1.10', false],
  ])('%s newer than %s → %s', (a, b, out) => {
    expect(isNewer(a, b)).toBe(out);
  });
});

describe('fetchPlayStoreVersion', () => {
  afterEach(() => {
    delete global.fetch;
  });
  const page = body => () =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(body) });
  test('reads the current page layout', async () => {
    global.fetch = jest.fn(page('xx[[["1.0.4"]],[[[33]]]]yy'));
    await expect(fetchPlayStoreVersion()).resolves.toBe('1.0.4');
    expect(global.fetch.mock.calls[0][0]).toContain(`id=${ANDROID_PACKAGE_ID}`);
  });
  test('reads the old page layout', async () => {
    global.fetch = jest.fn(
      page('<div>Current Version</div><span class="x">2.3.1</span>'),
    );
    await expect(fetchPlayStoreVersion()).resolves.toBe('2.3.1');
  });
  test('unknown page or error status → null (never blocks)', async () => {
    global.fetch = jest.fn(page('<html>nothing here</html>'));
    await expect(fetchPlayStoreVersion()).resolves.toBeNull();
    global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
    await expect(fetchPlayStoreVersion()).resolves.toBeNull();
  });
});

describe('useForceUpdate', () => {
  const realDev = global.__DEV__;
  const realOS = Platform.OS;
  let result;
  function Probe() {
    result = useForceUpdate();
    return null;
  }
  async function mount() {
    let tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    return tree;
  }
  beforeEach(() => {
    global.__DEV__ = false;
    Platform.OS = 'android';
  });
  afterEach(() => {
    global.__DEV__ = realDev;
    Platform.OS = realOS;
    delete global.fetch;
    jest.restoreAllMocks();
  });
  const store = v => () =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(`[[["${v}"]]]`),
    });

  test('a newer Play version requires an update', async () => {
    global.fetch = jest.fn(store('99.0'));
    const tree = await mount();
    expect(result.updateRequired).toBe(true);
    expect(result.storeVersion).toBe('99.0');
    tree.unmount();
  });

  test('same version, debug builds, iOS and failures never block', async () => {
    global.fetch = jest.fn(store(APP_VERSION));
    let tree = await mount();
    expect(result.updateRequired).toBe(false);
    tree.unmount();

    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    tree = await mount();
    expect(result.updateRequired).toBe(false);
    tree.unmount();

    global.fetch = jest.fn(store('99.0'));
    global.__DEV__ = true;
    tree = await mount();
    expect(result.updateRequired).toBe(false);
    tree.unmount();

    global.__DEV__ = false;
    Platform.OS = 'ios';
    tree = await mount();
    expect(result.updateRequired).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    tree.unmount();
  });

  test('checks again when the app returns to the foreground', async () => {
    let onChange;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
      onChange = fn;
      return { remove: jest.fn() };
    });
    global.fetch = jest.fn(store(APP_VERSION));
    const tree = await mount();
    expect(result.updateRequired).toBe(false);
    global.fetch = jest.fn(store('99.0'));
    await ReactTestRenderer.act(async () => {
      onChange('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.updateRequired).toBe(true);
    tree.unmount();
  });

  test('openStore tries the Play app, then the web page', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockImplementationOnce(() => Promise.reject(new Error('no market')))
      .mockImplementation(() => Promise.resolve());
    global.fetch = jest.fn(store(APP_VERSION));
    const tree = await mount();
    await ReactTestRenderer.act(async () => {
      result.openStore();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(open.mock.calls.map(c => c[0])).toEqual([
      `market://details?id=${ANDROID_PACKAGE_ID}`,
      PLAY_STORE_URL,
    ]);
    tree.unmount();
  });
});

describe('ForceUpdateDialog', () => {
  test('one Update button, no way to close it', async () => {
    const onUpdate = jest.fn();
    let tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <ForceUpdateDialog visible storeVersion="1.2" onUpdate={onUpdate} />,
      );
    });
    const texts = tree.root
      .findAll(n => typeof n.props.children === 'string')
      .map(n => n.props.children);
    expect(texts).toEqual(
      expect.arrayContaining(['Update required', 'Update now']),
    );
    expect(texts.join(' ')).toContain('(v1.2)');
    // Back button does nothing; the only button is "Update now".
    const modal = tree.root.findByType(require('react-native').Modal);
    expect(modal.props.onRequestClose()).toBeUndefined();
    const buttons = tree.root.findAll(
      n => n.props.accessibilityRole === 'button' && n.props.onPress,
    );
    expect(buttons).toHaveLength(1);
    await ReactTestRenderer.act(async () => {
      buttons[0].props.onPress();
    });
    expect(onUpdate).toHaveBeenCalled();
    tree.unmount();
  });
});
