const express = require('express');

module.exports = ({ db }) => {
  const router = express.Router();

  // 헬스 체크 API
  router.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
  
  router.get('/api/db-health', (req, res) => {
    if (!db || db.state === 'disconnected') {
      return res.status(500).json({ status: 'error', message: 'Database not connected' });
    }
  
    db.query('SELECT 1 as test', (err, results) => {
      if (err) {
        return res.status(500).json({ status: 'error', message: 'Query failed', error: err.message });
      } else {
        res.json({ status: 'ok', message: 'Database connected', timestamp: new Date().toISOString() });
      }
    });
  });

  return router;
};
