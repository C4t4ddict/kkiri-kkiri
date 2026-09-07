const express = require('express');
const { CalendarError, listCalendar, saveEvent } = require('./service');

function createCalendarRouter({ database, getSchemaReady }) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!Number.isSafeInteger(req.authUserId) || req.authUserId < 1) return res.status(401).json({ message: '로그인이 필요합니다.' });
    next();
  });
  const handle = operation => async (req, res) => {
    try { await getSchemaReady(); await operation(req, res); }
    catch (error) {
      if (error instanceof CalendarError) return res.status(error.status).json({ message: error.message });
      console.error('캘린더 처리 오류:', error.message);
      res.status(503).json({ message: '캘린더를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' });
    }
  };
  const parseId = value => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new CalendarError('일정 번호가 올바르지 않습니다.');
    return id;
  };
  router.get('/', handle(async (req, res) => res.json(await listCalendar(database, req.authUserId, req.query.start, req.query.end))));
  router.post('/events', handle(async (req, res) => res.status(201).json(await saveEvent(database, req.authUserId, req.body))));
  router.put('/events/:id', handle(async (req, res) => res.json(await saveEvent(database, req.authUserId, req.body, parseId(req.params.id)))));
  router.delete('/events/:id', handle(async (req, res) => {
    const [result] = await database.query(`UPDATE calendar_events SET deleted_at=CURRENT_TIMESTAMP, version=version+1
      WHERE event_id=? AND user_id=? AND deleted_at IS NULL`, [parseId(req.params.id), req.authUserId]);
    if (!result.affectedRows) throw new CalendarError('일정을 찾을 수 없습니다.', 404);
    res.json({ deleted: true });
  }));
  return router;
}
module.exports = { createCalendarRouter };
