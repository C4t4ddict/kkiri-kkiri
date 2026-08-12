const createRequireAdmin = ({ database, getRequestUserId, getSchemaReady }) => async (req, res, next) => {
  const userId = getRequestUserId(req);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    await getSchemaReady();
    const [rows] = await database.query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (!rows.length || !rows[0].is_admin) {
      return res.status(403).json({ message: '운영자 권한이 필요합니다' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { createRequireAdmin };
