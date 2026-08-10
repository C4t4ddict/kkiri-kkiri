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

const normalizeSchoolDomain = (value) => String(value || '').trim().toLowerCase();

const hasVerifiedSchool = (user) => Boolean(
  user?.school_email_verified
  && normalizeSchoolDomain(user?.school_domain),
);

const canAccessRecruitment = (user, recruitment) => {
  if (String(recruitment?.recruitment_scope || 'NATIONWIDE') !== 'SCHOOL') return true;
  return Boolean(
    hasVerifiedSchool(user)
    && normalizeSchoolDomain(user.school_domain) === normalizeSchoolDomain(recruitment.school_domain),
  );
};

module.exports = {
  canAccessRecruitment,
  getAccountIdentity,
  getEmailDomain,
  getSchoolDomain,
  hasVerifiedSchool,
  isValidEmail,
  normalizeEmail,
  normalizeSchoolDomain,
};
