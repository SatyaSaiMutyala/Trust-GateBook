import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { visitsApi } from '../../api/endpoints';
import { VisitorThumb } from '../../components/bits';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useVisitUi } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { firstName, fmtDate, fmtTime, plural } from '../../utils/format';

/**
 * Lookup by the last 10 digits once the phone is complete. History is paginated
 * (`/api/visits/lookup?phone=&page=&limit=5`) with "Load more".
 */
export function ReturningVisitor({ phone, onFill }) {
  const { openDetails } = useVisitUi();
  const [showHistory, setShowHistory] = useState(false);
  const q = usePaginatedQuery(visitsApi.lookup, { phone, limit: 5 }, { append: true });
  if (q.loading || q.error) return null;
  const open = q.extra.open ?? null;
  const total = q.pagination.total;

  if (open) {
    return (
      <Box
        sx={{
          p: 1.75,
          borderRadius: 1,
          bgcolor: 'gb.warnSoft',
          color: 'text.primary',
          border: 1,
          borderColor: 'warning.main',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Typography>
            <Box component="b" sx={{ color: 'warning.main' }}>
              Already inside.
            </Box>{' '}
            {firstName(open.name)} checked in at {fmtTime(open.inAt)}. Close that entry before checking in again.
          </Typography>
          <Button variant="outlined" onClick={() => openDetails(open)} sx={{ flexShrink: 0 }}>
            View entry
          </Button>
        </Stack>
      </Box>
    );
  }
  if (!total) return null;
  const last = q.data[0];
  if (!last) return null;

  return (
    <Box sx={{ p: 1.75, borderRadius: 1, bgcolor: 'gb.accentSoft', border: 1, borderColor: 'primary.main' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Typography>
          <b>Returning visitor.</b> {firstName(last.name)}
          {last.company ? ` · ${last.company}` : ''} · {plural(total, 'earlier visit')}, last on {fmtDate(last.inAt)}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button variant="text" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? 'Hide visits' : 'Earlier visits'}
          </Button>
          <Button variant="contained" color="secondary" onClick={() => onFill(last)}>
            Fill details
          </Button>
        </Stack>
      </Stack>
      <Collapse in={showHistory} unmountOnExit>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {q.data.map((v) => (
            <Stack
              key={v.id}
              direction="row"
              spacing={1.5}
              onClick={() => openDetails(v)}
              sx={{ alignItems: 'center', p: 1, borderRadius: 1, bgcolor: 'background.paper', cursor: 'pointer' }}
            >
              <VisitorThumb src={v.photoUrl} name={v.name} size={40} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {v.purpose} · {v.host}
                  {v.dept ? ` (${v.dept})` : ''}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: fonts.mono, fontSize: 12.5 }}>
                  {fmtDate(v.inAt)}
                </Typography>
              </Box>
            </Stack>
          ))}
          {q.pagination.hasNextPage ? (
            <Button variant="outlined" onClick={q.loadMore} disabled={q.loadingMore}>
              {q.loadingMore ? 'Loading…' : `Load more (${total - q.data.length} more)`}
            </Button>
          ) : null}
        </Stack>
      </Collapse>
    </Box>
  );
}
