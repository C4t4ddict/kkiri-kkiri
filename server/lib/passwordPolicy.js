const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const getPasswordValidationError = (value) => {
  const password = String(value || '');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 ${PASSWORD_MAX_LENGTH}자 이하로 입력해주세요`;
  }
  if (/\s/.test(password)) return '비밀번호에는 공백을 사용할 수 없습니다';

  const categoryCount = [
    /[\p{L}]/u.test(password),
    /\d/.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ].filter(Boolean).length;
  return categoryCount >= 2 ? null : '비밀번호는 문자, 숫자, 특수문자 중 2종류 이상을 포함해주세요';
};

module.exports = { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, getPasswordValidationError };
