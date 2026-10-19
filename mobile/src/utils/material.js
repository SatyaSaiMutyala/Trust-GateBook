/**
 * Material gate passes (docs/API.md "Material gate passes"): status words, groups and who may do what.
 */
import { fmtShortDate } from './format';

export const MP_OPEN = ['pending_return', 'partly_returned'];
export const MP_GATE = [
  'awaiting_approval',
  'ready',
  'awaiting_drop',
  'ready_for_pickup',
];
export const MP_CANCELLABLE = [
  'awaiting_approval',
  'ready',
  'awaiting_drop',
  'ready_for_pickup',
  'awaiting_receipt',
];

/** "3 boxes". @param {number} n */
export const boxesText = n => `${n} box${n === 1 ? '' : 'es'}`;

/** Who carries the boxes, in a few words. */
export const carrierName = p =>
  p.carrier?.name || p.pickerName || p.carrier?.company || 'Unnamed';

/**
 * Status chip: `{ label, tone }`, tone 'wait' (amber) · 'go' (green) · 'bad' (red) · 'in' (green, done) · 'out' (grey).
 */
export function mpState(p) {
  const name = p.authorisedBy?.name;
  switch (p.status) {
    case 'awaiting_receipt':
      return {
        label: `Waiting for ${name || 'employee'} to accept`,
        tone: 'wait',
      };
    case 'disputed':
      return { label: 'Employee says not received', tone: 'bad' };
    case 'received':
      return {
        label: `Received by ${p.receivedBy?.name || name || 'security'}`,
        tone: 'in',
      };
    case 'awaiting_approval':
      return { label: 'Awaiting approval', tone: 'wait' };
    case 'ready':
      return {
        label:
          p.mode === 'visitor'
            ? 'Count boxes when visitor leaves'
            : 'Count boxes and release',
        tone: 'go',
      };
    case 'awaiting_drop':
      return { label: 'Boxes not yet at the gate', tone: 'wait' };
    case 'ready_for_pickup':
      return { label: 'At the gate for pickup', tone: 'go' };
    case 'rejected':
      return { label: 'Rejected', tone: 'bad' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'out' };
    case 'pending_return':
      return p.overdue
        ? { label: 'Overdue', tone: 'bad' }
        : {
            label:
              p.direction === 'out'
                ? 'Out · to come back'
                : 'In · to go back out',
            tone: 'wait',
          };
    case 'partly_returned':
      return {
        label: p.overdue ? 'Part returned · overdue' : 'Part returned',
        tone: p.overdue ? 'bad' : 'wait',
      };
    case 'returned':
      return {
        label: p.direction === 'out' ? 'Came back' : 'Taken back out',
        tone: 'in',
      };
    default:
      return {
        label: p.direction === 'in' ? 'Received' : 'Left the premises',
        tone: 'out',
      };
  }
}

/** Chip variants of the theme per tone. */
export const TONE_VARIANT = {
  wait: 'pending',
  go: 'inside',
  bad: 'issue',
  in: 'inside',
  out: 'exited',
};

/** "Still out: 1 box, 1 Set Service tool kit". */
export function outstandingText(p) {
  return p.items
    .filter(it => it.outstanding > 0)
    .map(it =>
      it.unit === 'Box'
        ? boxesText(it.outstanding)
        : `${it.outstanding} ${it.unit} ${it.desc}`.trim(),
    )
    .join(', ');
}

/** "due 26 Oct". */
export const dueText = p =>
  p.returnDue ? `due ${fmtShortDate(p.returnDue)}` : '';

/** The signed-in employee has to accept / approve this pass. */
export const isMyTodo = (p, user) =>
  !!user &&
  p.authorisedBy?.id === user.id &&
  (p.status === 'awaiting_receipt' || p.status === 'awaiting_approval');

/** May cancel: security / admin, or the employee who made it, while nothing has moved. */
export const mayCancel = (p, user) =>
  !!user &&
  MP_CANCELLABLE.includes(p.status) &&
  (user.role === 'security' ||
    user.role === 'admin' ||
    p.requestedBy?.id === user.id);
