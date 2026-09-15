const express = require('express');
const {
  ActivityDocumentError,
  createActivityDocument,
  deleteActivityDocument,
  getActivityDocument,
  listActivityDocuments,
  updateActivityDocument,
} = require('./service');

const parsePositiveId = (value, field) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ActivityDocumentError(`${field} 정보가 올바르지 않습니다`, {
      statusCode: 400,
      code: 'INVALID_ACTIVITY_DOCUMENT_ID',
      details: { field },
    });
  }
  return id;
};

const parseListLimit = (value) => {
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? Math.min(200, Math.max(1, limit)) : 100;
};

const createActivityDocumentsRouter = ({
  database,
  getRequestUserId,
  getSchemaReady = () => Promise.resolve(),
  logError = console.error,
}) => {
  const router = express.Router({ mergeParams: true });

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  const handle = (operation) => async (req, res) => {
    try {
      await getSchemaReady();
      const userId = Number(getRequestUserId(req));
      if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(401).json({ message: '로그인이 필요합니다' });
      }
      return await operation(req, res, userId);
    } catch (error) {
      if (error instanceof ActivityDocumentError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
          ...(error.details || {}),
        });
      }
      logError('활동 문서 처리 오류:', error);
      return res.status(500).json({ message: '활동 문서를 처리하지 못했습니다' });
    }
  };

  router.get('/', handle(async (req, res, userId) => {
    const teamId = parsePositiveId(req.params.teamId, '활동');
    const documents = await listActivityDocuments(database, teamId, userId, parseListLimit(req.query.limit));
    return res.json(documents);
  }));

  router.post('/', handle(async (req, res, userId) => {
    const teamId = parsePositiveId(req.params.teamId, '활동');
    const document = await createActivityDocument(database, teamId, userId, req.body);
    return res.status(201).json(document);
  }));

  router.get('/:documentId', handle(async (req, res, userId) => {
    const teamId = parsePositiveId(req.params.teamId, '활동');
    const documentId = parsePositiveId(req.params.documentId, '문서');
    const document = await getActivityDocument(database, teamId, userId, documentId);
    return res.json(document);
  }));

  router.put('/:documentId', handle(async (req, res, userId) => {
    const teamId = parsePositiveId(req.params.teamId, '활동');
    const documentId = parsePositiveId(req.params.documentId, '문서');
    const document = await updateActivityDocument(database, teamId, userId, documentId, req.body);
    return res.json(document);
  }));

  router.delete('/:documentId', handle(async (req, res, userId) => {
    const teamId = parsePositiveId(req.params.teamId, '활동');
    const documentId = parsePositiveId(req.params.documentId, '문서');
    const document = await deleteActivityDocument(
      database,
      teamId,
      userId,
      documentId,
      req.body?.version,
    );
    return res.json({
      success: true,
      document_id: document.document_id,
      version: document.version,
      deleted_at: document.deleted_at,
    });
  }));

  return router;
};

module.exports = {
  createActivityDocumentsRouter,
  parseListLimit,
  parsePositiveId,
};
