import React from 'react';
import { Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { fonts, useTheme } from '../theme';
import { CrossIcon, TickIcon } from './Glyphs';
import { BellIcon } from './NotificationBell';
import { TabIcon } from './TabIcons';

/** Kind of icon per notification event: what is drawn and in which tone. */
const KIND = {
  mail_logged: 'mail',
  mail_reminder: 'bell',
  mail_confirm: 'tick',
  mail_disputed: 'alert',
  signup_request: 'person',
  visit_arrived: 'person',
  visit_reply: 'tick',
  visit_no_reply: 'bell',
  expected_new: 'calendar',
  expected_arrived: 'tick',
  expected_cancelled: 'cross',
  escalation: 'bell',
  material_in: 'box',
  material_approval: 'box',
  material_decision: 'tick',
  material_disputed: 'alert',
  key_issued: 'log',
  incident_assigned: 'alert',
  incident_update: 'log',
  incident_closed: 'tick',
};

/**
 * Notification icon drawn with Views in a tinted circle (like the web inbox): envelope = post, person =
 * visitor / sign-up request, calendar = expected visitor, box = material, bell = reminder / escalation,
 * tick = done, "!" = dispute / incident, cross = cancelled. Unknown events get the bell.
 */
export function EventIcon({ event }) {
  const { c } = useTheme();
  const kind = KIND[event] ?? 'bell';
  const look = {
    mail: { bg: c.accentSoft, fg: c.ink },
    person: { bg: c.sunk, fg: c.ink },
    calendar: { bg: c.accentSoft, fg: c.ink },
    box: { bg: c.accentSoft, fg: c.ink },
    log: { bg: c.sunk, fg: c.ink },
    bell: { bg: c.warnSoft, fg: c.warn },
    tick: { bg: c.okSoft, fg: c.ok },
    alert: { bg: c.badSoft, fg: c.bad },
    cross: { bg: c.badSoft, fg: c.bad },
  }[kind];

  const tab = {
    mail: 'mail',
    person: 'inside',
    calendar: 'calendar',
    box: 'box',
    log: 'log',
  }[kind];
  let glyph;
  if (tab)
    glyph = <TabIcon name={tab} color={look.fg} bg={look.bg} size={20} />;
  else if (kind === 'tick') glyph = <TickIcon color={look.fg} size={18} />;
  else if (kind === 'cross')
    glyph = <CrossIcon color={look.fg} size={16} thickness={2.5} />;
  else if (kind === 'alert')
    glyph = <Text style={[styles.bang, { color: look.fg }]}>!</Text>;
  else glyph = <BellIcon color={look.fg} size={18} />;

  return (
    <View
      style={[styles.circle, { backgroundColor: look.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {glyph}
    </View>
  );
}

const styles = ScaledSheet.create({
  circle: {
    width: '40@ms',
    height: '40@ms',
    borderRadius: '20@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bang: {
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    includeFontPadding: false,
  },
});
