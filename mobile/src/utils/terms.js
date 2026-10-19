/**
 * Terms text → sections: blank lines separate sections; a section whose first line is a numbered heading
 * ("1. Confidentiality") gets that line as its heading. Same rule as the server's agreement PDF.
 * @param {string} body
 * @returns {{ heading: string, text: string }[]}
 */
export function termsSections(body) {
  return (body ?? '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const lines = p.split('\n').map(l => l.trim());
      return /^\d+[.)]\s+\S/.test(lines[0]) && lines.length > 1
        ? { heading: lines[0], text: lines.slice(1).join(' ') }
        : { heading: '', text: lines.join(' ') };
    });
}
