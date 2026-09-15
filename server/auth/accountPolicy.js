const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const isStrongPassword = (value) => {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) return false;
  if (Buffer.byteLength(value, 'utf8') > 72) return false;
  return /\p{L}/u.test(value) && /\p{N}/u.test(value);
};

const getEmailDomain = (value) => {
  const email = normalizeEmail(value);
  return isValidEmail(email) ? email.split('@').pop() : null;
};

const getSchoolDomain = (value) => {
  const domain = getEmailDomain(value);
  return domain && /(^|\.)ac\.kr$/i.test(domain) ? domain : null;
};

const getAccountIdentity = (email) => {
  const schoolDomain = getSchoolDomain(email);
  return {
    accountType: schoolDomain ? 'STUDENT' : 'GENERAL',
    schoolDomain,
    schoolName: schoolDomain,
  };
};

const canAccessRecruitment = (user, recruitment) => {
  if (String(recruitment?.recruitment_scope || 'NATIONWIDE') !== 'SCHOOL') return true;
  return Boolean(
    user?.email_verified
    && user?.account_type === 'STUDENT'
    && user?.school_domain
    && user.school_domain === recruitment.school_domain,
  );
};

module.exports = {
  canAccessRecruitment,
  getAccountIdentity,
  getEmailDomain,
  getSchoolDomain,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
};
