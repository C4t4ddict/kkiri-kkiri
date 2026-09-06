const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

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
  isValidEmail,
  normalizeEmail,
};
