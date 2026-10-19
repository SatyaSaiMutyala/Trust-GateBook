/**
 * Visitor terms & confidentiality agreement (docs/API.md "Terms & agreement"): plain text, sections separated by a
 * blank line, a section starting with a numbered heading ("1. Confidentiality") on its own line.
 */

export const DEFAULT_TERMS_TITLE = 'Visitor Terms & Confidentiality Agreement';

export const DEFAULT_TERMS_BODY = `1. Confidentiality
I will keep confidential everything I see, hear or receive during my visit, including personal and health information of patients, customers and staff, test results, business, technical and financial information, processes, documents and systems. I will not copy, disclose or use any of it for any purpose other than my visit. This obligation continues after my visit ends.

2. Photographs and recordings
I will not take photographs, video or audio recordings on the premises without written permission from my host.

3. Restricted areas
I will stay with my host or escort and will not enter laboratories, server rooms, stores or other restricted areas unless I am taken there.

4. Safety and security
I will follow the instructions of my host and of security staff, including in an emergency or evacuation. I understand that bags and material may be checked, and that material can only be brought in or taken out with a gate pass.

5. My details and CCTV
I agree that my photograph and the details I give are recorded for safety and security and kept as per the company's records policy. I understand the premises are monitored by CCTV.

6. Visitor pass
I will wear my visitor pass where it can be seen and return it to security when I leave.

By checking in at the security desk with my photograph, I confirm that I have read these terms, or had them read to me, and that I agree to them.`;

/**
 * @typedef {object} Terms
 * @property {boolean} required  visitors must agree at check-in
 * @property {string} company    company name printed on the agreement ('' = the registered name from Company)
 * @property {string} title
 * @property {string} body
 * @property {number} version    goes up whenever company, title or body changes (set by the server)
 */

/** @type {Terms} */
export const DEFAULT_TERMS = {
  required: false,
  company: '',
  title: DEFAULT_TERMS_TITLE,
  body: DEFAULT_TERMS_BODY,
  version: 1,
};

/**
 * Sections for display / the PDF: `{ heading, text }[]` (heading '' for plain paragraphs).
 * @param {string} body
 */
export function termsSections(body) {
  return (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split('\n').map((l) => l.trim());
      return /^\d+[.)]\s+\S/.test(lines[0]) && lines.length > 1
        ? { heading: lines[0], text: lines.slice(1).join(' ') }
        : { heading: '', text: lines.join(' ') };
    });
}
