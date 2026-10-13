import CloseIcon from "@mui/icons-material/Close";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useUser } from "../../auth/context";
import { canOperate, isGateUser } from "../../auth/roles";
import { useIsDesktop, useNow } from "../../hooks";
import { useMailUi } from "../../state/context";
import { fonts } from "../../theme/tokens";
import { fmtDateTime, fmtMinutes, fmtTime } from "../../utils/format";
import { firstWord, hasRecipientUser } from "../../utils/mail";
import { FieldLabel, FillThumb, TimelineItem } from "../bits";
import { ImagePreview } from "../ImagePreview";
import { KindTag, MailStatusChip } from "./MailBits";

/** Drawer on desktop, full screen on phone. */
export function MailDetailsDrawer({ item, open, onClose }) {
  const desktop = useIsDesktop();
  const content = item ? (
    <Details key={item.id} item={item} onClose={onClose} />
  ) : null;
  if (desktop) {
    return (
      <Drawer
        anchor="right"
        open={open && !!item}
        onClose={onClose}
        slotProps={{
          paper: {
            sx: {
              width: 500,
              maxWidth: "100vw",
              bgcolor: "background.default",
            },
          },
        }}
      >
        {content}
      </Drawer>
    );
  }
  return (
    <Dialog
      fullScreen
      open={open && !!item}
      onClose={onClose}
      slotProps={{
        paper: { sx: { bgcolor: "background.default", borderRadius: 0 } },
      }}
    >
      {content}
    </Dialog>
  );
}

function Mono({ children }) {
  return (
    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: "0.92em" }}>
      {children}
    </Box>
  );
}

function PhotoBox({ label, src, alt, contain, aspect, onOpen }) {
  return (
    <>
      <FieldLabel>{label}</FieldLabel>
      <Box sx={{ mt: 0.75, aspectRatio: aspect, width: "100%" }}>
        {src ? (
          <FillThumb src={src} name={alt} contain={contain} onOpen={onOpen} />
        ) : (
          <Box
            sx={{
              height: "100%",
              borderRadius: 1,
              border: "1px dashed",
              borderColor: "divider",
              bgcolor: "gb.sunk",
            }}
          />
        )}
      </Box>
    </>
  );
}

function Details({ item: m, onClose }) {
  const user = useUser();
  const now = useNow();
  const { openHandover, openResolve, remind, confirm } = useMailUi();
  const staff = isGateUser(user);
  const act = canOperate(user);
  const mine = !!m.recipient && m.recipient.id === user.id;
  const who = firstWord(m.recipientName) || m.recipientName;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Full-screen photo viewer: index into the photos, or null when closed.
  const [preview, setPreview] = useState(null);

  const answer = async (ok) => {
    setBusy(true);
    await confirm(m, ok, note);
    setBusy(false);
  };

  const details = [
    ["From (sender)", m.sender || "—"],
    ["Brought by", m.carrier || "—"],
    ["Delivery person", m.broughtBy || "—"],
    [
      "Their mobile",
      m.broughtPhone ? <Mono key="p">{m.broughtPhone}</Mono> : "—",
    ],
    ["Tracking / ref no.", m.refNo ? <Mono key="r">{m.refNo}</Mono> : "—"],
    ["Pieces", String(m.pieces ?? 1)],
    [
      "For",
      <span key="f">
        {m.recipientName}
        {staff && m.recipient?.phone ? (
          <>
            {" · "}
            <Mono>{m.recipient.phone}</Mono>
          </>
        ) : null}
        {m.recipient?.location ? ` · ${m.recipient.location}` : ""}
      </span>,
    ],
    ["Department", m.dept || "—"],
    ["Remarks", m.notes || "—"],
  ];

  const showStaffActions =
    act && (m.status === "lodged" || m.status === "disputed");
  const showConfirm = mine && m.status === "handed";

  return (
    <Stack sx={{ minHeight: "100%" }}>
      <Box
        sx={{
          p: { xs: 2, md: 3 },
          pb: 2,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", mb: 1 }}
            >
              <KindTag kind={m.kind} />
              <Typography
                variant="mono"
                sx={{ color: "text.secondary", fontSize: "0.8rem" }}
              >
                {m.id}
              </Typography>
            </Stack>
            <Typography variant="h2" sx={{ wordBreak: "break-word" }}>
              For {m.recipientName}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <MailStatusChip status={m.status} size="medium" />
            </Box>
          </Box>
          <IconButton
            onClick={onClose}
            aria-label="Close"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1 }}>
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid size={6}>
            <PhotoBox
              label="Cover"
              src={m.coverPhotoUrl}
              alt="Cover"
              contain
              aspect="4 / 3"
              onOpen={() => setPreview(0)}
            />
          </Grid>
          <Grid size={6}>
            <PhotoBox
              label="Delivery person"
              src={m.personPhotoUrl}
              alt="Delivery person"
              aspect="4 / 3"
              onOpen={() => setPreview(m.coverPhotoUrl ? 1 : 0)}
            />
          </Grid>
        </Grid>

        <Stack sx={{ mb: 3 }}>
          <TimelineItem kind="in">
            <b>Received</b> <Mono>{fmtDateTime(m.receivedAt)}</Mono>
            {m.receivedBy ? ` · Logged by ${m.receivedBy.name}` : ""}
          </TimelineItem>
          {hasRecipientUser(m) ? (
            <TimelineItem kind="in">
              <b>{who} notified</b>
              {m.notifiedAt ? (
                <>
                  {" "}
                  <Mono>{fmtTime(m.notifiedAt)}</Mono>
                </>
              ) : null}
              {m.remindedAt ? (
                <>
                  {" · Reminder sent "}
                  <Mono>{fmtTime(m.remindedAt)}</Mono>
                </>
              ) : null}
            </TimelineItem>
          ) : (
            <TimelineItem kind="pending">
              <b>Receiver not on Gatebook</b> · Inform by phone
            </TimelineItem>
          )}
          {m.handedAt ? (
            <TimelineItem
              kind="out"
              last={!hasRecipientUser(m) && !m.resolvedAt}
            >
              <b>Handed over</b> <Mono>{fmtDateTime(m.handedAt)}</Mono>
              {m.collectedBy ? ` · To ${m.collectedBy}` : ""}
              {m.handedBy ? ` · by ${m.handedBy.name}` : ""}
              {m.handedNote ? ` · ${m.handedNote}` : ""}
            </TimelineItem>
          ) : (
            <TimelineItem kind="pending" last>
              <b>Waiting to be collected</b> ·{" "}
              <Mono>
                {fmtMinutes((now - new Date(m.receivedAt).getTime()) / 60000)}
              </Mono>{" "}
              since it arrived
            </TimelineItem>
          )}
          {m.handedAt && hasRecipientUser(m) ? (
            m.status === "handed" ? (
              <TimelineItem kind="pending" last>
                <b>Waiting for {who} to confirm</b>
              </TimelineItem>
            ) : m.status === "confirmed" ? (
              <TimelineItem kind="in" last>
                <b>{who} confirmed collection</b>
                {m.confirmedAt ? (
                  <>
                    {" "}
                    <Mono>{fmtDateTime(m.confirmedAt)}</Mono>
                  </>
                ) : null}
              </TimelineItem>
            ) : m.status === "disputed" || m.status === "resolved" ? (
              <TimelineItem kind="bad" last={!m.resolvedAt}>
                <Box component="b" sx={{ color: "error.main" }}>
                  {who} says they did not get it
                </Box>
                {m.disputeNote ? ` · “${m.disputeNote}”` : ""}
              </TimelineItem>
            ) : null
          ) : null}
          {m.resolvedAt ? (
            <TimelineItem kind="out" last>
              <b>Resolved</b> <Mono>{fmtDateTime(m.resolvedAt)}</Mono>
              {m.resolveNote ? ` · ${m.resolveNote}` : ""}
              {m.resolvedBy ? ` · by ${m.resolvedBy.name}` : ""}
            </TimelineItem>
          ) : null}
        </Stack>

        <Grid
          container
          spacing={2}
          sx={{
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: "10px",
            p: 2,
            m: 0,
          }}
        >
          {details.map(([label, value]) => (
            <Grid key={label} size={{ xs: 6 }} sx={{ minWidth: 0 }}>
              <FieldLabel>{label}</FieldLabel>
              <Typography
                sx={{
                  fontWeight: 500,
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </Box>

      {showStaffActions || showConfirm ? (
        <Box
          sx={{
            p: { xs: 2, md: 3 },
            pt: 2,
            position: "sticky",
            bottom: 0,
            bgcolor: "background.default",
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          {showStaffActions && m.status === "lodged" ? (
            <Grid container spacing={1}>
              {hasRecipientUser(m) ? (
                <Grid size={{ xs: 6 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<NotificationsActiveOutlinedIcon />}
                    onClick={() => remind(m)}
                  >
                    Remind
                  </Button>
                </Grid>
              ) : null}
              {m.recipient?.phone ? (
                <Grid size={{ xs: 6 }}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<PhoneOutlinedIcon />}
                    href={`tel:${m.recipient.phone}`}
                  >
                    Call receiver
                  </Button>
                </Grid>
              ) : null}
              <Grid size={12}>
                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  color="success"
                  onClick={() => openHandover(m)}
                >
                  Handed over
                </Button>
              </Grid>
            </Grid>
          ) : null}
          {showStaffActions && m.status === "disputed" ? (
            <Button
              fullWidth
              size="large"
              variant="contained"
              color="primary"
              onClick={() => openResolve(m)}
            >
              Resolve
            </Button>
          ) : null}
          {showConfirm ? (
            <Grid container spacing={1}>
              <Grid size={12}>
                <TextField
                  size="small"
                  label="If you did not get it, tell security why"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Grid>
              <Grid size={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  disabled={busy}
                  onClick={() => answer(false)}
                  sx={{ color: "error.main", borderColor: "error.main" }}
                >
                  I did not get it
                </Button>
              </Grid>
              <Grid size={6}>
                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  disabled={busy}
                  onClick={() => answer(true)}
                >
                  Yes, I collected it
                </Button>
              </Grid>
            </Grid>
          ) : null}
        </Box>
      ) : null}
      {preview !== null ? (
        <ImagePreview
          open
          index={preview}
          onClose={() => setPreview(null)}
          images={[
            { src: m.coverPhotoUrl, label: `Cover · ${m.kind}` },
            {
              src: m.personPhotoUrl,
              label: `Delivery person${m.broughtBy ? ` · ${m.broughtBy}` : ""}`,
            },
          ]}
        />
      ) : null}
    </Stack>
  );
}
