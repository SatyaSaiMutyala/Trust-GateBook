import React from 'react';
import { Linking } from 'react-native';
import { useSelector } from 'react-redux';
import { selectCanCheckIn } from '../store/authSlice';
import { useAllowVisit } from '../store/visitActions';
import { hostStage, telUrl } from '../utils/visit';
import { Button } from './Button';

/**
 * The gate's next step for an open visit that hasn't been let in yet:
 * host accepted → "Allowed in"; not on Gatebook / no reply → "Call host" + "Confirmed by phone".
 * Renders nothing for viewers, let-in or declined visits (declined → "Mark exit" does the rest).
 */
export function HostActions({ visit, size = 'sm', style }) {
  const canAct = useSelector(selectCanCheckIn);
  const { allow, busyId } = useAllowVisit();
  const stage = hostStage(visit);
  if (!canAct || !stage || stage.key === 'declined') return null;
  const busy = busyId === visit.id;

  if (stage.key === 'accepted') {
    return (
      <Button
        title="Allowed in"
        variant="ok"
        size={size}
        loading={busy}
        style={style}
        onPress={() => allow(visit, false)}
        accessibilityLabel={`${visit.name} allowed in`}
      />
    );
  }
  const showCall =
    (stage.key === 'noreply' || stage.key === 'manual') && !!visit.hostPhone;
  return (
    <>
      {showCall ? (
        <Button
          title="Call host"
          variant="ghost"
          size={size}
          style={style}
          onPress={() => Linking.openURL(telUrl(visit.hostPhone))}
          accessibilityLabel={`Call ${visit.host}`}
        />
      ) : null}
      <Button
        title="Confirmed by phone"
        variant="ghost"
        size={size}
        loading={busy}
        style={style}
        onPress={() => allow(visit, true)}
        accessibilityLabel={`${visit.host} confirmed by phone, let ${visit.name} in`}
      />
    </>
  );
}
