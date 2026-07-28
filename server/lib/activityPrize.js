const PRIZE_HEADING = /^(?:[●■◆▶※]\s*)?(?:공모전\s*)?(?:시상\s*내역|시상내역|시상\s*규모|상금\s*및\s*부상|총상금|상금)\s*[:：-]?\s*(.*)$/i;
const SECTION_HEADING = /^(?:[●■◆▶]\s*)[^\d\s].{0,40}$/;
const PRIZE_VALUE = /(?:\d[\d,.]*\s*(?:천|만|억)?\s*원|상품권|상당\s*부상|리워드|상금)/i;

const normalizeLines = (details) => String(details || '')
  .replace(/\\n/g, '\n')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const extractPrizeDetails = (details) => {
  const lines = normalizeLines(details);
  if (!lines.length) return null;

  const headingIndex = lines.findIndex((line) => PRIZE_HEADING.test(line));
  if (headingIndex >= 0) {
    const headingMatch = lines[headingIndex].match(PRIZE_HEADING);
    const section = headingMatch?.[1] ? [headingMatch[1]] : [];
    for (let index = headingIndex + 1; index < lines.length && section.length < 10; index += 1) {
      if (SECTION_HEADING.test(lines[index]) && !PRIZE_VALUE.test(lines[index])) break;
      section.push(lines[index]);
    }
    const value = section.join('\n').trim();
    return value ? value.slice(0, 2000) : null;
  }

  const valueIndex = lines.findIndex((line) => PRIZE_VALUE.test(line));
  if (valueIndex < 0) return null;
  const section = lines.slice(valueIndex, valueIndex + 6)
    .filter((line, index) => index === 0 || PRIZE_VALUE.test(line) || /^[-•]/.test(line));
  return section.join('\n').slice(0, 2000) || null;
};

module.exports = { extractPrizeDetails };
