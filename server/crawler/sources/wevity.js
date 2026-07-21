const cheerio = require('cheerio');
const {
  absoluteUrl,
  cleanMultilineText,
  cleanText,
  normalizeActivity,
  parseDateRange,
  splitCategories,
} = require('../normalize');

const BASE_URL = 'https://www.wevity.com/';

const buildListUrl = (page) => `${BASE_URL}index.php?c=find&s=1&gub=1&gp=${page}`;

const parseWevityList = (html) => {
  const $ = cheerio.load(html);
  const items = [];
  $('.ms-list > ul.list > li').not('.top').each((index, element) => {
    const anchor = $(element).find('.tit > a[href*="gbn=view"]').first();
    const sourceUrl = absoluteUrl(anchor.attr('href'), BASE_URL);
    if (!sourceUrl) return;
    const sourceItemId = new URL(sourceUrl).searchParams.get('ix');
    if (!sourceItemId) return;
    const titleNode = anchor.clone();
    titleNode.find('span').remove();
    items.push({
      sourceItemId,
      sourceUrl,
      title: cleanText(titleNode.text()),
      organizer: cleanText($(element).find('.organ').first().text()),
      sourceCategories: splitCategories($(element).find('.sub-tit').text().replace(/^\s*분야\s*:\s*/, '')),
    });
  });
  return [...new Map(items.map((item) => [item.sourceItemId, item])).values()];
};

const extractInfoRows = ($) => {
  const rows = {};
  $('.contest-detail .cd-info-list > li').each((index, element) => {
    const label = cleanText($(element).find('.tit').first().text());
    if (!label) return;
    const valueNode = $(element).clone();
    valueNode.find('.tit, .cil-dday, script').remove();
    rows[label] = {
      text: cleanText(valueNode.text()),
      href: absoluteUrl($(element).find('a[href]').first().attr('href'), BASE_URL),
    };
  });
  return rows;
};

const extractDetails = ($) => {
  const container = $('#viewContents');
  const lines = container
    .find('p, li, h1, h2, h3, h4, h5, h6, tr')
    .map((index, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  return cleanMultilineText(lines.length ? lines.join('\n') : container.text());
};

const parseWevityDetail = (html, seed) => {
  const $ = cheerio.load(html);
  const rows = extractInfoRows($);
  const details = extractDetails($) || cleanText($('meta[property="og:description"]').attr('content'));
  const detailPeriod = parseDateRange(rows['접수기간']?.text);
  return normalizeActivity({
    sourceName: '위비티',
    sourceItemId: seed.sourceItemId,
    sourceUrl: seed.sourceUrl,
    officialUrl: rows['홈페이지']?.href,
    title: cleanText($('.contest-detail .tit-area h6.tit').first().text()) || seed.title,
    targetAudience: rows['응모대상']?.text,
    organizer: rows['주최/주관']?.text || seed.organizer,
    applicationPeriod: detailPeriod.start ? detailPeriod : seed.applicationPeriod,
    contact: null,
    details,
    category: '공모전',
    sourceCategories: splitCategories(rows['분야']?.text || seed.sourceCategories),
    mainImageUrl:
      $('.contest-detail .cd-area .img img').first().attr('src') ||
      $('meta[property="og:image"]').attr('content'),
  });
};

const createWevitySource = () => ({
  name: '위비티',
  async discover(client, options) {
    const discovered = [];
    for (let page = 1; page <= options.pages; page += 1) {
      const html = await client.fetchHtml(buildListUrl(page));
      discovered.push(...parseWevityList(html));
      if (discovered.length >= options.limit) break;
    }
    return [...new Map(discovered.map((item) => [item.sourceItemId, item])).values()].slice(0, options.limit);
  },
  async fetchDetail(client, item) {
    const rawHtml = await client.fetchHtml(item.sourceUrl);
    return { activity: parseWevityDetail(rawHtml, item), rawHtml };
  },
});

module.exports = { createWevitySource, parseWevityDetail, parseWevityList };
