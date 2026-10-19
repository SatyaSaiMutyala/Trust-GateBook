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


## Post: front and back cover photos (web + mobile)
Logging post needs **three photos, all required**: **Cover — front** (address label side, 4:3, back camera),
**Cover — back** (4:3, back camera) and **Delivery person** (3:4, front camera). Error when any is missing:
"Take all three photos." with the missing tiles outlined red. Item details (mobile screen / web drawer), the full-screen
photo preview (swipe/arrows through Front · Back · Delivery person) and the Item logged confirmation show the back
cover next to the front. Items logged before this existed have no back photo: show a neutral "No back photo"
placeholder (not tappable) — existing data is never changed.


## Host approval (web + mobile)

The employee being visited is asked to accept the visitor; security lets them in only after that (API.md "Host approval").

- **Check in → "Whom to meet"** is an employee picker over `GET /api/hosts` (same control as the post room's receiver).
  Picked employee → hint "🔔 Gets a notification and accepts or declines in Gatebook"; typed name → "📞 Not on Gatebook —
  call them before letting the visitor in". Returning-visitor "Fill details" re-picks the same employee.
  Toast "Checked in · Ravi Kumar notified" / "Checked in · call Front office to confirm".
- **Pass issued** shows a live note under the ticket: notified (info: "If there is no reply in N minutes, you'll get an alert
  to call them") · accepted (green, "Send Anil in" + **Allowed in**) · declined (red, collect the pass) · not on Gatebook
  (amber, **Call host** + **Confirmed by phone**).
- **Stage chip** on open visits not yet let in: amber "Waiting for host" / "Confirm by phone", green "Accepted · send in",
  red "No reply · call host" / "Host declined". Inside-now cards and the details screen show it next to the status chip,
  with the gate's next step: **Allowed in** (after the host accepted), **Call host** (`tel:`) and **Confirmed by phone**.
- **Visitor alerts** (gate users, above every gate screen, before the post-issue rows): one row per visit from
  `GET /api/visits/inside?attention=true&limit=5` — green "Send Anil in" / red "Ravi declined Anil" (+ Mark exit) /
  red "No reply from Ravi: call them" / amber "Call Ravi to confirm Anil", with View and the actions above; "N more" → Inside now.
  A host's answer or a no-reply alert arriving live gets a toast (web: plus a pulse; mobile: from the stored notification).
- **Details timeline**: In → "Waiting for Ravi · asked 3m ago · no reply, security alerted at 10:47 am" / "Accepted 10:45 am ·
  by Ravi in 3m · “Send to my office”" / "Declined …" / "Confirm with Ravi by phone · not on Gatebook" → "Let in 10:46 am · by
  Suresh" or dashed "Not let in yet" → Out. Visits from before host approval show no host rows.
- **My visitors** (anyone who can receive visitors; employees open on it — web `/my-visitors`, mobile first tab "Visitors";
  gate users who are also hosts: web rail link, mobile "Mine" on the Inside now app bar). Sections from
  `GET /api/visits/mine?scope=…`: **Waiting at the gate** (big amber cards: photo, company · purpose, pass, arrived time,
  amber "waiting 4m", "Security has been asked to call you." after a no-reply alert; message field + quick replies "Send to my
  office", "I'll come to the gate", "Ask them to wait 10 minutes", "Send to the meeting room", "Not available today", "Not
  expecting this visitor", "Please reschedule"; **Decline** / green **Accept, let them in**), **Visiting you now**,
  **Earlier visitors**. Nav badge = waiting count (amber).
- **Overview / Today**: tiles "Waiting at gate" (amber when > 0) and "Average host reply" (label becomes "Host reply · N no
  reply" when some hosts didn't answer). **Visitor log** status filter adds Waiting at gate · Host declined · Host did not
  reply; the web log shows the host's answer under the host's name.
- **Settings** (admin): "Host reply time" minutes (1–60, default 5) next to the overstay alert.
- **Notifications**: 🚪 visitor at the gate (host), ✅ host answered and ⏰ no reply (security); tapping opens the visit.

## Expected visitors & deliveries (web + mobile)

Employees register visitors and deliveries before they come; the gate checks them in from the entry
(API.md "Expected visitors & deliveries"). Everyone may pre-register except viewers and users an admin has unticked
**Can pre-register visitors** (Users; default on).

- **Expected list**: web `/expected` (rail link with today's count for gate users; employees: rail link and phone tab),
  mobile gate stack screen "Expected" (from the Check in strip and the Today tile) and the employee tab **Expected**
  (green badge = still expected today). Gate users: tabs **Today · Upcoming · Earlier** (everything at the gate);
  others: **Upcoming · Earlier** (what they registered, host, receive or are told about). A search covers every tab;
  a notification opens the list searched for the entry's code (`EX-…`).
- **Card**: time ("TODAY 3:00 pm", "to 4:00 pm"), name (deliveries: 📦 "Delivery from Reagent Co" with a green edge), state
  chip — amber Expected / Delivery expected, red Late (window passed today), grey Did not come / Cancelled, green Arrived /
  Received — and green "Pre-approved"; company · purpose · persons, boxes + challan, "To meet Dr Meera" / "Received by Lab
  in-charge · for Dr Meera" / "To be received by …", "registered by …", items / vehicle, the note for security in quotes,
  mobile · code · arrived/received time and guard. Actions: **Check in** (security/admin, visitors), **Received**
  (security/admin, deliveries), **Edit** / **Cancel** (security, admin, whoever registered it, the host; confirm dialog).
- **Expect a visitor / delivery** form (web dialog, mobile full screen; buttons on the list): Visitor | Delivery toggle.
  Visitor: name*, mobile, coming from, persons, purpose chips, **Visiting*** (employee picker, defaults to me when I can
  receive visitors), **Received at the location by** (optional second employee who meets them), **Also meeting** (up to 10,
  told on arrival). Delivery: from*, boxes*, challan type + number, brought by + mobile, **Received by***. Both: expected
  date + time, optional end time, vehicle, items (visitors), note for security, and for visitors **Pre-approved: send them
  in when they arrive** (default from Settings). Only employees from the list (no typed names). Save → "Saved. Security at
  the gate has been notified."
- **Check in**: a strip "📅 N expected today · View" above the form; typing a mobile number that matches someone expected
  today shows "Expected today. Anil Rao at 3:00 pm for Lab in-charge · Fill details". Check in from the list or Fill details
  fills name, mobile, company, persons, purpose (when still in settings), vehicle, items and **Whom to meet** = the contact,
  else the host, and shows a banner "Expected visitor. To meet … · Today, 3:00 pm · pre-approved, no need to wait" with the
  note, boxes, code and **Not this visitor** (unlinks). Submitting sends `expectedId`: the entry turns Arrived and, when
  pre-approved and the picked employee is the host or contact, the visit starts accepted (toast "pre-approved for …, send
  them in"; alert row "Expected visitor, pre-approved for …"; timeline "Accepted · pre-approved when registered by … (EX-…)";
  log "Pre-approved").
- **Overview / Today**: tile "Expected today" (mobile: opens the list).
- **Settings** (admin): **Pre-approved visitors** — whether "Pre-approved" starts ticked. **Users**: "Can pre-register
  visitors" on Employees and Security (chip "No pre-register" when off).
- **Notifications**: 📅 expected visitor / delivery (gate, plus the people concerned when someone else registered it),
  ✅ arrived / received (the people concerned), 🚫 cancelled (gate and the people concerned).

## Platform: modules, hierarchy, escalations, branding, rules (web + mobile)

- **Modules.** Admins tick, per person, the modules they can use (Settings → Accounts & hierarchy → person editor:
  "Modules this person can use" — Area · Module · What they can do · Access, with Tick all / Role defaults / Untick
  all; employees always keep "My visitors"; admins "have every module and Settings"). The users list shows a chip
  "All N modules" / "x of N modules" (tooltip "Not: …"). Unticked modules disappear from the rail / tabs, their pages
  redirect home, and the server refuses them. An admin's change reaches the person's open apps at once.
- **Hierarchy.** Person editor: **Reports to (escalation level 1)** ("Nobody (top of the chain)", then "Name ·
  Designation"; hint "Escalations go: A → B → admin"), **Designation** (suggestions from Settings → General), **Gate
  supervisor**. Settings → Accounts & hierarchy: "How escalation follows the hierarchy" (levels strip; warning for
  guards with no supervisor), **Reporting hierarchy** (indented org tree; tap a person to find them in Users),
  **Escalation chain per person** ("Ravi → Anil → admin").
- **Escalation matrices** (web Settings → Visitors: "Host has not replied", "Visitor overstaying"; → Post room: "Post
  not collected"): a timeline of steps (AT ONCE / +15 min / +4 h / +1 d · target · Alarm chip · label · repeats ·
  "Now: names" or red "Nobody set up: goes to admin") and **Edit matrix** (After · Notify · Repeat every · Message ·
  Alarm · remove; Add step; Save matrix). The no-reply step to guards replaces "Host reply time". Mobile shows the
  matrices read-only ("Edit them in Settings on the web").
- **Escalation log** (web Settings tab): Today / 7 days / 30 days, module filter, Export CSV; columns When · Module ·
  Item · Escalation (Alarm chip, "Repeat n") · Sent to (target, people, amber note).
- **Branding** (web Settings → Company): logo upload (PNG/JPG < 1.5 MB, light + dark preview, Replace / Remove) and
  company details (short name, registered name, address, phone, email, website, GSTIN, CIN). The logo replaces the
  Gatebook mark in the rail / app bar and on the sign-in screen; the short name is the rail sub-line, the sign-in
  sub-line and the pass header ("TrustLab · Main Gate").
- **Rules**: web Settings → Visitors "Check-in rules" (Visitor photo is required · Pass number is required) and →
  Post room "Logging rules" (Cover photos · Delivery person photo); mobile Account has the same switches. Optional
  fields lose their asterisk; a pass without a number shows "No pass card".
- **Escalation notifications** (⏰): a toast with title · body; alarm steps vibrate longer. Tapping opens the visit or
  post item (a manager can open a visitor of someone who reports to them).
- **Settings tabs (web, admins)**: General · Company · Accounts & hierarchy · Visitors · Post room · Escalation log ·
  My account.

## Terms & confidentiality agreement (web + mobile)

- **Settings → Terms & confidentiality** (web, admins): "Visitors must agree to the terms at check-in" (saves at
  once), Company name on the agreement (empty = the registered name), Title, Terms text (plain text; "1. Heading" on its
  own line, a blank line between sections) with a live preview, **Save as version N** ("Current: version N. Agreements
  already signed keep the wording the visitor agreed to."), earlier versions as links, **Open terms page**, **Sample
  agreement PDF**. Settings → Visitors shows "Terms & confidentiality agreement · Version N · visitors must agree at
  check-in / not required" with **Edit terms**. Mobile Account: the "must agree" switch only.
- **Check in** (when required): a box under Remarks — checkbox "Visitor agrees to the **Terms & conditions**,
  including confidentiality *" with the hint "Show or read the terms to the visitor…"; the link (mobile: "Read the
  terms & conditions") opens the terms with **Visitor agrees**. Not ticked → red box and "The visitor must agree to the
  terms before check-in."
- **Pass issued**: "Terms accepted. Confidentiality agreement saved with the visitor's photo" + **Agreement PDF**
  ("(the PDF is being made)" for the first second or two).
- **Visitor details**: card "Terms & confidentiality agreement · Accepted with photo at {time} · terms version N" with
  **Agreement PDF** (gate users) or **Create agreement PDF** when missing.
- **Public page** `/terms` (web, no sign-in; `?v=N` for an earlier version, with a note that it is not current).
- **Visitor log CSV**: "Terms accepted" column.

## Key register (web + mobile)

- **Key register** (web rail "Key register", `/keys`; mobile: Today → "Key register", Account → Site safety; gate
  users with the `keys` module). Tabs **Key board** and **Key diary**.
- **Key board**: counts (keys · out now · overdue), gate filter (several gates), search; a tile per key: number tag
  (green "In" / "2 of 3 in", amber "Out"), what it opens 🔒 (restricted), location · gate, **Issue** while a copy is
  free; under it each copy out: who (phone), out since, due / "was due" (red when overdue), purpose, status chip,
  **Return**.
- **Issue sheet**: restricted banner ("Restricted key. Only: IT team."), taken by (pick an employee — they get a
  reminder — or type anyone's name), phone, purpose, **Return by** chips "1 hour", "2 hours", "6 pm today" (while
  ahead), "Tomorrow 10 am", "No return time", plus a date-time field (default now + `keyReturnHours`).
- **Return sheet**: returned by (defaults to the taker), note → "Key SRV-1 is back".
- **Key diary**: period Today · Last 7 days (default) · 30 · 90 days, status All · Out now · Overdue · Returned,
  search; rows: key no., what · who, issued (by), due, back (received by), purpose, note, status (Out · Overdue ·
  Returned · Returned late), Return. **Export CSV** (`key-diary.csv`).
- **Settings → Keys** (web, admin): list with Add / Edit (number, what it opens, location, gate, copies, restricted +
  who may take it, in use); default return time; the "Key not returned" escalation matrix.
- **Overview / Today**: "Keys out" tile (with "N overdue").

## Incidents (web + mobile)

- **Incidents** (web rail "Incidents", `/incidents`; mobile: Today → "Incidents", Account → Site safety). Tabs
  **Open (n)** · Closed · All, severity filter, search; **+ Report incident** for everyone except viewers; gate users
  also **Export CSV** (`incident-log.csv`). Employees see what they reported and what was given to them.
- **Report**: type chips (Settings list), how serious (Low · Medium · High · Critical, hint "High and Critical also
  alert security on duty, not just admin."), gate, where, when (default now), what happened, people involved, action
  taken, up to 3 photos → opens the incident.
- **Incident details**: type, severity + status, description, happened / reported / where / people / action / given to /
  resolution, photos, **Updates** timeline (who · when · status / given to · text). Update form: text, status (security
  and the assignee), **Give to** (security / admin). **Close incident** → "How was it resolved?" (security, admin,
  assignee). **Reopen** (admin).
- **Notifications**: given to you, updates, closed, escalations; tapping opens the incident (`?open=IN-…` on web).
- **Settings → Incidents** (web, admin): incident types; the four escalation matrices (critical · high · medium · low).
- **Overview / Today**: "Open incidents" tile.

## TRACK (web + mobile)

- **TRACK** (web rail "TRACK" with the count — amber when urgent — opening page on desktop for gate users; phone web and
  the mobile app: the first tab, with the count). Eyebrow "{gate} · live", "N items need action" / "All clear". Chips
  per category (All · Visitors at the gate · Material · Keys · Patrols · Incidents · Generator · Post room), sections in
  that order. Cards coloured by tone (green send in, red problems, amber calls / due, solid red pulsing for a late round).
- **Buttons**: Allowed in · Mark exit · Call host · Confirmed by phone · Confirmed, allow in · Exit (visitors); View /
  Resolve (post); View (material, incidents); Call · Key board (keys); Silence 5 min · Scan now / Scan (patrols); Log
  fill · Check now (generator).
- Below: "Material in progress · N" and "Expected in the next 2 hours".
- **Alarm**: while a round is late, the web app plays three tones and vibrates every 12 s for security and supervisors
  (page visible), until scanned or "Silence 5 min". "In-app sound on / off" in My account. Phones ring from the push.
- Refreshes on every live change and every 30 s. Empty: "All clear · Nothing needs action right now. …"

## Gates (web + mobile)

- **This gate** picker for gate users when there are several gates (web: bottom of the rail, phone top bar; app:
  Account → This gate). Starts on the person's own gate (Settings → Accounts: "Gate", or All gates). Switching reloads
  the screens for that gate: TRACK, Overview, Inside now, Post room, Material, Keys, Incidents, Patrols, Generator; new
  check-ins, post and material are recorded at that gate; set-up forms (keys, checkpoints, rounds, generators) start on
  it. Escalations to guards / supervisors go to that gate's people (and those at all gates).

## Alerts on this device (web push)

- Banner under the top bar until alerts are on: "Turn on alerts on this device · Get a notification when …, even when
  Gatebook is closed." [Turn on alerts] [Later] (hidden for a day). iPhone in Safari: "Install Gatebook to get alerts…
  Tap Share, Add to Home Screen, open it from there". Unsupported browsers: "This browser can't show Gatebook alerts".
- **My account → Alerts on this device**: On / Off, Send test alert, Turn off on this device, "Alerts go to N devices: …",
  In-app sound. Tapping an alert opens the page (incident, expected, patrols, generator, keys, material, else
  Notifications).

## Patrols (web + mobile)

- **Patrols** (web rail "Patrols", `/patrol`; mobile: Today → "Patrols", Account → Site safety; gate users with the
  `patrol` module). **Scan checkpoint** (security, admin). Tabs **Rounds** · **Late & missed log** · **Scan log**.
- **Rounds**: "Due now", "Coming up" (next 3), "Last 12 hours" with "N rounds · x on time · y started late · z partly
  missed · w missed". Each slot: start time, round, "on time till HH:MM · ends HH:MM", one dot per checkpoint (green
  scanned, amber issue, red missed), escalations sent, a chip ("Starts in …", "Late · 1/4 · 20m left", "Complete on
  time", "Complete · started 15 min late", "Missed 2 of 4", "Missed"), **Scan** while open.
- **Scan** (web): camera QR reader where the browser supports it, or **type the 6-letter code**. Mobile: type the code
  (camera scanning needs a native library — not yet). Then: which round it counts for ("Counts for Night round 23:00 ·
  1 of 6 done so far" or "extra scan"), condition **All OK / Issue found**, note (required for an issue), photo
  (required where set) → "{checkpoint} scanned", progress, **Report as incident** (issue scans: opens the incident form
  with where and what happened filled in, `source: patrol`), **Scan next**. Opening a printed QR's link in the browser
  (`/?cp=CODE`) goes straight to the scan.
- **Late & missed log**: Today · 7 · 30 · 90 days, "Late & missed only" / "All rounds", stat cards (on time %, started
  late with average minutes, partly missed, missed completely), table (date, round, start time, started +min, finished,
  scanned + missed checkpoints, status, escalations, guards), **Export CSV**.
- **Scan log**: last 3 days, photo, checkpoint, Issue / Code typed chips, guard, round or "Extra scan (no round due)",
  note, time.
- **Settings → Patrols** (web, admin): 1. Locations (checkpoints) with **Print QR codes** (A4 sheet, 2 per row, name,
  floor, code) and Add / Edit (name, floor / location, photo required, active, QR preview, **Issue new code** — two
  taps; the old printed QR stops working); 2. Rounds and times (name, start times or "every N min from … to …",
  on time if started within, time allowed, locations, active); 3. the "Round late or missed" matrix (steps can be
  **When time runs out**); 4. who receives (Level 1 = the guard's supervisor).
- **Overview / Today**: "Patrol rounds complete today" (complete / ended · N missed · N due now).

## Generator & diesel (web + mobile)

- **Generator & diesel** (web rail "Generator", `/generator`; mobile: Today → "Generator", Account → Site safety; gate
  users with the `gen` module). Tabs **Status** · **Run log** · **Diesel log** (mobile: Status · Run log).
- **Status** per generator: kVA · tank · rated L/h, **Running 1h 05m** / Off (who started it, reason, hour meter);
  **Diesel in tank** "About 120 L of 250 L · 48%" with a gauge and the low mark, "Low: arrange refill", how the estimate
  is worked out; **Diesel level check** (next due / overdue since, last reading with its gauge photo); run this month
  (hours, starts); diesel filled this month. Buttons **Start generator** / **Stop generator**, **Log diesel fill**,
  **Weekly level check**.
- **Sheets**: start (reason Power cut · Weekly test run · Maintenance · Other, hour meter); stop (hour meter, note);
  level check (gauge photo required, level in litres with "% of the tank", hour meter, note); fill (bill photo, filled
  at, litres, level after filling, hour meter, supplier, bill no., amount, note).
- **Run log**: hours in the last 30 days, table, **Export CSV**. **Diesel log** per generator: consumption between
  level readings (L/h, "above rated", "Diesel dropped without running"), entries with photos, **Export CSV**.
- **Settings → Generator** (web, admin): generators (name, kVA, tank, rated use, low alert %, active), "Check the tank
  level every N days, due at H o'clock", the "Diesel level check overdue" and "Low diesel" matrices.
- **Overview / Today**: "Generator" tile (On / Off, diesel alerts).

## Material gate passes (web + mobile)

- **Security — Material gate passes** (web rail "Material passes", `/material`; mobile: Today → "Material gate
  passes", visitor details, pass screen): big **Material IN** (green) / **Material OUT** (amber) buttons; tabs with counts
  — "Boxes in / out today" (IN boxes logged / OUT boxes released), "Waiting for employee to accept", "To count, hand
  over or release", "Returnable not closed", "Overdue returns", "All passes" (7 / 30 / 120 days); IN & OUT filter;
  search; Export CSV. Cards: box count block (green IN / amber OUT), carrier photo + name · company · visitor pass,
  challan · for / from employee, pass no. · time · pickup / returnable, status chip, due date, actions.
- **Employees — Gate passes** (web rail + phone tab, mobile tab "Gate passes"): **+ Send material out**; To accept ·
  Sent out · Received · All.
- **New pass** form: In or out (security) → who takes / brought the boxes (a visitor inside now · not a visitor: name,
  company, mobile, vehicle, photo · leave with security for pickup: who will collect) → employee (security: receiving /
  sending; "gets an Approve / Reject request" hint) → boxes (stepper), challan chips, challan no., e-way bill, challan
  photos (≤ 4) → More: returnable + expected back by (quick 1 day … 1 month, default `mpReturnDays`), purpose chips,
  item lines (item, qty, unit, serial), box photos (≤ 6), remarks. Button text follows what happens next ("Save & ask
  employee to accept", "Save & ask for approval", "Save · count at exit", "Save · counted, release now", "Save and
  hand to security").
- **Pass details**: next step banner with the actions (Received / Not received; Approve / Reject; Count & release;
  Hand over; Boxes handed in; Mark received / Received on paper; Remind; Record boxes back / going out), timeline, the
  carrier and employee, challan photos, item lines, box photos, details, **Cancel pass**, **Gate pass PDF**.
- **Action sheets**: approve / reject with a note; received / not received / on paper (note required); boxes handed in
  (count); count & release / hand over (count must match, vehicle; pickup: visitor or name + mobile + photo);
  returns per line with remarks and a photo.
- **Visitors**: details show a "Material" section (passes + Material IN / OUT buttons; the visited employee:
  "Material OUT with this visitor"); the pass screen has the same buttons; **exit** asks for the count of each OUT pass
  going with the visitor (released after the exit), warns about passes not approved and returnable material brought in.
- **Expected deliveries**: security's **Received** opens Material IN filled from the entry; the entry gets "Gate pass".
- **Settings → Material passes** (web; mobile Account): purposes IN / OUT, challans IN / OUT, units, rules (OUT needs an
  authorising employee · security-made OUT passes need approval in the app · challan photo required · carrier photo
  required), default return period, escalation matrices (IN not accepted · waiting for approval · returnable overdue).
- **Gate pass PDF**: coloured header (green IN / amber OUT) with logo, company, MATERIAL IN / OUT, returnable · pass no.
  · gate · time; box count; challan, purpose, e-way bill, back by, remarks; item lines; carrier with photo; employee and
  their confirmation; security record (handed in, counted, released, returns); company address / GSTIN / CIN; challan
  photos.
