/* global Response */
import React from 'react';
import { Vibration } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import {
  loggedIn,
  selectHasModule,
  userHasModule,
} from '../src/store/authSlice';
import { settingsReceived } from '../src/store/settingsSlice';
import { resetNotices } from '../src/push/dedupe';
import { meUpdatedEvent, notificationNewEvent } from '../src/realtime/events';
import { missingPhotos } from '../src/screens/LogMailScreen';
import { brandLogoUri } from '../src/components/BrandMark';
import { API_URL } from '../src/api/config';
import {
  chainText,
  defaultsFor,
  eligibleFor,
  moduleText,
} from '../src/utils/modules';
import { AccountScreen } from '../src/screens/AccountScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn(), navigate: jest.fn() }),
}));

const json = body =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const DEFS = [
  {
    key: 'track',
    label: 'Overview',
    group: 'Track',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Overview', 'Today at the gate'] },
  },
  {
    key: 'visitors',
    label: 'Visitors',
    group: 'Visitors',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Visitors', 'Check in, Inside now'] },
  },
  {
    key: 'expected',
    label: 'Expected',
    group: 'Visitors',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Expected', 'Pre-registered'],
      host: ['Expected', 'Register visitors'],
    },
  },
  {
    key: 'post',
    label: 'Post room',
    group: 'Gate desk',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Post room', 'Log post'],
      host: ['My post', 'See and confirm post'],
    },
  },
];

const ESC = {
  visitor: [
    {
      after: 5,
      to: 'guards',
      repeat: 0,
      alarm: true,
      label: 'No reply from host',
    },
  ],
  overstay: [],
  mail: [{ after: 240, to: 'person', repeat: 0, alarm: false, label: '' }],
};

beforeEach(() => {
  resetNotices();
  global.fetch = jest.fn(req => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('/api/settings')) return json({ settings: { esc: ESC } });
    if (url.includes('/api/users/modules')) return json({ modules: DEFS });
    if (url.includes('/api/users/org')) return json({ users: [] });
    return json({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });
});

describe('module access', () => {
  test('admins have everything; others their ticks; no modules field = everything', () => {
    expect(userHasModule({ role: 'admin', modules: [] }, 'post')).toBe(true);
    expect(
      userHasModule({ role: 'security', modules: ['visitors'] }, 'post'),
    ).toBe(false);
    expect(
      userHasModule({ role: 'security', modules: ['visitors'] }, 'visitors'),
    ).toBe(true);
    expect(userHasModule({ role: 'host' }, 'expected')).toBe(true);
    expect(userHasModule(null, 'post')).toBe(false);
  });

  test('me:updated replaces the signed-in user, so tabs follow', () => {
    const store = makeStore();
    store.dispatch(
      loggedIn({
        token: 't',
        user: {
          id: 'u1',
          name: 'Guard',
          role: 'security',
          modules: ['visitors', 'post'],
        },
      }),
    );
    expect(selectHasModule('post')(store.getState())).toBe(true);
    store.dispatch(
      meUpdatedEvent({
        id: 'u1',
        name: 'Guard',
        role: 'security',
        modules: ['visitors'],
      }),
    );
    expect(selectHasModule('post')(store.getState())).toBe(false);
    expect(selectHasModule('visitors')(store.getState())).toBe(true);
  });

  test('registry helpers: eligible and default modules per role, texts', () => {
    expect(eligibleFor(DEFS, 'host').map(d => d.key)).toEqual([
      'expected',
      'post',
    ]);
    expect(eligibleFor(DEFS, 'admin')).toHaveLength(4);
    expect(defaultsFor(DEFS, 'security')).toEqual([
      'track',
      'visitors',
      'expected',
      'post',
    ]);
    expect(moduleText(DEFS[3], 'host')).toEqual([
      'My post',
      'See and confirm post',
    ]);
    expect(moduleText(DEFS[0], 'viewer')).toEqual([
      'Overview',
      'Today at the gate',
    ]);
  });
});

describe('hierarchy', () => {
  test('the escalation chain walks reportsTo, skips inactive managers, and stops on loops', () => {
    const org = [
      { id: 'g', name: 'Guard', reportsTo: 's', active: true },
      { id: 's', name: 'Supervisor', reportsTo: 'm', active: true },
      { id: 'm', name: 'Manager', reportsTo: null, active: true },
      { id: 'x', name: 'Loop A', reportsTo: 'y', active: true },
      { id: 'y', name: 'Loop B', reportsTo: 'x', active: true },
      { id: 'h', name: 'Host', reportsTo: 'gone', active: true },
      { id: 'gone', name: 'Left', reportsTo: null, active: false },
    ];
    expect(chainText(org, 'g')).toBe('Supervisor → Manager → admin');
    expect(chainText(org, 'm')).toBe('admin');
    expect(chainText(org, 'x')).toBe('Loop B → admin');
    expect(chainText(org, 'h')).toBe('admin');
  });
});

describe('rules', () => {
  test('post photos: all required by default; the settings rules switch them off', () => {
    expect(missingPhotos({})).toEqual({
      cover: true,
      coverBack: true,
      person: true,
    });
    expect(missingPhotos({}, { mailCoverRequired: false })).toEqual({
      person: true,
    });
    expect(
      missingPhotos(
        {},
        { mailCoverRequired: false, mailPersonPhotoRequired: false },
      ),
    ).toEqual({});
  });
});

describe('branding & escalations', () => {
  test('the logo URL is made absolute against the API', () => {
    expect(brandLogoUri('/api/brand/logo?v=1')).toBe(
      `${API_URL}/api/brand/logo?v=1`,
    );
    expect(brandLogoUri('https://cdn.example/logo.png')).toBe(
      'https://cdn.example/logo.png',
    );
    expect(brandLogoUri(null)).toBeNull();
  });

  test('an alarm escalation vibrates longer than a normal one, and both toast', () => {
    const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    const store = makeStore();
    store.dispatch(
      loggedIn({ token: 't', user: { id: 'u1', name: 'Head', role: 'host' } }),
    );
    store.dispatch(
      notificationNewEvent({
        notification: {
          id: 'n1',
          event: 'escalation',
          title: '⏰ Visitor still waiting',
          body: 'Anil has waited 16m',
          data: { type: 'visit', id: 'GB-1' },
          alarm: false,
        },
        unreadCount: 1,
      }),
    );
    expect(spy).toHaveBeenLastCalledWith([0, 300, 150, 300]);
    expect(store.getState().ui.toast.message).toBe(
      '⏰ Visitor still waiting · Anil has waited 16m',
    );
    store.dispatch(
      notificationNewEvent({
        notification: {
          id: 'n2',
          event: 'visit_no_reply',
          title: '⏰ No reply from Ravi',
          body: 'call the host',
          data: { type: 'visit', id: 'GB-2' },
          alarm: true,
        },
        unreadCount: 2,
      }),
    );
    expect(spy).toHaveBeenLastCalledWith([0, 500, 200, 500, 200, 500]);
    spy.mockRestore();
  });

  test('an admin sees the new rules and the escalation matrices in Account', async () => {
    const store = makeStore();
    store.dispatch(
      loggedIn({
        token: 't',
        user: {
          id: 'a1',
          name: 'Administrator',
          email: 'admin@gatebook.local',
          role: 'admin',
        },
      }),
    );
    store.dispatch(
      settingsReceived({
        esc: {
          visitor: [
            {
              after: 5,
              to: 'guards',
              repeat: 0,
              alarm: true,
              label: 'No reply from host',
            },
          ],
          overstay: [],
          mail: [
            { after: 240, to: 'person', repeat: 0, alarm: false, label: '' },
          ],
        },
      }),
    );
    let tree;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <Provider store={store}>
          <SafeAreaProvider>
            <AccountScreen />
          </SafeAreaProvider>
        </Provider>,
      );
    });
    const all = tree.root
      .findAll(
        n =>
          typeof n.props.children === 'string' ||
          Array.isArray(n.props.children),
      )
      .map(n =>
        []
          .concat(n.props.children)
          .filter(x => typeof x === 'string')
          .join(''),
      )
      .join(' | ');
    await ReactTestRenderer.act(async () => tree.unmount());
    expect(all).toContain('Check-in rules');
    expect(all).toContain('Visitor photo is required');
    expect(all).toContain('Post logging rules');
    expect(all).toContain('Escalation matrices');
    expect(all).toContain('Guards on duty · alarm · No reply from host');
    expect(all).toContain('No steps. Nobody is alerted.');
  });
});
