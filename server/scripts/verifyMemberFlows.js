const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const request = async (route, { token, expectedStatus, ...init } = {}) => {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBaseUrl}${route}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (expectedStatus !== undefined) {
    if (response.status !== expectedStatus) {
      throw new Error(`${route}: expected ${expectedStatus}, received ${response.status}`);
    }
    return data;
  }
  if (!response.ok) throw new Error(`${route}: ${response.status} ${data.message || 'request failed'}`);
  return data;
};

const login = (email) => request('/api/login', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'test123' }),
});

const run = async () => {
  const target = new URL(apiBaseUrl);
  if (process.env.DB_NAME !== 'kkiri_journey_qa' || Number(process.env.DB_PORT) !== 3308
    || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '3001') {
    throw new Error('회원 회귀 검증은 localhost:3001 API와 kkiri_journey_qa:3308 전용입니다.');
  }
  const health = await request('/api/db-health');
  if (health.database !== 'kkiri_journey_qa' || health.port !== 3308) throw new Error('API의 QA DB 신원이 일치하지 않습니다.');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'myappdb',
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
  });

  let snapshot = null;
  let preferenceSnapshot = null;
  let teamId = 0;
  let snapshotsReady = false;
  let verificationError;
  try {
    const [teams] = await connection.query(`
      SELECT t.team_id
      FROM teams t
      JOIN team_members reviewer ON reviewer.team_id = t.team_id AND reviewer.user_id = 1
      JOIN team_members reviewee ON reviewee.team_id = t.team_id AND reviewee.user_id = 2
      WHERE t.participation_mode = 'TEAM'
      ORDER BY t.activity_status = 'IN_PROGRESS' DESC, t.team_id
      LIMIT 1
    `);
    if (!teams.length) throw new Error('검증에 사용할 공통 팀이 없습니다');
    teamId = Number(teams[0].team_id);

    const [reviewRows] = await connection.query(
      'SELECT * FROM reviews WHERE reviewer_id = 1 AND reviewee_id = 2 AND related_team_id = ?',
      [teamId],
    );
    snapshot = reviewRows[0] || null;
    const [preferenceRows] = await connection.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = 1',
    );
    preferenceSnapshot = preferenceRows[0] || null;
    snapshotsReady = true;

    const [loginOne, loginTwo] = await Promise.all([
      login('test@test.com'),
      login('designer@test.com'),
    ]);
    const tokenOne = loginOne.token;
    const tokenTwo = loginTwo.token;

    const [meOne, meTwo, myTeams, members] = await Promise.all([
      request('/api/me', { token: tokenOne }),
      request('/api/me', { token: tokenTwo }),
      request('/my-teams', { token: tokenOne }),
      request(`/teams/${teamId}/members`, { token: tokenOne }),
    ]);
    if (meOne.user.email !== 'test@test.com' || meTwo.user.email !== 'designer@test.com') {
      throw new Error('/api/me 응답이 DB 회원과 일치하지 않습니다');
    }
    if (!myTeams.some((team) => Number(team.team_id) === teamId)) throw new Error('나의 활동에 공통 팀이 없습니다');
    if (![1, 2].every((id) => members.some((member) => Number(member.user_id) === id))) {
      throw new Error('팀원 API가 DB 회원을 모두 반환하지 않았습니다');
    }

    const preferenceBefore = await request('/api/me/notification-preferences', { token: tokenOne });
    const preferenceProbe = { ...preferenceBefore.preferences, matching: !preferenceBefore.preferences.matching };
    await request('/api/me/notification-preferences', {
      token: tokenOne,
      method: 'PUT',
      body: JSON.stringify(preferenceProbe),
    });
    const preferenceAfter = await request('/api/me/notification-preferences', { token: tokenOne });
    if (preferenceAfter.preferences.matching !== preferenceProbe.matching) {
      throw new Error('마이페이지 알림 설정이 DB에 저장되지 않았습니다');
    }

    const probeOne = `회원 DB 평가 생성 검증 ${Date.now()}`;
    await request('/api/reviews', {
      token: tokenOne,
      method: 'POST',
      body: JSON.stringify({ reviewee_id: 2, related_team_id: teamId, rating: 'high', comment: probeOne }),
    });
    const existingOne = await request(`/api/reviews/existing/1/2/${teamId}`, { token: tokenOne });
    if (!existingOne.existingReview?.review_high || existingOne.existingReview.comment !== probeOne) {
      throw new Error('평가 생성 결과를 다시 조회하지 못했습니다');
    }

    const [summary, received] = await Promise.all([
      request('/api/user/2/evaluations', { token: tokenTwo }),
      request('/api/user/2/reviews', { token: tokenTwo }),
    ]);
    if (Number(summary.evaluations.review_high || 0) < 1) throw new Error('나의 평가 집계가 반영되지 않았습니다');
    if (!received.reviews.some((review) => review.comment === probeOne && Number(review.reviewer_id) === 1)) {
      throw new Error('받은 평가 목록에 새 평가가 없습니다');
    }

    await request('/api/user/2/evaluations', { token: tokenOne, expectedStatus: 403 });
    await request('/api/reviews', {
      token: tokenOne,
      method: 'POST',
      expectedStatus: 403,
      body: JSON.stringify({ reviewee_id: 999999, related_team_id: teamId, rating: 'high', comment: '허용되면 안 되는 평가' }),
    });

    const probeTwo = `회원 DB 평가 수정 검증 ${Date.now()}`;
    await request('/api/reviews', {
      token: tokenOne,
      method: 'POST',
      body: JSON.stringify({ reviewee_id: 2, related_team_id: teamId, rating: 'medium', comment: probeTwo }),
    });
    const existingTwo = await request(`/api/reviews/existing/1/2/${teamId}`, { token: tokenOne });
    if (!existingTwo.existingReview?.review_medium || existingTwo.existingReview.review_high || existingTwo.existingReview.comment !== probeTwo) {
      throw new Error('평가 수정 결과가 단일 점수로 저장되지 않았습니다');
    }

    console.log(JSON.stringify({
      status: 'ok',
      checks: {
        db_backed_session: true,
        db_backed_team_members: true,
        db_backed_notification_preferences: true,
        review_create: true,
        review_update: true,
        received_review_summary: true,
        review_authorization: true,
      },
      team_id: teamId,
      users: [Number(meOne.user.id), Number(meTwo.user.id)],
    }, null, 2));
  } catch (error) {
    verificationError = error;
    throw error;
  } finally {
    let restoreError;
    try {
    if (snapshotsReady && teamId) {
      if (snapshot) {
        await connection.query(
          `INSERT INTO reviews
            (review_id, reviewer_id, reviewee_id, related_team_id, review_high, review_medium, review_low, comment, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE review_high = VALUES(review_high), review_medium = VALUES(review_medium),
             review_low = VALUES(review_low), comment = VALUES(comment), created_at = VALUES(created_at), updated_at = VALUES(updated_at)`,
          [snapshot.review_id, snapshot.reviewer_id, snapshot.reviewee_id, snapshot.related_team_id,
            snapshot.review_high, snapshot.review_medium, snapshot.review_low, snapshot.comment,
            snapshot.created_at, snapshot.updated_at],
        );
      } else {
        await connection.query(
          'DELETE FROM reviews WHERE reviewer_id = 1 AND reviewee_id = 2 AND related_team_id = ?',
          [teamId],
        );
      }
    }

    if (snapshotsReady && preferenceSnapshot) {
      await connection.query(
        `INSERT INTO user_notification_preferences
          (user_id, matching_enabled, activity_enabled, todo_enabled, notice_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE matching_enabled = VALUES(matching_enabled), activity_enabled = VALUES(activity_enabled),
           todo_enabled = VALUES(todo_enabled), notice_enabled = VALUES(notice_enabled),
           created_at = VALUES(created_at), updated_at = VALUES(updated_at)`,
        [preferenceSnapshot.user_id, preferenceSnapshot.matching_enabled, preferenceSnapshot.activity_enabled,
          preferenceSnapshot.todo_enabled, preferenceSnapshot.notice_enabled,
          preferenceSnapshot.created_at, preferenceSnapshot.updated_at],
      );
    } else if (snapshotsReady) {
      await connection.query('DELETE FROM user_notification_preferences WHERE user_id = 1');
    }
    } catch (error) {
      restoreError = error;
    } finally {
      try { await connection.end(); }
      catch (error) { restoreError ||= error; }
    }
    if (restoreError) {
      if (!verificationError) throw restoreError;
      console.error('QA 복원 또는 연결 종료 실패:', restoreError.code || restoreError.name);
    }
  }
};

run().catch((error) => {
  console.error('회원·마이페이지·평가 검증 실패:', error.message);
  process.exitCode = 1;
});
