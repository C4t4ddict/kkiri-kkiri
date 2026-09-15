const crypto = require('crypto');
const {
  formatDateOnly,
  groupCompletedTasks,
  getMiniPortfolio,
} = require('../portfolio/service');

class JourneyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
const positiveId = value => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new JourneyError('올바른 항목을 선택해주세요.');
  return id;
};
const textValue = (value, max, required = false) => {
  if (value != null && typeof value !== 'string')
    throw new JourneyError('입력 형식을 확인해주세요.');
  const text = (value || '').trim();
  if (required && !text) throw new JourneyError('내용을 입력해주세요.');
  if (text.length > max)
    throw new JourneyError(`내용을 ${max}자 이내로 입력해주세요.`);
  return text;
};
const safeUrl = value => {
  const text = textValue(value, 2000);
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new JourneyError(
      '결과물 링크는 http 또는 https 주소를 입력해주세요.',
    );
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new JourneyError('결과물 링크를 확인해주세요.');
  return url.href;
};
const validDate = value => {
  const text = String(value || '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text
  )
    throw new JourneyError('날짜를 확인해주세요.');
  return text;
};
const json = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const newToken = () => crypto.randomBytes(32).toString('hex');
const checkToken = token => {
  if (!/^[a-f0-9]{64}$/.test(String(token || '')))
    throw new JourneyError('유효하지 않거나 해제된 링크입니다.', 404);
  return token;
};
const transaction = async (db, work) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const TEMPLATES = [
  {
    id: 'kickoff',
    title: '첫 모임 · 목표와 역할',
    markdown:
      '# 첫 모임\n\n## 우리가 만들 결과\n\n## 역할 나누기\n| 이름 | 맡은 일 | 완료 기준 |\n| --- | --- | --- |\n| | | |\n\n## 이번 주 할 일\n- [ ] 목표와 담당자를 함께 정하기\n\n## 다음 모임\n날짜와 준비할 내용을 적어주세요.\n',
  },
  {
    id: 'meeting',
    title: '회의록',
    markdown:
      '# 회의록\n\n## 오늘 결정할 것\n\n## 결정한 내용\n\n## 다음 할 일\n| 할 일 | 담당자 | 마감 |\n| --- | --- | --- |\n| | | |\n\n## 참고 자료\n',
  },
  {
    id: 'research',
    title: '조사 · 근거 정리',
    markdown:
      '# 조사 기록\n\n## 확인하려는 질문\n\n## 조사 방법\n\n## 확인한 사실과 출처\n| 사실 | 출처 |\n| --- | --- |\n| | |\n\n## 우리 작업에 적용할 점\n',
  },
  {
    id: 'outcome',
    title: '결과물 · 회고',
    markdown:
      '# 결과와 회고\n\n## 해결하려던 문제\n\n## 만든 결과물\n\n## 각자 기여한 부분\n\n## 확인한 결과\n\n## 다음에 바꿀 점\n',
  },
];

const ensureJourneySchema = async db => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS journey_team_state (team_id INT PRIMARY KEY, phase VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_task_documents (todo_id INT PRIMARY KEY, document_id BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_records (record_id INT AUTO_INCREMENT PRIMARY KEY, team_id INT NOT NULL, user_id INT NOT NULL, todo_id INT NOT NULL, document_id BIGINT UNSIGNED NULL, title VARCHAR(255) NOT NULL, contribution TEXT NOT NULL, outcome TEXT NULL, artifact_url VARCHAR(2000) NULL, version INT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_journey_record (team_id,user_id,todo_id), INDEX idx_journey_records_team (team_id,updated_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_confirmations (record_id INT NOT NULL, user_id INT NOT NULL, record_version INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (record_id,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_reflections (team_id INT NOT NULL, user_id INT NOT NULL, summary TEXT NULL, reflection TEXT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (team_id,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_invites (team_id INT PRIMARY KEY, token CHAR(64) NULL UNIQUE, expires_at DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS journey_shares (team_id INT NOT NULL, user_id INT NOT NULL, token CHAR(64) NULL UNIQUE, snapshot JSON NULL, published_at DATETIME NULL, PRIMARY KEY (team_id,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
  for (const sql of statements) await db.query(sql);
};

const requireMember = async (db, teamId, userId, lock = false) => {
  const [rows] = await db.query(
    `SELECT t.*, tm.part, tm.role, u.name AS user_name
    FROM teams t JOIN team_members tm ON tm.team_id=t.team_id JOIN users u ON u.id=tm.user_id
    WHERE t.team_id=? AND tm.user_id=?${lock ? ' FOR UPDATE' : ''}`,
    [positiveId(teamId), positiveId(userId)],
  );
  if (!rows.length)
    throw new JourneyError('참여한 팀에서만 사용할 수 있습니다.', 403);
  return rows[0];
};
const requireLeader = (team, userId) => {
  if (Number(team.leader_user_id) !== Number(userId))
    throw new JourneyError('팀장만 변경할 수 있습니다.', 403);
};
const isComplete = team =>
  team.activity_status === 'COMPLETED' || team.status === 'ARCHIVED';

const createTeam = async (db, userId, input) => {
  const name = textValue(input.team_name, 120, true);
  const dueDate = input.due_date ? validDate(input.due_date) : null;
  const capacity = Number(input.required_members || 5);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 30)
    throw new JourneyError('인원은 2~30명으로 입력해주세요.');
  const part = textValue(input.part, 100) || '팀장';
  const activityId = input.activity_id ? positiveId(input.activity_id) : null;
  return transaction(db, async connection => {
    const [users] = await connection.query('SELECT id FROM users WHERE id=?', [
      userId,
    ]);
    if (!users.length) throw new JourneyError('다시 로그인해주세요.', 401);
    if (activityId) {
      const [activities] = await connection.query(
        'SELECT activity_id FROM activitys WHERE activity_id=?',
        [activityId],
      );
      if (!activities.length)
        throw new JourneyError('활동을 찾을 수 없습니다.', 404);
    }
    const [created] = await connection.query(
      `INSERT INTO teams (team_name,leader_user_id,required_members,due_date,source_type,source_id,participation_mode,visibility) VALUES (?,?,?,?,?,?,'TEAM','PRIVATE')`,
      [
        name,
        userId,
        capacity,
        dueDate,
        activityId ? 'COMPETITION' : 'USER_CREATED',
        activityId,
      ],
    );
    const teamId = created.insertId;
    await connection.query(
      "INSERT INTO team_members (team_id,user_id,role,part) VALUES (?,?,'LEADER',?)",
      [teamId, userId, part],
    );
    const template = TEMPLATES[0];
    const [document] = await connection.query(
      'INSERT INTO activity_documents (team_id,author_id,last_editor_id,title,content_markdown) VALUES (?,?,?,?,?)',
      [teamId, userId, userId, template.title, template.markdown],
    );
    const [task] = await connection.query(
      "INSERT INTO todos (team_id,assigned_user_id,title,scope_type,scope_start_date,scope_end_date) VALUES (?,?,'첫 모임에서 목표와 역할 정하기','주간',DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY),DATE_ADD(DATE_SUB(CURDATE(),INTERVAL WEEKDAY(CURDATE()) DAY),INTERVAL 6 DAY))",
      [teamId, userId],
    );
    await connection.query(
      'INSERT INTO journey_task_documents (todo_id,document_id) VALUES (?,?)',
      [task.insertId, document.insertId],
    );
    return { team_id: teamId };
  });
};

const getWorkspace = async (db, teamId, userId) => {
  const team = await requireMember(db, teamId, userId);
  const [members] = await db.query(
    'SELECT tm.user_id,tm.part,tm.role,u.name FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? ORDER BY tm.role,tm.user_id',
    [teamId],
  );
  const [tasks] = await db.query(
    `SELECT t.todo_id,t.title,t.assigned_user_id,t.status,t.scope_type,t.scope_start_date,t.scope_end_date,u.name AS assignee_name,td.document_id FROM todos t JOIN users u ON u.id=t.assigned_user_id LEFT JOIN journey_task_documents td ON td.todo_id=t.todo_id WHERE t.team_id=? ORDER BY t.scope_end_date DESC,t.todo_id DESC LIMIT 500`,
    [teamId],
  );
  const [documents] = await db.query(
    'SELECT document_id,title,version,updated_at FROM activity_documents WHERE team_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200',
    [teamId],
  );
  const [records] = await db.query(
    `SELECT r.*,u.name AS author_name,COALESCE(t.status,'삭제된 작업') AS task_status,d.title AS document_title,
    (SELECT COUNT(*) FROM journey_confirmations c WHERE c.record_id=r.record_id AND c.record_version=r.version) AS confirmation_count,
    EXISTS(SELECT 1 FROM journey_confirmations c WHERE c.record_id=r.record_id AND c.user_id=? AND c.record_version=r.version) AS confirmed_by_me
    FROM journey_records r JOIN users u ON u.id=r.user_id LEFT JOIN todos t ON t.todo_id=r.todo_id
    LEFT JOIN activity_documents d ON d.document_id=r.document_id AND d.deleted_at IS NULL
    WHERE r.team_id=? ORDER BY r.created_at DESC,r.record_id DESC LIMIT 500`,
    [userId, teamId],
  );
  const [states] = await db.query(
    'SELECT phase FROM journey_team_state WHERE team_id=?',
    [teamId],
  );
  const [portfolios] = await db.query(
    'SELECT portfolio_id FROM miniportfolios WHERE team_id=? AND user_id=?',
    [teamId, userId],
  );
  return {
    team: {
      ...team,
      due_date: formatDateOnly(team.due_date),
      phase: isComplete(team) ? 'COMPLETED' : states[0]?.phase || 'IN_PROGRESS',
    },
    members,
    tasks: tasks.map(task => ({
      ...task,
      scope_start_date: formatDateOnly(task.scope_start_date),
      scope_end_date: formatDateOnly(task.scope_end_date),
    })),
    documents,
    records,
    portfolio_id: portfolios[0]?.portfolio_id || null,
  };
};

const saveRecord = async (db, teamId, userId, input) => {
  const todoId = positiveId(input.todo_id);
  const documentId = input.document_id ? positiveId(input.document_id) : null;
  const contribution = textValue(input.contribution, 2000, true);
  const outcome = textValue(input.outcome, 2000);
  const url = safeUrl(input.artifact_url);
  if (!documentId && !url)
    throw new JourneyError('관련 문서나 결과물 링크를 하나 이상 연결해주세요.');
  return transaction(db, async connection => {
    await requireMember(connection, teamId, userId, true);
    const [tasks] = await connection.query(
      'SELECT title FROM todos WHERE todo_id=? AND team_id=?',
      [todoId, teamId],
    );
    if (!tasks.length) throw new JourneyError('이 팀의 작업을 선택해주세요.');
    if (documentId) {
      const [docs] = await connection.query(
        'SELECT document_id FROM activity_documents WHERE document_id=? AND team_id=? AND deleted_at IS NULL',
        [documentId, teamId],
      );
      if (!docs.length) throw new JourneyError('이 팀의 문서를 선택해주세요.');
    }
    await connection.query(
      `INSERT INTO journey_records (team_id,user_id,todo_id,document_id,title,contribution,outcome,artifact_url) VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE document_id=VALUES(document_id),title=VALUES(title),contribution=VALUES(contribution),outcome=VALUES(outcome),artifact_url=VALUES(artifact_url),version=version+1`,
      [
        teamId,
        userId,
        todoId,
        documentId,
        tasks[0].title,
        contribution,
        outcome,
        url,
      ],
    );
    const [rows] = await connection.query(
      'SELECT record_id FROM journey_records WHERE team_id=? AND user_id=? AND todo_id=?',
      [teamId, userId, todoId],
    );
    await connection.query(
      'DELETE FROM journey_confirmations WHERE record_id=?',
      [rows[0].record_id],
    );
    return rows[0];
  });
};

const confirmRecord = (db, teamId, userId, recordId, version, confirm) =>
  transaction(db, async connection => {
    await requireMember(connection, teamId, userId, true);
    const [rows] = await connection.query(
      'SELECT user_id,version FROM journey_records WHERE record_id=? AND team_id=? FOR UPDATE',
      [positiveId(recordId), teamId],
    );
    if (!rows.length) throw new JourneyError('기록을 찾을 수 없습니다.', 404);
    if (Number(rows[0].user_id) === Number(userId))
      throw new JourneyError('자신의 기여는 직접 확인할 수 없습니다.');
    if (Number(rows[0].version) !== Number(version))
      throw new JourneyError('기록이 수정됐습니다. 새로 확인해주세요.', 409);
    if (confirm)
      await connection.query(
        'INSERT INTO journey_confirmations (record_id,user_id,record_version) VALUES (?,?,?) ON DUPLICATE KEY UPDATE record_version=VALUES(record_version)',
        [recordId, userId, version],
      );
    else
      await connection.query(
        'DELETE FROM journey_confirmations WHERE record_id=? AND user_id=?',
        [recordId, userId],
      );
  });

const getDraft = async (db, teamId, userId) => {
  const workspace = await getWorkspace(db, teamId, userId);
  const [rows] = await db.query(
    'SELECT summary,reflection FROM journey_reflections WHERE team_id=? AND user_id=?',
    [teamId, userId],
  );
  const [shares] = await db.query(
    'SELECT token,published_at FROM journey_shares WHERE team_id=? AND user_id=? AND token IS NOT NULL',
    [teamId, userId],
  );
  const ownTasks = workspace.tasks.filter(
    task =>
      Number(task.assigned_user_id) === Number(userId) &&
      task.status === '완료',
  );
  const saved = workspace.portfolio_id
    ? await getMiniPortfolio(db, userId, workspace.portfolio_id)
    : null;
  const records = workspace.records.filter(
    record => Number(record.user_id) === Number(userId),
  );
  return {
    ...workspace,
    records,
    activity_name: saved?.activity_name || workspace.team.team_name,
    user_name: workspace.team.user_name,
    role: saved?.role || workspace.team.part || '팀원',
    summary: rows[0]?.summary ?? saved?.summary ?? '',
    reflection: rows[0]?.reflection ?? saved?.reflection ?? '',
    period:
      saved?.period ||
      `${formatDateOnly(workspace.team.created_at)} ~ ${
        formatDateOnly(workspace.team.due_date) || '진행 중'
      }`,
    completed_task_count: ownTasks.length,
    completed_tasks: saved?.completed_tasks || groupCompletedTasks(ownTasks),
    member_count: workspace.members.length,
    share: shares[0] || null,
  };
};

const saveReflection = async (db, teamId, userId, input) => {
  await requireMember(db, teamId, userId);
  const summary = textValue(input.summary, 4000);
  const reflection = textValue(input.reflection, 5000);
  await db.query(
    'INSERT INTO journey_reflections (team_id,user_id,summary,reflection) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE summary=VALUES(summary),reflection=VALUES(reflection)',
    [teamId, userId, summary, reflection],
  );
};

// Public output is an allowlist. Internal documents, IDs, other members and raw reviews never leave it.
const buildPublicSnapshot = (draft, input) => {
  if (!Array.isArray(input.record_ids) || input.record_ids.length > 30)
    throw new JourneyError('공유할 기록을 30개 이내로 선택해주세요.');
  const ids = [...new Set(input.record_ids.map(positiveId))];
  if (!ids.length)
    throw new JourneyError('공유할 기여 기록을 하나 이상 선택해주세요.');
  const selected = ids.map(id =>
    draft.records.find(record => Number(record.record_id) === id),
  );
  if (selected.some(record => !record))
    throw new JourneyError('본인의 기록만 공유할 수 있습니다.', 403);
  return {
    activity_name: draft.activity_name,
    user_name: draft.user_name,
    role: draft.role,
    period: draft.period,
    phase: draft.team.phase,
    summary: draft.summary,
    reflection: input.include_reflection === true ? draft.reflection : '',
    records: selected.map(record => ({
      title: record.title,
      contribution: record.contribution,
      outcome: record.outcome,
      artifact_url: input.include_links === true ? record.artifact_url : '',
      task_status: record.task_status,
      confirmation_count: Number(record.confirmation_count),
    })),
  };
};
const publishShare = async (db, teamId, userId, input) => {
  const draft = await getDraft(db, teamId, userId);
  const snapshot = buildPublicSnapshot(draft, input);
  const token = newToken();
  await db.query(
    'INSERT INTO journey_shares (team_id,user_id,token,snapshot,published_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE token=VALUES(token),snapshot=VALUES(snapshot),published_at=NOW()',
    [teamId, userId, token, JSON.stringify(snapshot)],
  );
  return { token, snapshot };
};
const revokeShare = async (db, teamId, userId) => {
  await requireMember(db, teamId, userId);
  await db.query(
    'UPDATE journey_shares SET token=NULL,snapshot=NULL WHERE team_id=? AND user_id=?',
    [teamId, userId],
  );
};
const getPublicShare = async (db, token) => {
  checkToken(token);
  const [rows] = await db.query(
    'SELECT s.snapshot,s.published_at FROM journey_shares s JOIN users u ON u.id=s.user_id JOIN team_members tm ON tm.team_id=s.team_id AND tm.user_id=s.user_id WHERE s.token=?',
    [token],
  );
  if (!rows.length)
    throw new JourneyError('유효하지 않거나 해제된 링크입니다.', 404);
  return { ...json(rows[0].snapshot, {}), published_at: rows[0].published_at };
};

const createInvite = (db, teamId, userId) =>
  transaction(db, async connection => {
    const team = await requireMember(connection, teamId, userId, true);
    requireLeader(team, userId);
    if (isComplete(team))
      throw new JourneyError('완료한 활동에는 초대할 수 없습니다.', 409);
    const token = newToken();
    await connection.query(
      'INSERT INTO journey_invites (team_id,token,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 7 DAY)) ON DUPLICATE KEY UPDATE token=VALUES(token),expires_at=VALUES(expires_at)',
      [teamId, token],
    );
    return { token };
  });
const revokeInvite = (db, teamId, userId) =>
  transaction(db, async connection => {
    requireLeader(
      await requireMember(connection, teamId, userId, true),
      userId,
    );
    await connection.query(
      'UPDATE journey_invites SET token=NULL WHERE team_id=?',
      [teamId],
    );
  });
const getInvite = async (db, token) => {
  checkToken(token);
  const [rows] = await db.query(
    `SELECT t.team_id,t.team_name,t.required_members,t.due_date FROM journey_invites i JOIN teams t ON t.team_id=i.team_id WHERE i.token=? AND i.expires_at>NOW() AND t.activity_status='IN_PROGRESS' AND t.status<>'ARCHIVED'`,
    [token],
  );
  if (!rows.length)
    throw new JourneyError('만료되었거나 해제된 초대입니다.', 404);
  return { ...rows[0], due_date: formatDateOnly(rows[0].due_date) };
};
const acceptInvite = (db, token, userId, part, provision = async () => {}) =>
  transaction(db, async connection => {
    const [users] = await connection.query('SELECT id FROM users WHERE id=?', [
      userId,
    ]);
    if (!users.length) throw new JourneyError('다시 로그인해주세요.', 401);
    const invite = await getInvite(connection, token);
    // All join/close operations serialize on the same team row.
    const [teams] = await connection.query(
      'SELECT * FROM teams WHERE team_id=? FOR UPDATE',
      [invite.team_id],
    );
    if (isComplete(teams[0])) throw new JourneyError('완료한 활동입니다.', 409);
    // Locking reads see joins and revocations committed while we waited for the team lock.
    const [validInvites] = await connection.query(
      'SELECT team_id FROM journey_invites WHERE team_id=? AND token=? AND expires_at>NOW() FOR UPDATE',
      [invite.team_id, token],
    );
    if (!validInvites.length)
      throw new JourneyError('만료되었거나 해제된 초대입니다.', 404);
    const [members] = await connection.query(
      'SELECT user_id FROM team_members WHERE team_id=? FOR UPDATE',
      [invite.team_id],
    );
    if (members.some(member => Number(member.user_id) === Number(userId)))
      return { team_id: invite.team_id };
    if (members.length >= Number(teams[0].required_members))
      throw new JourneyError('팀 정원이 찼습니다.', 409);
    await connection.query(
      "INSERT INTO team_members (team_id,user_id,role,part) VALUES (?,?,'MEMBER',?)",
      [invite.team_id, userId, textValue(part, 100) || null],
    );
    await provision(connection, invite.team_id, userId);
    return { team_id: invite.team_id };
  });

const saveTask = (db, teamId, userId, input) =>
  transaction(db, async connection => {
    const team = await requireMember(connection, teamId, userId, true);
    if (isComplete(team))
      throw new JourneyError(
        '완료한 활동에는 새 작업을 추가할 수 없습니다.',
        409,
      );
    const assigned = positiveId(input.assigned_user_id || userId);
    await requireMember(connection, teamId, assigned);
    const title = textValue(input.title, 255, true);
    const end = validDate(input.due_date);
    const documentId = input.document_id ? positiveId(input.document_id) : null;
    if (documentId) {
      const [docs] = await connection.query(
        'SELECT document_id FROM activity_documents WHERE document_id=? AND team_id=? AND deleted_at IS NULL',
        [documentId, teamId],
      );
      if (!docs.length) throw new JourneyError('이 팀의 문서를 선택해주세요.');
    }
    const [created] = await connection.query(
      "INSERT INTO todos (team_id,assigned_user_id,title,scope_type,scope_start_date,scope_end_date) VALUES (?,?,?,'일일',?,?)",
      [teamId, assigned, title, end, end],
    );
    if (documentId)
      await connection.query(
        'INSERT INTO journey_task_documents (todo_id,document_id) VALUES (?,?)',
        [created.insertId, documentId],
      );
    return { todo_id: created.insertId };
  });

const deleteJourneyUserData = async (db, userId) => {
  positiveId(userId);
  await db.query('DELETE FROM journey_shares WHERE user_id=?', [userId]);
  await db.query('DELETE FROM journey_reflections WHERE user_id=?', [userId]);
  await db.query(
    'DELETE FROM journey_confirmations WHERE user_id=? OR record_id IN (SELECT record_id FROM journey_records WHERE user_id=?)',
    [userId, userId],
  );
  await db.query('DELETE FROM journey_records WHERE user_id=?', [userId]);
  await db.query(
    'UPDATE journey_invites SET token=NULL WHERE team_id IN (SELECT team_id FROM teams WHERE leader_user_id=?)',
    [userId],
  );
};

module.exports = {
  deleteJourneyUserData,
  JourneyError,
  TEMPLATES,
  positiveId,
  textValue,
  safeUrl,
  validDate,
  transaction,
  ensureJourneySchema,
  requireMember,
  requireLeader,
  isComplete,
  createTeam,
  getWorkspace,
  saveRecord,
  confirmRecord,
  getDraft,
  saveReflection,
  buildPublicSnapshot,
  publishShare,
  revokeShare,
  getPublicShare,
  createInvite,
  revokeInvite,
  getInvite,
  acceptInvite,
  saveTask,
};
