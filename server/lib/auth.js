const crypto = require('crypto');

const requestedTokenTtl = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24);
const TOKEN_TTL_SECONDS = Number.isFinite(requestedTokenTtl)
  ? Math.min(60 * 60 * 24 * 30, Math.max(60, Math.floor(requestedTokenTtl)))
  : 60 * 60 * 24;
const configuredSecret = String(process.env.AUTH_TOKEN_SECRET || '').trim();
const tokenSecret = configuredSecret || crypto.randomBytes(32).toString('hex');

if (
  process.env.NODE_ENV === 'production'
  && (
    Buffer.byteLength(configuredSecret, 'utf8') < 32
    || /(?:replace|change|example|default)/i.test(configuredSecret)
  )
) {
  throw new Error('운영 환경에서는 추측하기 어려운 32바이트 이상의 AUTH_TOKEN_SECRET을 설정해야 합니다.');
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
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = decode(payload);
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(decoded.sub)
      || decoded.sub <= 0
      || !Number.isInteger(decoded.iat)
      || !Number.isInteger(decoded.exp)
      || decoded.iat > now + 60
      || decoded.exp <= decoded.iat
      || decoded.exp - decoded.iat > 60 * 60 * 24 * 30
      || decoded.exp <= now
    ) {
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
  process.env.NODE_ENV !== 'production'
  && String(process.env.ALLOW_LEGACY_USER_HEADER || 'false').toLowerCase() === 'true';

const isLoopbackAddress = (address) => {
  const normalized = String(address || '').trim().toLowerCase();
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1';
};

const getAuthenticatedUserId = (req) => {
  if (req.authUserId) return Number(req.authUserId);
  if (!allowLegacyUserHeader || !isLoopbackAddress(req.ip || req.socket?.remoteAddress)) return 0;
  const legacyUserId = Number(req.get('x-user-id'));
  return Number.isInteger(legacyUserId) && legacyUserId > 0 ? legacyUserId : 0;
};

module.exports = {
  attachAuth,
  getAuthenticatedUserId,
  isLoopbackAddress,
  issueAuthToken,
  verifyAuthToken,
};
