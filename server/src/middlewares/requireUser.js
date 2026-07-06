function requireUser(req, res, next) {
  const idFromHeader = req.header('x-user-id');
  const userId = req.user?.id || idFromHeader;

  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }

  req.user = { id: Number(userId) };
  next();
}

module.exports = requireUser;
