const crypto = require('crypto');

const normalizeIdentityText = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('ko-KR')
  .replace(/[^0-9a-z가-힣]/g, '');

const dateOnly = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
};

const normalizeIdentityUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const ignoredParameters = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    ignoredParameters.forEach((parameter) => url.searchParams.delete(parameter));
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const query = [...url.searchParams.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, parameterValue]) => `${key}=${parameterValue}`)
      .join('&');
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
};

const buildActivityDedupKey = (activity) => {
  const title = normalizeIdentityText(activity.title);
  if (title.length < 6) return null;

  const endDate = dateOnly(activity.applicationPeriodEnd ?? activity.application_period_end);
  const startDate = dateOnly(activity.applicationPeriodStart ?? activity.application_period_start);
  const officialUrl = normalizeIdentityUrl(activity.officialUrl ?? activity.official_url);
  const organizer = normalizeIdentityText(activity.organizer);
  let identity = null;

  if (endDate || startDate) identity = `title-date:${title}|${endDate || startDate}`;
  else if (officialUrl) identity = `title-url:${title}|${officialUrl}`;
  else if (organizer.length >= 3) identity = `title-organizer:${title}|${organizer}`;
  if (!identity) return null;

  return crypto.createHash('sha256').update(identity).digest('hex');
};

const activityQualityScore = (activity) => {
  const textLength = String(activity.details || '').length;
  return Math.min(12, Math.floor(textLength / 250))
    + (activity.main_image_url ? 8 : 0)
    + (activity.official_url ? 5 : 0)
    + (activity.organizer ? 3 : 0)
    + (activity.target_audience ? 2 : 0)
    + (activity.application_period_end ? 2 : 0)
    + (activity.contact ? 1 : 0);
};

const chooseCanonicalActivity = (activities) => [...activities].sort((left, right) => {
  const scoreDifference = activityQualityScore(right) - activityQualityScore(left);
  if (scoreDifference) return scoreDifference;
  return Number(left.activity_id) - Number(right.activity_id);
})[0] || null;

module.exports = {
  activityQualityScore,
  buildActivityDedupKey,
  chooseCanonicalActivity,
  normalizeIdentityText,
  normalizeIdentityUrl,
};
