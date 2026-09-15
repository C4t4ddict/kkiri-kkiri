const createRequireAdmin = ({ database, getSchemaReady, getAdminEmails = () => process.env.ADMIN_EMAILS || '' }) => async (req, res, next) => {
  // Privileged routes never accept the legacy user header or client role flags.
  const userId = Number(req.authUserId);
  if (!userId) return res.status(401).json({ message: '로그인이 필요합니다' });

  try {
    await getSchemaReady();
    const allowedEmails = String(getAdminEmails()).split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    const [rows] = await database.query('SELECT is_admin, email FROM users WHERE id = ?', [userId]);
    if (!rows.length || Number(rows[0].is_admin) !== 1 || !allowedEmails.includes(String(rows[0].email).toLowerCase())) {
      return res.status(403).json({ message: '운영자 권한이 필요합니다' });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { createRequireAdmin };
