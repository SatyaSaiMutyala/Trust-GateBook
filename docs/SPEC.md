# Gatebook product & UI spec

> **Single gate.** This deployment has exactly one gate ("Main Gate"). The apps show **no gate selector, no "All gates"
> option, no gate filter/column and no Gates settings list**; everything below that mentions choosing a gate is superseded.
> The backend still stores `site` on every record (defaulted server-side) so more gates could be added later.

Gatebook is a visitor register for a gate-house: security checks visitors in (photo, details, physical pass card),
sees who is inside, records exits, and admins review the log and today's numbers. This spec is distilled from the
original single-file prototype (`gatebook.html`) and is what `web/` and `mobile/` implement. API: see `API.md`.

## Design language

Hi-vis gate-house: a dark "rail" (sidebar on desktop, top bar on phone), a working canvas, and amber marking the single
primary action on each screen.

Fonts (Google Fonts): **Barlow Condensed** 600/700 for display (headings, big numbers, uppercase),
**Barlow** 400/500/600 for body, **JetBrains Mono** 500 for pass numbers, times, phone numbers, durations.

| token        | light     | dark      | use |
|--------------|-----------|-----------|-----|
| bg           | `#ECEFED` | `#0D1412` | page background |
| surface      | `#FFFFFF` | `#16201D` | cards, panels |
| sunk         | `#F5F7F6` | `#111A17` | table header, empty thumbs, tracks |
| ink          | `#15201C` | `#E6ECE9` | text; "Mark exit" button background |
| muted        | `#5B6964` | `#93A29C` | secondary text |
| line         | `#D3DAD6` | `#26332F` | borders |
| accent       | `#E9A316` | `#F2B233` | primary button, pass-number badge, bars |
| accent-ink   | `#1C1503` | `#1C1503` | text on accent |
| accent-soft  | `#FBEFD2` | `#3A2E12` | highlighted stat, "returning visitor" box |
| rail         | `#13201B` | `#0A100E` | sidebar / top bar / ticket header |
| rail-ink     | `#DDE5E1` | `#DDE5E1` | text on rail |
| rail-muted   | `#7E918A` | `#71847D` | |
| ok / ok-soft | `#1D8752` / `#DDF1E6` | `#45B97C` / `#173326` | "Inside" chip |
| warn / warn-soft | `#B9620F` / `#FBE8D6` | `#E39245` / `#3A2614` | overstay, banners |
| bad / bad-soft | `#BE3535` / `#F8DEDE` | `#E36565` / `#3B1C1C` | errors, "pass not returned" |

Radius 10 px for panels, 8 px for buttons/inputs, 20 px for chips. Headings are uppercase Barlow Condensed 700.
Inputs are at least 44 px tall. Follow the system light/dark preference.

Reusable pieces:
- **Pass badge**: amber pill, mono text, e.g. `Pass 12`.
- **Status chip**: green "Inside" (with dot), amber "Overstay" (with dot), grey "Exited".
- **Visitor card**: 64 px photo (or initials on a sunk square), name with pass badge (+N if persons > 1),
  "purpose · meeting host (dept)", "In 10:42 am" (+ gate when viewing all gates); right side: duration chip and a dark
  "Mark exit" button. Overstay cards get an amber border and a 4 px amber left inset.

## Navigation

Five destinations: **Check in** (primary, amber), **Inside now** (shows count), **Visitor log**, **Overview**
(labelled "Today" on phone), **Settings** (Admin group).

- Desktop / web ≥ 861 px: 232 px dark rail on the left with brand ("GATEBOOK", sub "Visitor register"), the amber
  "Check in" button on top, "Register" group (Inside now with count, Visitor log, Overview), "Admin" group (Settings),
  and at the bottom a "This gate" selector and "Signed in as …".
- Phone (web < 861 px, and the native app): dark top bar with brand + gate selector; bottom tab bar ordered
  Inside now · Log · **Check in** (raised amber bubble in the middle) · Today · Settings; Inside tab shows a green count
  badge.
- The selected gate ("This gate") is remembered per device. Options are every gate in settings plus "All gates".
  Web defaults to Overview on desktop and Check in on phone; the native app opens on Check in.

## Screens

### Login
Email + password, brand header. Shows the API error message on failure. Token is remembered on the device.

### Check in
Header eyebrow "New entry · <gate>" (if "All gates" is selected, show red "Choose your gate at the top first"), title
"Check in a visitor", live clock on the right.

Left column (top on phone, side-by-side): **Visitor photo** (3:4 dashed tile "Take visitor photo / Face, shoulders up",
front camera, required) and **ID proof** (16:10 tile, back camera, optional). Tapping a filled tile retakes.

Form (2 columns on desktop, 1 on phone):
- Mobile number* (digits/+ only, max 14), Visitor name*
- Returning-visitor box (full width) — once the phone has 10 digits, look it up:
  - open visit exists → amber-warn box "**Already inside.** Ravi checked in at 10:42 am (Main Gate). Close that entry before checking in again." + "View entry" button.
  - previous visits → accent-soft box "**Returning visitor.** Ravi · Acme Labs · 3 earlier visits, last on 02 Oct 2026" + "Fill details" button that fills name, company, host, dept, vehicle, ID type, ID last 4 and toasts "Details filled from last visit. Take a fresh photo."
- Coming from, No. of persons (1–50)
- Purpose* — chip buttons from settings (single select)
- Whom to meet*, Department (select from settings)
- ID shown (select: Aadhaar, Driving licence, PAN, Voter ID, Company ID, Passport, Other, None), ID last 4 digits (digits only)
- Vehicle number (uppercase), Items carried in
- Pass number* (full width, mono, large, uppercase A–Z 0–9 -, max 12). While typing, check the badge; if held, show
  "Pass 12 is with Ravi Kumar (inside since 10:42 am)."
- Remarks (multiline)
- Actions: "Clear" and amber "Check in & issue pass".

Validation highlights each missing field in red and shows "Fill the highlighted fields." Server errors are shown
verbatim under the form. Changing the gate must not wipe the half-filled form. Live updates never re-render the form.

On success → **Pass issued** screen: eyebrow "Entry recorded", title "Visitor pass issued", a ticket card (dark header
"VISITOR" + gate; photo 110×140; Name, Meeting (host · dept), Purpose (· N persons), In date-time; dashed divider; "Pass
number" with the badge number at 40 px mono and "Entry GB-…" below), the line "Hand pass 12 to the visitor. Collect it
back at exit.", buttons "See who's inside" and amber "Check in next visitor". Toast "Checked in · GB-…".

### Inside now
Eyebrow = gate or "All gates", title "Inside now", search box (name, phone, pass…). List of visitor cards, oldest first.
Durations tick every 30 s. Empty: "NOBODY INSIDE — Visitors appear here as soon as they are checked in, and leave this list
when their exit is recorded." + "Check in a visitor" button; with a search: "NO MATCH — Try a different name, number or pass."
Tapping a card opens Visitor details; "Mark exit" opens the Exit sheet.

### Visitor log
Title "Visitor log", "Export CSV" button. Toolbar: range segmented control (Today, Yesterday, 7 days, 30 days, Dates — the
last reveals from/to date pickers), status select (All statuses, Inside, Exited, Overstay), gate select (All gates + each),
search. Summary line "24 entries · 31 persons · 3 still inside". Desktop: table with columns photo, Pass no. (badge; red
"Not returned" under it when exited without pass), Visitor (name, mono phone · entry id), Coming from, Purpose (+ N persons),
Meeting (host + dept), Gate, In (time + date), Out, Duration, Status. Phone: visitor cards with date · in → out, status,
duration. Rows open Visitor details. Empty: "NO ENTRIES" with a hint to widen the range.
Native app: CSV export uses the share sheet.

### Overview ("Today at the gate")
Eyebrow "<gate> · Monday, 12 October", amber "Check in a visitor" button. Stat tiles: Inside now (accent-soft), Entries
today, Persons today, Average stay, "Over 4 h inside" (amber when > 0). Panels: **Arrivals by hour** (bars 6 am–10 pm,
labels every 3 h), **Why they came** (horizontal bars by purpose, ink), **Needs attention** (overstay visitor cards with
Mark exit, or "No one has been inside longer than 4 hours…"), **Departments visited** (horizontal bars, amber, top 6).
Web grid: 5 stat tiles across on xl, 3 on md, 2 on xs; the two panel rows are 7/5 columns on lg+, stacked below.

### Visitor details (drawer on web, full screen on phone)
Pass badge + "Entry GB-…", name as heading, status chip, close button. Photo and ID photo side by side ("No ID photo" if
none). Timeline: green dot "In <date, time> · <gate> · logged by <guard>"; then either dark dot "Out <date, time> · Stayed
1h 05m · logged by <guard> · pass returned / **pass not returned** · <exit note>" or dashed dot "Still inside 45m".
Details grid: Mobile, Coming from, Purpose, Persons, Whom to meet, Department, ID shown (type ·· last4), Vehicle, Items
carried, Remarks. Action: big dark "Mark exit" when inside; "Correct exit time" for admins when exited.

### Exit sheet (bottom sheet on phone, centred dialog on desktop)
Visitor thumb, "Record exit", name, badge + "In 10:42 am". Exit time (date-time, default now), quick chips Now / 5 min ago
/ 15 min ago / 30 min ago. If the visit has a badge: checkbox "Pass **12** collected back" (checked by default). Exit
remarks. "Cancel" and amber "Confirm exit". Errors inline (before check-in, in the future, no permission). Toast
"Ravi Kumar checked out · 1h 05m" (+ " · pass not returned").

### Settings
Admins edit; others see read-only lists and the banner "Only admins can change these lists. Security staff see them in the
check-in form." Panels: **Gates** ("Each security point. Guards pick theirs once on their phone; it is remembered on that
device."), **Departments**, **Purposes** — each a list of removable tags plus an add field; removing the last one is refused
("Keep at least one."). **Overstay alert** hours (1–24) + Save. **Users** (admin only): list with role, add user (name,
email, password, role), change role, deactivate. **Signed in**: name · role, and a Sign out button.

## Formatting
Locale `en-IN`. Time `10:42 am`, date `12 Oct 2026`, date-time `12 Oct 2026, 10:42 am`. Duration `45m`, `1h 05m`.
Initials = first letters of the first two words.

## Lists & pagination
Every list in both apps (Inside now, Visitor log, Overview "Needs attention", Users, returning-visitor history) is
paginated through query params as described in `API.md` → "Pagination & query params". Web: list state lives in the URL;
log table uses MUI `TablePagination`; phone-width card lists use "Load more". Mobile: `FlatList` infinite scroll with
pull-to-refresh. Counts come from `pagination.total`. Overview's "Needs attention" shows the first 5 overstaying visitors
(`/api/visits/inside?overstay=true&limit=5`) with a "View all" link to Inside now filtered to overstay.

## Mobile responsive sizing
The native app sizes everything with `react-native-size-matters`: `scale` for horizontal sizes, `verticalScale` for
heights and vertical spacing, `moderateScale` for fonts, radii, icons and touch targets (min `moderateScale(44)`).
Spacing, radius and font tokens in `mobile/src/theme/` are pre-scaled; hairline borders stay 1 px.

## Post room module

Taken from the user's second prototype (`gatebook-demo.html`). Everything below is paginated per "Lists & pagination".

### Who sees what
- **Security / admin / viewer** ("gate" users): nav gains **Post room** (icon: envelope) right after Inside now, with a count
  of `lodged` items; the count pill turns amber when there are `disputed` items. Viewers see lists but no action buttons.
- **Employee** (role `host`): nav is only **My post** (count = lodged + handed for them, amber) and **My account**.
  Default screen is My post. No visitor screens, no gate selector.
- Phone tab bar for gate users becomes: Inside now · Post · **Check in** (raised) · Log · Account. Overview stays reachable
  from the desktop rail and from a "Today" button in the Inside now header. Employee tab bar: My post · Account.

### Issue alerts (gate users)
Above the page content on every gate screen: one red alert row per `disputed` item at this gate (cover thumb, "**Priya Nair
says they did not get it**", "Courier from Transasia, handed to Ravi at 3:10 pm · “I was not in office today”", buttons
View / Resolve). Load with `GET /api/mail?status=disputed&site=…&limit=5` (+ "N more" link to the Issues tab). New
disputes arriving over the socket get a toast and a brief amber pulse.

### Post room screen (gate)
Eyebrow = gate, title "Post room", buttons "Export CSV" and amber "Log new item". Toolbar: segmented tabs
**To collect (n)** (`status=lodged`, oldest first) · **Awaiting confirmation (n)** (`status=handed`) · **Issues (n)**
(`status=disputed`) · **All items** (period select: Today / Last 7 days / Last 30 days / Last 60 days → `from`); counts from
`counts`. Search (name, sender, ref no…). Tab, period and search live in the URL on web.

Mail card: 72 px cover photo, kind tag (small uppercase, ink background, surface text), "For **Ravi Kumar** (Accounts)",
"From Income Tax Department · via India Post · 2 pieces", mono refNo · "Received 10:42 am" (date too when not today) ·
amber "25m ago" while lodged · "given to X" after handover. Right side: status chip and actions — lodged: "Remind" (only with
a recipient user, bell icon) + green "Handed over"; disputed: "Resolve". Disputed cards: red border + 4 px red inset.
Status chips: To collect (amber-soft) · Handed · awaiting confirmation (amber-soft) · Collected · confirmed (green) ·
Handed over (grey) · Receiver disputes (red) · Resolved (grey).
Empty states: To collect "NOTHING WAITING — Every item logged here stays in this list until it is handed over." (+ Log new
item); Awaiting "NOTHING PENDING — Items handed over stay here until the receiver confirms on their phone."; Issues "NO ISSUES —
If a receiver says they did not get an item, it shows here."; All "NO ITEMS — Nothing logged in this period."

### Log incoming post (gate)
Eyebrow "Post room · <gate>", title "Log incoming post", "Back to post room". Same two-column layout as Check in:
- Photo tiles: **Photo of the cover** (4:3, back camera, "Show the address label and tracking number", required) and
  **Photo of delivery person** (3:4, front camera, required).
- Type* — chips from `settings.mailKinds`.
- From (sender)*, Tracking / reference no. (mono, uppercase), Brought by (post / courier company — suggestions: India Post,
  Blue Dart, DTDC, Delhivery, Professional Couriers, DHL, FedEx, Ecom Express, Hand delivery), Delivery person's name*,
  Delivery person's mobile (digits/+), No. of pieces (1–99).
- For (receiver)* — type-ahead over `GET /api/hosts?q=…&limit=8` showing initials avatar, name, "dept · location". Picking one
  sets `recipientId` and fills Department. Hint under the field: green bell "Gets a notification and must confirm
  collection" when picked; amber phone "Not on Gatebook. Inform them by phone." when free text.
- Department (select), Remarks (multiline).
- Actions "Clear" and amber "Log & notify receiver". Errors: "Fill the highlighted fields and take both photos."
- Success → **Item logged**: cover photo, kind tag + "for Ravi Kumar", "From … · via … · brought by …", mono id · refNo, and an
  accent-soft note "**Ravi Kumar has been notified** to collect it at Main Gate." (or warn-soft "**X isn't on Gatebook.** Call
  them to collect it."), buttons "Post room" and amber "Log next item". Toast "Logged · Ravi Kumar notified".
- The half-filled form survives gate changes and live updates, like Check in.

### Handover sheet
Cover thumb, "Hand over", "Courier for Ravi Kumar", "From … · refNo". "Collected by" (prefilled with receiver name), chips
"<Receiver> in person" / "Someone on their behalf" (clears and focuses the field), Remarks ("e.g. Signed in register, ID
seen"), hint "Ravi Kumar will be asked to confirm on their phone that they received it." (or "…is not on Gatebook, so there
is no confirmation step."). Buttons Cancel / green "Confirm handover". Toast "Handed over · Ravi Kumar asked to confirm".

### Resolve sheet
"Resolve issue", item line, "Handed to X at 3:10 pm · “dispute note”", textarea "What was found or done" (required),
Cancel / amber "Mark resolved".

### Post item details (drawer on web, full screen on phone)
Kind tag + mono id, "For Ravi Kumar", status chip, close. Cover (contain) and delivery-person photos side by side.
Timeline: Received at <gate> <time> · Logged by X → Ravi notified (· Reminder sent <time>) or dashed "Receiver not on
Gatebook · Inform by phone" → Handed over <time> · To X · by Y · note (or dashed "Waiting to be collected · 25m since it
arrived") → dashed "Waiting for Ravi to confirm" / "Ravi confirmed collection <time>" / red "Ravi says they did not get it ·
note" → "Resolved <time> · note · by Y". Details grid: From (sender), Brought by, Delivery person, Their mobile (mono),
Tracking / ref no. (mono), Pieces, For (+ phone for gate users), Department, Remarks. Actions: gate + lodged → Remind,
"Call receiver" (tel: link when phone known), green "Handed over"; gate + disputed → Resolve; the recipient + handed →
"I did not get it" (red outline) / green "Yes, I collected it".

### My post (employee)
Eyebrow "Post room · <name>", title "My post". Sections, each its own paginated query with `recipient=me`:
1. **Please confirm you received these** (`status=handed`) — large cards with green border: cover (tap → details),
   "Courier from Transasia" in display type, "Via Blue Dart · refNo · 2 pieces · arrived 10:42 am", "Security handed it to
   **Ravi** at 3:10 pm", optional field "If you did not get it, tell security why", buttons "I did not get it" / green
   "Yes, I collected it". Toasts "Thank you. Collection confirmed." / "Security has been told and will contact you."
   Typed notes survive live refreshes.
2. **Waiting for you at the gate** (`status=lodged`, badge count) — mail cards showing "Collect at <gate>"; empty "NOTHING
   WAITING — You'll see post here as soon as security logs it for you."
3. **Earlier** (`status=confirmed,closed,disputed,resolved`) with Load more.
`mail:reminder` and new `mail:created` for me → toast ("Courier for you from Transasia") + vibration on mobile.

### My account / Settings additions
- Everyone: **My details** (Mobile number; for recipients also Department and "Where visitors should go") saved via
  `PATCH /api/auth/me`; "Security sees your phone number when they need to call you."
- Admin: new tag list **Types of post** ("The quick-pick buttons when security logs incoming post.").
- Users admin: role select gains "Employee" (`host`); fields Mobile, Department, Location, and checkbox "Can also receive
  post" (`isHost`, hidden when role is Employee). Role chip "Employee".

### Mobile
Post room screens are native equivalents (FlatList + infinite scroll, bottom sheets for handover/resolve, camera via
react-native-image-picker, sizes via react-native-size-matters). "Call receiver" uses `Linking.openURL('tel:…')`.

## Mobile stack
The native app is a **bare React Native CLI** project (no Expo) in plain JavaScript, with committed `ios/` and `android/`
folders. State management is **Redux Toolkit**: a single store with slices for app state (auth, settings, gate, UI/toasts,
form drafts) and **RTK Query** for every API call, using infinite queries for paginated lists. Sizing uses
`react-native-size-matters`.


## Notifications screen (web + mobile)
- **Bell:** a 🔔 bell sits in the app bar on every screen (mobile: right side of the top bar, before the screen's
  own actions; web: top-right of the page header area / phone top bar). It shows an amber badge with the unread
  count (99+ cap), updated live via `notification:new` / `notification:read` and on app focus.
- **Notifications screen** (mobile: stack screen titled "Notifications" with ‹ back; web: route `/notifications`
  and a rail/nav link): newest first, paginated (mobile FlatList infinite scroll + pull-to-refresh; web "Load
  more"). Tabs/pills **All · Unread (n)**. Each row: icon by event (📬 logged, ⏰ reminder, ✅ confirm, ⚠️ dispute),
  bold title + body, relative time ("5m ago", "Yesterday 3:10 pm"); unread rows have an accent-soft background
  and a small amber dot. Tapping marks it read and opens the post item (mobile MailDetails; web the post item
  drawer). "Mark all read" action in the app bar / page header when there are unread items.
- **Empty states:** "No notifications yet — you'll see post and alerts for you here." / Unread tab: "You're all
  caught up."
- Opening a push notification marks its stored notification read.


## Sign-up and account deletion (behind server switches) — MOBILE APP ONLY

> **Mobile only.** The web app has no sign-up page, no Delete account and no pending-requests UI (user decision,
> 2026-10-15). Web only renders `signup_request` notifications (🙋) and marks them read on click.
Shown only when `GET /api/config` says so (see API.md "Feature switches"); both apps load it at start and on return
to the foreground / window focus, and hide the options when off.
- **Login screen:** under Sign in, a text link "New here? **Create an account**" → **Create account** screen/page:
  Full name*, Email*, Mobile number*, Department (select from settings, optional — settings need auth, so use the
  public list fallback: just a free-text field is fine), Password* (8+, show/hide), Confirm password*. Primary button
  "Create account". On success: themed success dialog ("Account requested" / server message / OK) → back to Login.
  Server errors shown inline (email taken, rate limit, validation).
- **Pending sign-in:** the login error shows the server message ("Your account is waiting for admin approval.").
- **Admin — Users:** a **Pending requests (n)** section/tab at the top: name, email, phone, dept, requested time,
  buttons **Approve** (role select, default Employee) and **Reject** (confirm dialog). Approved users move to the
  normal list. Admins get a 🙋 notification per request; tapping it opens Users → Pending.
- **Delete account** (Account / My account for every role, incl. the non-admin profile view): a danger outlined
  button at the bottom, above Sign out → themed ConfirmDialog (tone danger): title "Delete your account?", text
  "This permanently removes your name, contact details and login from Gatebook. Gate-register records stay for the
  audit trail. This can't be undone.", a password field, buttons Cancel / **Delete account** → success message
  "Your account has been deleted." → signed out (mobile also unregisters push first).
