import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../api/client';
import { escalationsApi } from '../../api/endpoints';
import { EmptyState, Panel } from '../../components/bits';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { PAGE_SIZES, useUrlListParams } from '../../hooks/useUrlListParams';
import { useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';
import { MATRIX_LABEL } from '../../utils/escalation';

const DEFAULTS = { days: '7', matrix: '', page: 1, limit: 20 };

/** Settings → Escalation log: every reminder, alarm and escalation sent, newest first (admins). */
export function EscalationLogPanel() {
  const toast = useToast();
  const { params, setParams, setPage, setLimit } = useUrlListParams(DEFAULTS, { prefix: 'e.' });
  const query = useMemo(
    () => ({ days: params.days, matrix: params.matrix || undefined, page: params.page, limit: params.limit }),
    [params.days, params.matrix, params.page, params.limit],
  );
  const list = usePaginatedQuery(escalationsApi.list, query);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await escalationsApi.exportCsv({
        days: params.days,
        matrix: params.matrix || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? 'gatebook-escalations.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Panel title="Escalation log">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { md: 'center' } }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={params.days}
          onChange={(_, v) => v && setParams({ days: v })}
          aria-label="Period"
        >
          <ToggleButton value="1">Today</ToggleButton>
          <ToggleButton value="7">7 days</ToggleButton>
          <ToggleButton value="30">30 days</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          select
          size="small"
          value={params.matrix}
          onChange={(e) => setParams({ matrix: e.target.value })}
          sx={{ maxWidth: 260 }}
          slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Module' } }}
        >
          <MenuItem value="">All modules</MenuItem>
          {Object.entries(MATRIX_LABEL).map(([k, label]) => (
            <MenuItem key={k} value={k}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportCsv} disabled={exporting}>
          Export CSV
        </Button>
      </Stack>
      {list.error ? (
        <Alert severity="error" sx={{ mb: 1.5 }} action={<Button onClick={list.refresh}>Retry</Button>}>
          {list.error}
        </Alert>
      ) : null}
      {list.data.length === 0 && !list.loading && !list.error ? (
        <EmptyState
          title="No escalations in this period"
          text="Every reminder, alarm and escalation sent by any module is listed here."
        />
      ) : (
        <Box sx={{ overflowX: 'auto', opacity: list.loading ? 0.6 : 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Module</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Escalation</TableCell>
                <TableCell>Sent to</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell sx={{ fontFamily: fonts.mono, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {fmtDateTime(e.at)}
                  </TableCell>
                  <TableCell>
                    {MATRIX_LABEL[e.matrix] ?? e.matrix}
                    {e.site ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {e.site}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {e.item}
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: fonts.mono, fontSize: 12 }}>
                      {e.ref}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 600 }}>{e.title}</Typography>
                      {e.alarm ? <Chip size="small" variant="issue" label="Alarm" /> : null}
                    </Stack>
                    {e.occurrence > 1 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Repeat {e.occurrence}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{e.targetName}</Typography>
                    <Typography variant="body2">{e.recipients.map((r) => r.name).join(', ') || '—'}</Typography>
                    {e.note ? (
                      <Typography variant="body2" sx={{ color: 'warning.main' }}>
                        {e.note}
                      </Typography>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <TablePagination
        component="div"
        count={list.pagination.total}
        page={Math.max(0, Math.min(params.page - 1, Math.max(0, list.pagination.totalPages - 1)))}
        onPageChange={(_, p) => setPage(p + 1)}
        rowsPerPage={params.limit}
        rowsPerPageOptions={PAGE_SIZES}
        onRowsPerPageChange={(e) => setLimit(Number(e.target.value))}
      />
    </Panel>
  );
}
