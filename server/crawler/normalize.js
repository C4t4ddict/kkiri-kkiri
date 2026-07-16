const CONTACT_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:0\d{1,2}[-. )]\d{3,4}[-. ]\d{4}))/g;

const CATEGORY_RULES = [
  ['교육·강연', ['교육', '강연', '아카데미', '교육과정']],
  ['IT·소프트웨어', ['웹/모바일/IT', '게임/소프트웨어', '소프트웨어', '모바일', 'IT']],
  ['기획·아이디어', ['기획/아이디어', '아이디어', '기획']],
  ['광고·마케팅', ['광고/마케팅', '광고', '마케팅']],
  ['디자인·콘텐츠', ['영상/UCC/사진', '디자인/캐릭터/웹툰', '네이밍/슬로건', '영상', '디자인', '콘텐츠']],
  ['논문·리포트', ['논문/리포트', '논문', '리포트']],
  ['과학·공학', ['과학/공학', '과학', '공학']],
  ['문학·시나리오', ['문학/글/시나리오', '문학', '시나리오', '글쓰기', '신춘문예', '수기', '편지']],
  ['건축·인테리어', ['건축/건설/인테리어', '건축', '인테리어']],
  ['예체능', ['예체능/미술/음악', '예체능', '미술', '음악']],
  ['대외활동', ['대외활동/서포터즈', '서포터즈', '대외활동']],
  ['봉사활동', ['봉사활동', '봉사']],
  ['취업·창업', ['취업/창업', '취업', '창업']],
  ['해외', ['해외']],
];

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const cleanMultilineText = (value) =>
  String(value || '')
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .join('\n');

const splitCategories = (value) => {
  const categories = Array.isArray(value) ? value : String(value || '').split(/[,|]/);
  return [...new Set(categories.map(cleanText).filter(Boolean))];
};

const mapTopicCategory = (categories, title) => {
  const values = [cleanText(title), ...splitCategories(categories)].filter(Boolean);
  for (const value of values) {
    for (const [appCategory, keywords] of CATEGORY_RULES) {
      if (keywords.some((keyword) => value.includes(keyword))) {
        return appCategory;
      }
    }
  }
  return values.length ? '기타' : null;
};

const formatDateTime = (match, isEnd) => {
  const [, year, month, day, hour, minute] = match;
  const hours = hour === undefined ? (isEnd ? '23' : '00') : String(hour).padStart(2, '0');
  const minutes = minute === undefined ? (isEnd ? '59' : '00') : String(minute).padStart(2, '0');
  const seconds = hour === undefined && isEnd ? '59' : '00';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${hours}:${minutes}:${seconds}`;
};

const parseDateRange = (value) => {
  const matches = [...String(value || '').matchAll(/(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/g)];
  if (!matches.length) return { start: null, end: null };
  return {
    start: formatDateTime(matches[0], false),
    end: formatDateTime(matches[1] || matches[0], true),
  };
};

const extractContact = (...values) => {
  const matches = values.flatMap((value) => String(value || '').match(CONTACT_PATTERN) || []);
  return cleanText([...new Set(matches)].join(' / ')) || null;
};

const absoluteUrl = (value, baseUrl) => {
  const url = cleanText(value);
  if (!url) return null;
  try {
    const resolved = new URL(url, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : null;
  } catch (error) {
    return null;
  }
};

const truncateText = (value, maxLength) => {
  const text = cleanText(value);
  return text ? text.slice(0, maxLength) : null;
};

const truncateUtf8 = (value, maxBytes = 50000) => {
  const text = cleanMultilineText(value);
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  let result = '';
  for (const character of text) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes - 3) break;
    result += character;
  }
  return `${result}...`;
};

const normalizeActivity = (record) => {
  const sourceCategories = splitCategories(record.sourceCategories);
  const applicationPeriod = record.applicationPeriod || parseDateRange(record.applicationPeriodText);
  const activity = {
    sourceName: truncateText(record.sourceName, 50),
    sourceItemId: truncateText(record.sourceItemId, 100),
    sourceUrl: absoluteUrl(record.sourceUrl, record.sourceUrl),
    officialUrl: absoluteUrl(record.officialUrl, record.sourceUrl),
    title: truncateText(record.title, 255),
    targetAudience: truncateText(record.targetAudience, 255),
    organizer: truncateText(record.organizer, 255),
    location: truncateText(record.location, 255),
    operationPeriodStart: record.operationPeriodStart || null,
    operationPeriodEnd: record.operationPeriodEnd || null,
    applicationPeriodStart: applicationPeriod.start,
    applicationPeriodEnd: applicationPeriod.end,
    points: Number.isFinite(record.points) ? record.points : 0,
    contact: truncateText(record.contact || extractContact(record.details), 255),
    details: truncateUtf8(record.details),
    category: truncateText(record.category || '공모전', 100),
    topicCategory: truncateText(record.topicCategory || mapTopicCategory(sourceCategories, record.title), 100),
    sourceCategories,
    mainImageUrl: absoluteUrl(record.mainImageUrl, record.sourceUrl),
  };

  if (!activity.sourceName || !activity.sourceItemId || !activity.sourceUrl || !activity.title) {
    throw new Error('필수 정규화 필드(sourceName, sourceItemId, sourceUrl, title)가 누락되었습니다.');
  }

  return activity;
};

module.exports = {
  absoluteUrl,
  cleanMultilineText,
  cleanText,
  extractContact,
  mapTopicCategory,
  normalizeActivity,
  parseDateRange,
  splitCategories,
  truncateUtf8,
};
