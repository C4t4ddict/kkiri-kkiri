const DEFAULT_WEB_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const getAllowedOrigins = (value = process.env.WEB_ALLOWED_ORIGINS) => new Set(
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .concat(value ? [] : DEFAULT_WEB_ORIGINS),
);

const isOriginAllowed = (origin, allowedOrigins = getAllowedOrigins()) =>
  !origin || allowedOrigins.has(origin);

const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

module.exports = { getAllowedOrigins, isOriginAllowed, securityHeaders };
