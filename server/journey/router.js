const express = require('express');
const service = require('./service');
const { archiveTeam } = require('../portfolio/service');
const { createMiniPortfolioPdf } = require('../portfolio/pdf');
const { createMemoryRateLimiter } = require('../lib/rateLimit');

const createJourneyRouter = ({
  database,
  getSchemaReady,
  provisionCurriculumGoalsForMember,
}) => {
  const router = express.Router();
  router.use(createMemoryRateLimiter({ maximum: 180 }));
  const pdfLimit = createMemoryRateLimiter({
    maximum: 3,
    keyGenerator: req => req.authUserId || req.ip,
  });
  const createLimit = createMemoryRateLimiter({
    maximum: 10,
    keyGenerator: req => req.authUserId || req.ip,
  });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  const handle =
    (operation, isPublic = false) =>
    async (req, res) => {
      try {
        const userId = Number(req.authUserId);
        if (!isPublic && !Number.isSafeInteger(userId))
          return res.status(401).json({ message: '로그인이 필요합니다.' });
        if (!isPublic && userId < 1)
          return res.status(401).json({ message: '로그인이 필요합니다.' });
        await getSchemaReady();
        const value = await operation(req, res, userId);
        if (!res.headersSent) res.json(value ?? { success: true });
      } catch (error) {
        if (!(error instanceof service.JourneyError))
          console.error('팀 활동 흐름 오류:', error.message);
        if (!res.headersSent)
          res.status(error.statusCode || 500).json({
            message:
              error instanceof service.JourneyError
                ? error.message
                : '요청을 처리하지 못했습니다. 다시 시도해주세요.',
          });
      }
    };
  const teamId = req => service.positiveId(req.params.teamId);
  router.get(
    '/templates',
    handle(() => service.TEMPLATES),
  );
  router.get(
    '/shares',
    handle(async (_req, _res, userId) => {
      const [rows] = await database.query(
        'SELECT s.team_id,t.team_name AS title,s.token FROM journey_shares s JOIN teams t ON t.team_id=s.team_id JOIN team_members tm ON tm.team_id=s.team_id AND tm.user_id=s.user_id WHERE s.user_id=? AND s.token IS NOT NULL ORDER BY s.published_at DESC LIMIT 100',
        [userId],
      );
      return rows;
    }),
  );
  router.get(
    '/share/:token',
    handle(req => service.getPublicShare(database, req.params.token), true),
  );
  router.get(
    '/invite/:token',
    handle(req => service.getInvite(database, req.params.token), true),
  );
  router.post(
    '/invite/:token/accept',
    handle((req, _res, userId) =>
      service.acceptInvite(
        database,
        req.params.token,
        userId,
        req.body.part,
        provisionCurriculumGoalsForMember,
      ),
    ),
  );
  router.post(
    '/teams',
    createLimit,
    handle((req, _res, userId) =>
      service.createTeam(database, userId, req.body),
    ),
  );
  router.get(
    '/teams/:teamId',
    handle((req, _res, userId) =>
      service.getWorkspace(database, teamId(req), userId),
    ),
  );
  router.post(
    '/teams/:teamId/tasks',
    handle((req, _res, userId) =>
      service.saveTask(database, teamId(req), userId, req.body),
    ),
  );
  router.put(
    '/teams/:teamId/tasks/:todoId',
    handle((req, _res, userId) =>
      service.transaction(database, async connection => {
        const team = await service.requireMember(
          connection,
          teamId(req),
          userId,
          true,
        );
        if (service.isComplete(team))
          throw new service.JourneyError(
            '완료한 활동의 작업 상태는 변경할 수 없습니다.',
            409,
          );
        const status = req.body.status;
        if (!['미진행', '진행중', '완료'].includes(status))
          throw new service.JourneyError('작업 상태를 확인해주세요.');
        const [result] = await connection.query(
          "UPDATE todos SET status=?,completed_at=CASE WHEN ?='완료' THEN COALESCE(completed_at,NOW()) ELSE NULL END WHERE todo_id=? AND team_id=?",
          [status, status, service.positiveId(req.params.todoId), teamId(req)],
        );
        if (!result.affectedRows)
          throw new service.JourneyError('작업을 찾을 수 없습니다.', 404);
      }),
    ),
  );
  router.post(
    '/teams/:teamId/records',
    handle((req, _res, userId) =>
      service.saveRecord(database, teamId(req), userId, req.body),
    ),
  );
  router.put(
    '/teams/:teamId/records/:recordId/confirm',
    handle((req, _res, userId) => {
      if (typeof req.body.confirm !== 'boolean')
        throw new service.JourneyError('확인 여부를 선택해주세요.');
      return service.confirmRecord(
        database,
        teamId(req),
        userId,
        req.params.recordId,
        req.body.version,
        req.body.confirm,
      );
    }),
  );
  router.get(
    '/teams/:teamId/draft',
    handle((req, _res, userId) =>
      service.getDraft(database, teamId(req), userId),
    ),
  );
  router.put(
    '/teams/:teamId/draft',
    handle((req, _res, userId) =>
      service.saveReflection(database, teamId(req), userId, req.body),
    ),
  );
  router.post(
    '/teams/:teamId/share',
    handle((req, _res, userId) =>
      service.publishShare(database, teamId(req), userId, req.body),
    ),
  );
  router.delete(
    '/teams/:teamId/share',
    handle((req, _res, userId) =>
      service.revokeShare(database, teamId(req), userId),
    ),
  );
  router.post(
    '/teams/:teamId/pdf',
    pdfLimit,
    handle(async (req, res, userId) => {
      const draft = await service.getDraft(database, teamId(req), userId);
      const snapshot = service.buildPublicSnapshot(draft, req.body);
      const pdf = createMiniPortfolioPdf({
        ...snapshot,
        activity_type: '팀 프로젝트',
        member_count: draft.member_count,
        completed_task_count: snapshot.records.filter(
          r => r.task_status === '완료',
        ).length,
        achievements: snapshot.records.map(
          r =>
            `${r.title}\n내 기여: ${r.contribution}${
              r.outcome ? `\n결과: ${r.outcome}` : ''
            }\n${
              r.confirmation_count
                ? `팀원 ${r.confirmation_count}명 확인`
                : '본인 작성'
            } · ${r.task_status}`,
        ),
        links: snapshot.records
          .filter(r => r.artifact_url)
          .map(r => ({ title: r.title, url: r.artifact_url })),
        completed_tasks: { monthly: [], weekly: [], daily: [], overall: [] },
      });
      res.type('application/pdf');
      res.set(
        'Content-Disposition',
        'attachment; filename="kkiri-portfolio.pdf"',
      );
      res.flushHeaders();
      pdf.on('error', error => {
        console.error('포트폴리오 PDF 오류:', error.message);
        res.destroy();
      });
      pdf.pipe(res);
    }),
  );
  router.post(
    '/teams/:teamId/invite',
    handle((req, _res, userId) =>
      service.createInvite(database, teamId(req), userId),
    ),
  );
  router.delete(
    '/teams/:teamId/invite',
    handle((req, _res, userId) =>
      service.revokeInvite(database, teamId(req), userId),
    ),
  );
  router.put(
    '/teams/:teamId/phase',
    handle((req, _res, userId) =>
      service.transaction(database, async connection => {
        const id = teamId(req);
        const team = await service.requireMember(connection, id, userId, true);
        service.requireLeader(team, userId);
        if (!['IN_PROGRESS', 'WRAPPING', 'COMPLETED'].includes(req.body.phase))
          throw new service.JourneyError('활동 상태를 확인해주세요.');
        if (service.isComplete(team))
          throw new service.JourneyError('이미 보관한 활동입니다.', 409);
        if (req.body.phase === 'COMPLETED') {
          const [states] = await connection.query(
            'SELECT phase FROM journey_team_state WHERE team_id=?',
            [id],
          );
          if (states[0]?.phase !== 'WRAPPING')
            throw new service.JourneyError(
              '먼저 마무리 단계에서 기록을 확인해주세요.',
              409,
            );
          await archiveTeam(connection, id, 'LEADER_COMPLETED', {
            useTransaction: false,
          });
          await connection.query(
            'UPDATE journey_invites SET token=NULL WHERE team_id=?',
            [id],
          );
        }
        await connection.query(
          'INSERT INTO journey_team_state (team_id,phase) VALUES (?,?) ON DUPLICATE KEY UPDATE phase=VALUES(phase)',
          [id, req.body.phase],
        );
      }),
    ),
  );
  return router;
};
module.exports = { createJourneyRouter };
