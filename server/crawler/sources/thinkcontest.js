const cheerio = require('cheerio');
const {
  absoluteUrl,
  cleanMultilineText,
  cleanText,
  normalizeActivity,
  parseDateRange,
  splitCategories,
} = require('../normalize');

const BASE_URL = 'https://thinkcontest.com/';
const LIST_API_URL = `${BASE_URL}thinkgood/user/contest/subList.do`;

const parseThinkcontestList = (payload) =>
  (Array.isArray(payload?.listJsonData) ? payload.listJsonData : [])
    .filter((item) => item?.contest_pk && item?.program_nm)
    .map((item) => ({
      sourceItemId: String(item.contest_pk),
      sourceUrl: `${BASE_URL}thinkgood/user/contest/view.do?contest_pk=${item.contest_pk}`,
      title: cleanText(item.program_nm),
      organizer: cleanText(item.host_company),
      sourceCategories: splitCategories(item.contest_field_nm),
      applicationPeriod: parseDateRange(item.receivetime_period || item.receive_period),
      officialUrl: absoluteUrl(item.hompage_url, BASE_URL),
    }));

const extractInfoRows = ($) => {
  const rows = {};
  $('.content-detail__top .info > div').each((index, element) => {
    const label = cleanText($(element).children('.tit').first().text());
    if (!label) return;
    const value = $(element).children('.txt').first();
    rows[label] = {
      text: cleanText(value.text()),
      href: absoluteUrl(value.find('a[href]').first().attr('href'), BASE_URL),
    };
  });
  return rows;
};

const extractDetails = ($) => {
  const container = $('#contest_content');
  const lines = container
    .find('p, li, h1, h2, h3, h4, h5, h6, tr')
    .map((index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  return cleanMultilineText(lines.length ? lines.join('\n') : container.text());
};

const parseThinkcontestDetail = (html, seed) => {
  const $ = cheerio.load(html);
  const rows = extractInfoRows($);
  const details = extractDetails($) || cleanText($('meta[name="description"]').attr('content'));
  const organizer = [...new Set([rows['주최']?.text, rows['주관']?.text].filter(Boolean))].join(' / ');
  const detailPeriod = parseDateRange(rows['접수기간']?.text);
  return normalizeActivity({
    sourceName: '씽굿',
    sourceItemId: seed.sourceItemId,
    sourceUrl: seed.sourceUrl,
    officialUrl: rows['홈페이지']?.href || seed.officialUrl,
    title: cleanText($('.contest-view__title').first().text()) || seed.title,
    targetAudience: rows['참가자격']?.text,
    organizer: organizer || seed.organizer,
    applicationPeriod: detailPeriod.start ? detailPeriod : seed.applicationPeriod,
    details,
    category: '공모전',
    sourceCategories: splitCategories(rows['응모분야']?.text || seed.sourceCategories),
    mainImageUrl:
      $('.content-detail__top .img-wrap img.contestimg').first().attr('src') ||
      $('meta[property="og:image"]').attr('content'),
  });
};

const createThinkcontestSource = () => ({
  name: '씽굿',
  async discover(client, options) {
    const discovered = [];
    for (let page = 1; page <= options.pages; page += 1) {
      const payload = await client.fetchJson(LIST_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          recordsPerPage: 10,
          currentPageNo: page,
          contest_field: '',
          host_organ: '',
          enter_qualified: '',
          award_size: '',
          searchStatus: 'Y',
          sidx: 'putup_sdt',
          sord: 'DESC',
        }),
      });
      discovered.push(...parseThinkcontestList(payload));
      if (discovered.length >= options.limit) break;
    }
    return [...new Map(discovered.map((item) => [item.sourceItemId, item])).values()].slice(0, options.limit);
  },
  async fetchDetail(client, item) {
    const rawHtml = await client.fetchHtml(item.sourceUrl);
    return { activity: parseThinkcontestDetail(rawHtml, item), rawHtml };
  },
});

module.exports = { createThinkcontestSource, parseThinkcontestDetail, parseThinkcontestList };
