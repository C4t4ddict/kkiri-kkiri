const crypto = require('crypto');

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const configuredSecret = String(process.env.AUTH_TOKEN_SECRET || '').trim();
const tokenSecret = configuredSecret || crypto.randomBytes(32).toString('hex');

if (!configuredSecret && process.env.NODE_ENV === 'production') {
  throw new Error('운영 환경에서는 AUTH_TOKEN_SECRET을 설정해야 합니다.');
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const sign = (value) => crypto.createHmac('sha256', tokenSecret).update(value).digest('base64url');

const issueAuthToken = (userId) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({ sub: Number(userId), iat: now, exp: now + TOKEN_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
};

const verifyAuthToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = decode(payload);
    if (!Number.isInteger(decoded.sub) || decoded.sub <= 0 || decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const readBearerToken = (authorization = '') => {
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

const attachAuth = (req, _res, next) => {
  const payload = verifyAuthToken(readBearerToken(req.get('authorization')));
  req.authUserId = payload?.sub || null;
  next();
};

const allowLegacyUserHeader =
  String(process.env.ALLOW_LEGACY_USER_HEADER ?? (process.env.NODE_ENV !== 'production')).toLowerCase() === 'true';

const getAuthenticatedUserId = (req) => {
  if (req.authUserId) return Number(req.authUserId);
  if (!allowLegacyUserHeader) return 0;
  return Number(req.get('x-user-id') || req.body?.user_id || req.query?.user_id) || 0;
};

module.exports = {
  attachAuth,
  getAuthenticatedUserId,
  issueAuthToken,
  verifyAuthToken,
};
