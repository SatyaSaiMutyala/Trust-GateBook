import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { expectedApi } from '../../api/endpoints';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useExpectedChanges } from '../../realtime/context';
import { useExpected } from '../../state/context';
import { fmtTime } from '../../utils/format';
import { boxesLine, expectedWhen } from '../../utils/expected';

/** "Expected today" chips above the form: tap one to fill the check-in from it. */
export function ExpectedTodayStrip() {
  const navigate = useNavigate();
  const { checkInFrom } = useExpected();
  const query = useMemo(() => ({ when: 'today', kind: 'visitor', limit: 8, page: 1 }), []);
  const list = usePaginatedQuery(expectedApi.list, query);
  useExpectedChanges(list.refresh, 300);
  const open = list.data.filter((e) => e.status === 'expected');
  if (!open.length) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ mb: 2, overflowX: 'auto', alignItems: 'stretch', pb: 0.5 }}
      aria-label="Expected today"
    >
      <Typography
        variant="eyebrow"
        sx={{ color: 'text.secondary', alignSelf: 'center', whiteSpace: 'nowrap', pr: 0.5 }}
      >
        Expected today
      </Typography>
      {open.map((e) => (
        <ButtonBase
          key={e.code}
          onClick={() => checkInFrom(e)}
          sx={(theme) => ({
            display: 'grid',
            textAlign: 'left',
            px: 1.5,
            py: 1,
            borderRadius: 1,
            border: `1px solid ${theme.vars.palette.gb.line}`,
            borderLeft: `3px solid ${theme.vars.palette.gb.ok}`,
            bgcolor: 'background.paper',
            whiteSpace: 'nowrap',
          })}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{e.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {fmtTime(e.expectedAt)} · for {(e.contact ?? e.host).name}
            {e.state === 'late' ? ' · late' : ''}
          </Typography>
        </ButtonBase>
      ))}
      {list.pagination.total > list.data.length ? (
        <Button size="small" onClick={() => navigate('/expected')} sx={{ whiteSpace: 'nowrap' }}>
          See all
        </Button>
      ) : null}
    </Stack>
  );
}

/** Shown when the form was filled from an Expected entry. */
export function ExpectedBanner({ entry, onUnlink }) {
  return (
    <Alert
      severity="success"
      icon={<EventAvailableOutlinedIcon />}
      sx={{ mb: 2 }}
      action={
        <Button color="inherit" size="small" onClick={onUnlink}>
          Not this person
        </Button>
      }
    >
      <b>Expected visitor{entry.preapproved ? ' · pre-approved' : ''}.</b> Registered by {entry.createdBy.name}
      {entry.createdBy.id !== entry.host.id ? ` for ${entry.host.name}` : ''}
      {entry.contact ? `, received here by ${entry.contact.name}` : ''} · {expectedWhen(entry)}. Details are filled in:
      take the photo and give the pass.
      {boxesLine(entry) ? (
        <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>
          Bringing {boxesLine(entry)}.
        </Box>
      ) : null}
      {entry.notes ? (
        <Box component="span" sx={{ display: 'block' }}>
          Note: “{entry.notes}”
        </Box>
      ) : null}
    </Alert>
  );
}

/** The typed mobile number matches someone expected today → offer to use their details. */
export function ExpectedPhoneMatch({ phone }) {
  const { checkInFrom } = useExpected();
  const [match, setMatch] = useState({ phone: '', expected: null });
  useEffect(() => {
    if (!phone) return;
    const ctrl = new AbortController();
    expectedApi
      .match(phone, ctrl.signal)
      .then((expected) => setMatch({ phone, expected }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [phone]);
  const e = match.phone === phone ? match.expected : null;
  if (!e) return null;
  return (
    <Alert
      severity="success"
      icon={<EventAvailableOutlinedIcon />}
      action={
        <Button color="inherit" size="small" onClick={() => checkInFrom(e)}>
          Use their details
        </Button>
      }
    >
      <b>Expected visitor.</b> {e.name} · {expectedWhen(e)} · for {e.host.name}
      {e.preapproved ? ' · pre-approved' : ''}
    </Alert>
  );
}
