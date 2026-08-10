export const getPasswordValidationError = (value: string) => {
  if (value.length < 8 || value.length > 128) return '비밀번호는 8자 이상 128자 이하로 입력해주세요.';
  if (/\s/.test(value)) return '비밀번호에는 공백을 사용할 수 없습니다.';
  const categoryCount = [
    /[\p{L}]/u.test(value),
    /\d/.test(value),
    /[^\p{L}\p{N}\s]/u.test(value),
  ].filter(Boolean).length;
  return categoryCount >= 2 ? null : '문자, 숫자, 특수문자 중 2종류 이상을 사용해주세요.';
};
