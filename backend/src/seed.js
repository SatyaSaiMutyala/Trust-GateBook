/**
 * Demo data: a security user, two employees (hosts), ~15 visits across today and yesterday and 8 post items.
 * Usage: npm run seed   (add --force to add demo visits even if visits already exist)
 */
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { connectDb } from './db.js';
import { User } from './models/User.js';
import { MailItem } from './models/MailItem.js';
import { Visit } from './models/Visit.js';
import { bootstrap } from './services/bootstrap.js';
import { COVER_MAX_EDGE, ID_PHOTO_MAX_EDGE, PERSON_MAX_EDGE, PHOTO_MAX_EDGE, storeImage } from './services/images.js';
import { generatePassNumber } from './services/passNumber.js';
import { getSettings } from './services/settings.js';

const HOST_PASSWORD = 'host1234';
const HOSTS = [
  { email: 'ravi@gatebook.local', name: 'Ravi Kumar', phone: '9876543201', dept: 'Accounts', location: '2nd floor, cabin 3' },
  { email: 'priya@gatebook.local', name: 'Priya Nair', phone: '9876543202', dept: 'HR', location: 'Ground floor, HR room' },
];
const SECURITY = { email: 'security@gatebook.local', password: 'security123', name: 'Ramesh (Security)' };

const PALETTE = ['#3B6E8F', '#8F5A3B', '#4F7F52', '#7A4F8F', '#8F3B4F', '#3B8F84', '#6B6B2F', '#2F4F6B'];

/** @param {string} name */
function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Coloured 3:4 card with the visitor's initials. @param {string} name @param {number} i */
async function placeholderPhoto(name, i) {
  const bg = PALETTE[i % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="520">
    <rect width="100%" height="100%" fill="${bg}"/>
    <circle cx="195" cy="200" r="95" fill="rgba(255,255,255,0.18)"/>
    <rect x="70" y="320" width="250" height="220" rx="110" fill="rgba(255,255,255,0.18)"/>
    <text x="195" y="232" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="700"
      fill="#ffffff" text-anchor="middle">${initials(name)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** Fake ID card. @param {string} name */
async function placeholderId(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="563">
    <rect width="100%" height="100%" fill="#F1EDE3"/>
    <rect x="0" y="0" width="900" height="90" fill="#1D4E89"/>
    <text x="40" y="60" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#fff">IDENTITY CARD (DEMO)</text>
    <rect x="40" y="130" width="220" height="280" fill="#C9C2B2"/>
    <text x="300" y="200" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#222">${name}</text>
    <text x="300" y="270" font-family="Courier, monospace" font-size="36" fill="#444">XXXX XXXX 1234</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/**
 * @typedef {object} DemoVisit
 * @property {string} name
 * @property {string} phone
 * @property {string} company
 * @property {string} purpose
 * @property {string} host
 * @property {string} dept
 * @property {string} badge
 * @property {number} inHoursAgo  hours before now that they came in
 * @property {number | null} stayMin  stay in minutes; null = still inside
 * @property {number} [persons]
 * @property {string} [vehicle]
 * @property {string} [items]
 * @property {string} [idType]
 * @property {boolean} [passReturned]
 * @property {boolean} [withId]
 */

/** @type {DemoVisit[]} */
const DEMO = [
  // still inside (one well past the overstay limit)
  { name: 'Ravi Kumar', phone: '9876543210', company: 'Acme Labs', purpose: 'Meeting', host: 'Priya Sharma', dept: 'Laboratory', badge: '12', inHoursAgo: 6.2, stayMin: null, vehicle: 'KA01AB1234', withId: true },
  { name: 'Sunita Rao', phone: '9845012345', company: 'BlueDart', purpose: 'Delivery', host: 'Stores', dept: 'Logistics', badge: '3', inHoursAgo: 0.4, stayMin: null, items: '2 cartons' },
  { name: 'Mohammed Irfan', phone: '9900112233', company: 'CoolAir Services', purpose: 'Vendor / Service', host: 'Facility desk', dept: 'Administration', badge: '7', inHoursAgo: 1.3, stayMin: null, persons: 2, items: 'Tool kit' },
  { name: 'Anita Desai', phone: '9123456780', company: '', purpose: 'Interview', host: 'Kavya Iyer', dept: 'HR', badge: '15', inHoursAgo: 0.8, stayMin: null, idType: 'PAN' },
  // today, exited
  { name: 'Vikram Singh', phone: '9811122233', company: 'Zenith Pharma', purpose: 'Customer', host: 'Arjun Mehta', dept: 'Sales', badge: '1', inHoursAgo: 3.5, stayMin: 65, vehicle: 'KA05MN4321' },
  { name: 'Lakshmi Narayan', phone: '9798765432', company: 'Govt. Drug Control', purpose: 'Government / Audit', host: 'QA Head', dept: 'Laboratory', badge: '2', inHoursAgo: 2.8, stayMin: 95, persons: 3, withId: true },
  { name: 'Deepak Joshi', phone: '9988776655', company: 'Swift Couriers', purpose: 'Delivery', host: 'Reception', dept: '', badge: '4', inHoursAgo: 2.1, stayMin: 12 },
  { name: 'Fatima Sheikh', phone: '9765432109', company: 'MedEquip India', purpose: 'Sample pickup', host: 'Lab desk', dept: 'Laboratory', badge: '5', inHoursAgo: 1.9, stayMin: 25, passReturned: false },
  // yesterday
  { name: 'Ravi Kumar', phone: '+91 98765 43210', company: 'Acme Labs', purpose: 'Meeting', host: 'Priya Sharma', dept: 'Laboratory', badge: '9', inHoursAgo: 26, stayMin: 80, vehicle: 'KA01AB1234' },
  { name: 'Suresh Babu', phone: '9887766554', company: 'PrintPro', purpose: 'Vendor / Service', host: 'IT helpdesk', dept: 'IT', badge: '6', inHoursAgo: 27.5, stayMin: 140 },
  { name: 'Meera Pillai', phone: '9776655443', company: 'Freelance', purpose: 'Interview', host: 'Kavya Iyer', dept: 'HR', badge: '8', inHoursAgo: 28, stayMin: 55 },
  { name: 'Gopal Reddy', phone: '9665544332', company: 'Reddy Transport', purpose: 'Delivery', host: 'Stores', dept: 'Logistics', badge: '10', inHoursAgo: 29, stayMin: 20, vehicle: 'TS09XY7788', persons: 2 },
  { name: 'Neha Kapoor', phone: '9554433221', company: 'Kapoor & Co', purpose: 'Meeting', host: 'CFO', dept: 'Accounts', badge: '11', inHoursAgo: 30, stayMin: 45 },
  { name: 'Arun Prakash', phone: '9443322110', company: 'Digital Ads Ltd', purpose: 'Meeting', host: 'Marketing lead', dept: 'Marketing', badge: '13', inHoursAgo: 31, stayMin: 70, passReturned: false },
  { name: 'Joseph Mathew', phone: '9332211009', company: 'Procura', purpose: 'Customer', host: 'Purchase manager', dept: 'Procurement', badge: '14', inHoursAgo: 32, stayMin: 35 },
];

async function main() {
  const force = process.argv.includes('--force');
  const db = await connectDb();
  try {
    await bootstrap();

    let security = await User.findOne({ email: SECURITY.email });
    if (!security) {
      security = await User.create({
        name: SECURITY.name,
        email: SECURITY.email,
        passwordHash: await bcrypt.hash(SECURITY.password, 10),
        role: 'security',
        active: true,
      });
      console.log(`[seed] created security user ${SECURITY.email} / ${SECURITY.password}`);
    } else {
      console.log(`[seed] security user ${SECURITY.email} already exists`);
    }

    for (const h of HOSTS) {
      if (await User.exists({ email: h.email })) {
        console.log(`[seed] employee ${h.email} already exists`);
        continue;
      }
      await User.create({ ...h, passwordHash: await bcrypt.hash(HOST_PASSWORD, 10), role: 'host', isHost: true, active: true });
      console.log(`[seed] created employee ${h.email} / ${HOST_PASSWORD}`);
    }

    const existing = await Visit.estimatedDocumentCount();
    if (existing > 0 && !force) {
      console.log(`[seed] ${existing} visits already exist; skipping demo visits (use --force to add anyway)`);
    } else {
      await seedVisits(security);
    }

    const existingMail = await MailItem.estimatedDocumentCount();
    if (existingMail > 0 && !force) {
      console.log(`[seed] ${existingMail} post items already exist; skipping demo post (use --force to add anyway)`);
    } else {
      await seedMail(security);
    }

  } finally {
    await db.close();
  }
}

/** @param {any} security */
async function seedVisits(security) {
  const settings = await getSettings();
  const site = settings.sites[0];
  const guard = { id: security._id.toString(), name: security.name };
  const now = Date.now();
  let created = 0;

  for (const [i, d] of DEMO.entries()) {
    const inAt = new Date(now - d.inHoursAgo * 3_600_000);
    const outAt = d.stayMin === null ? null : new Date(Math.min(now, inAt.getTime() + d.stayMin * 60_000));
    const open = outAt === null;
    const phone10 = d.phone.replace(/\D/g, '').slice(-10);
    if (open && (await Visit.exists({ outAt: null, $or: [{ phone10 }, { site, badge: d.badge }] }))) {
      console.log(`[seed] skipping ${d.name}: phone or pass ${d.badge} already inside`);
      continue;
    }
    const purpose = settings.purposes.includes(d.purpose) ? d.purpose : settings.purposes[0];
    const photo = await storeImage(await placeholderPhoto(d.name, i), PHOTO_MAX_EDGE, 'photo');
    const idPhoto = d.withId ? await storeImage(await placeholderId(d.name), ID_PHOTO_MAX_EDGE, 'idPhoto') : null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await Visit.create({
          pass: generatePassNumber(inAt),
          badge: d.badge,
          passReturned: open ? null : (d.passReturned ?? true),
          name: d.name,
          phone: d.phone,
          phone10,
          company: d.company,
          persons: d.persons ?? 1,
          purpose,
          host: d.host,
          dept: d.dept,
          idType: d.idType ?? 'Aadhaar',
          idLast4: String(1000 + ((i * 337) % 9000)).slice(-4),
          vehicle: d.vehicle ?? '',
          items: d.items ?? '',
          notes: i === 0 ? 'Demo: long meeting, should show as overstay' : '',
          site,
          inAt,
          outAt,
          photo,
          idPhoto,
          guardIn: guard,
          guardOut: open ? null : guard,
          exitNote: d.passReturned === false ? 'Visitor left without returning the pass' : '',
        });
        created++;
        break;
      } catch (e) {
        if (/** @type {any} */ (e).code === 11000 && attempt < 7) continue;
        throw e;
      }
    }
  }
  console.log(`[seed] created ${created} demo visits at "${site}"`);
}

/** @param {string} label @param {string} sub @param {number} i */
async function placeholderCover(label, sub, i) {
  const bg = ['#E8DCC4', '#D9E4EC', '#F1E3D3', '#E2E8D5'][i % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="825">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="60" y="60" width="980" height="705" fill="none" stroke="#8a7a5a" stroke-width="6" stroke-dasharray="24 12"/>
    <rect x="560" y="420" width="420" height="250" fill="#fff" stroke="#333" stroke-width="3"/>
    <text x="590" y="490" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#222">${label}</text>
    <text x="590" y="560" font-family="Courier, monospace" font-size="34" fill="#444">${sub}</text>
    <rect x="100" y="110" width="300" height="90" fill="#1D4E89"/>
    <text x="120" y="170" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#fff">DEMO</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/**
 * @typedef {object} DemoMail
 * @property {string} kind
 * @property {string} sender
 * @property {string} carrier
 * @property {string} broughtBy
 * @property {string} [broughtPhone]
 * @property {string} [refNo]
 * @property {string | null} to        employee email, or null for a typed name
 * @property {string} [toName]         name when not on Gatebook
 * @property {'lodged'|'handed'|'closed'|'confirmed'|'disputed'|'resolved'} status
 * @property {number} hoursAgo
 * @property {number} [pieces]
 * @property {string} [dept]
 */

/** @type {DemoMail[]} */
const DEMO_MAIL = [
  { kind: 'Courier', sender: 'Transasia Biomedicals', carrier: 'Blue Dart', broughtBy: 'Suresh', broughtPhone: '9811000001', refNo: 'BD884213', to: 'ravi@gatebook.local', status: 'lodged', hoursAgo: 0.5, pieces: 2 },
  { kind: 'Registered post', sender: 'Income Tax Department', carrier: 'India Post', broughtBy: 'Postman Raju', refNo: 'RK123456789IN', to: 'priya@gatebook.local', status: 'lodged', hoursAgo: 2 },
  { kind: 'Parcel', sender: 'Amazon', carrier: 'Delhivery', broughtBy: 'Imran', broughtPhone: '9811000003', to: null, toName: 'Mr. Kulkarni (Purchase)', dept: 'Procurement', status: 'lodged', hoursAgo: 1 },
  { kind: 'Documents', sender: 'HDFC Bank', carrier: 'DTDC', broughtBy: 'Vinod', refNo: 'D10029384', to: 'priya@gatebook.local', status: 'handed', hoursAgo: 3 },
  { kind: 'Speed post', sender: 'Drug Controller', carrier: 'India Post', broughtBy: 'Postman Raju', refNo: 'EE998877665IN', to: 'ravi@gatebook.local', status: 'confirmed', hoursAgo: 5 },
  { kind: 'Courier', sender: 'Transasia', carrier: 'Professional Couriers', broughtBy: 'Mahesh', to: 'priya@gatebook.local', status: 'disputed', hoursAgo: 6 },
  { kind: 'Letter', sender: 'Rotary Club', carrier: 'Hand delivery', broughtBy: 'Office boy', to: null, toName: 'Front office', dept: 'Administration', status: 'closed', hoursAgo: 26 },
  { kind: 'Cheque / DD', sender: 'Zenith Pharma', carrier: 'Blue Dart', broughtBy: 'Suresh', refNo: 'BD771100', to: 'ravi@gatebook.local', status: 'resolved', hoursAgo: 28 },
];

/** @param {any} security */
async function seedMail(security) {
  const settings = await getSettings();
  const site = settings.sites[0];
  const guard = { id: security._id.toString(), name: security.name };
  const now = Date.now();
  let created = 0;
  for (const [i, d] of DEMO_MAIL.entries()) {
    const user = d.to ? await User.findOne({ email: d.to }) : null;
    const receivedAt = new Date(now - d.hoursAgo * 3_600_000);
    const handedAt = d.status === 'lodged' ? null : new Date(receivedAt.getTime() + 40 * 60_000);
    const answeredAt = handedAt ? new Date(handedAt.getTime() + 15 * 60_000) : null;
    const cover = await storeImage(await placeholderCover(d.sender, d.refNo || d.kind, i), COVER_MAX_EDGE, 'cover');
    const person = await storeImage(await placeholderPhoto(d.broughtBy, i + 3), PERSON_MAX_EDGE, 'person');
    const recipientName = user ? user.name : (d.toName ?? 'Unknown');
    const wasDisputed = d.status === 'disputed' || d.status === 'resolved';
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await MailItem.create({
          code: generatePassNumber(receivedAt, 'ML'),
          kind: settings.mailKinds.includes(d.kind) ? d.kind : settings.mailKinds[0],
          refNo: d.refNo ?? '',
          sender: d.sender,
          carrier: d.carrier,
          broughtBy: d.broughtBy,
          broughtPhone: d.broughtPhone ?? '',
          recipient: user
            ? { id: user._id.toString(), name: user.name, phone: user.phone ?? '', location: user.location ?? '' }
            : null,
          recipientName,
          dept: d.dept ?? user?.dept ?? '',
          pieces: d.pieces ?? 1,
          notes: '',
          site,
          receivedAt,
          receivedBy: guard,
          cover,
          person,
          status: d.status,
          notifiedAt: user ? receivedAt : null,
          remindedAt: d.status === 'lodged' && user && d.hoursAgo > 1 ? new Date(now - 30 * 60_000) : null,
          handedAt,
          handedBy: handedAt ? guard : null,
          collectedBy: handedAt ? (d.status === 'disputed' ? 'Ravi (office boy)' : recipientName) : '',
          handedNote: handedAt ? 'Signed in register' : '',
          confirmedAt: d.status === 'confirmed' ? answeredAt : null,
          disputeNote: wasDisputed ? 'I was not in office today' : '',
          resolvedAt: d.status === 'resolved' ? answeredAt && new Date(answeredAt.getTime() + 60 * 60_000) : null,
          resolvedBy: d.status === 'resolved' ? guard : null,
          resolveNote: d.status === 'resolved' ? 'Found with the Accounts clerk and handed over again' : '',
        });
        created++;
        break;
      } catch (e) {
        if (/** @type {any} */ (e).code === 11000 && attempt < 7) continue;
        throw e;
      }
    }
  }
  console.log(`[seed] created ${created} demo post items at "${site}"`);
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
