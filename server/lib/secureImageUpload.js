const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ALLOWED_IMAGES = {
  '.jpg': { mime: 'image/jpeg', format: 'jpeg' },
  '.jpeg': { mime: 'image/jpeg', format: 'jpeg' },
  '.png': { mime: 'image/png', format: 'png' },
  '.webp': { mime: 'image/webp', format: 'webp' },
};

const inspectImageName = (originalName, mimeType) => {
  const baseName = path.basename(String(originalName || ''));
  if (!baseName || baseName.startsWith('.') || baseName.split('.').length !== 2) return null;
  const extension = path.extname(baseName).toLowerCase();
  const allowed = ALLOWED_IMAGES[extension];
  if (!allowed || allowed.mime !== String(mimeType || '').toLowerCase()) return null;
  return { extension, format: allowed.format };
};

const detectImageFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

const createSecureImageUpload = (uploadsDir, maximumBytes = 5 * 1024 * 1024) => {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maximumBytes, files: 1 },
    fileFilter: (req, file, callback) => {
      const inspected = inspectImageName(file.originalname, file.mimetype);
      callback(inspected ? null : new Error('JPEG, PNG, WEBP 단일 확장자 이미지만 업로드할 수 있습니다'), Boolean(inspected));
    },
  }).single('image');

  return (req, res, next) => parser(req, res, (parseError) => {
    if (parseError) {
      const message = parseError.code === 'LIMIT_FILE_SIZE'
        ? '이미지는 5MB 이하만 업로드할 수 있습니다'
        : parseError.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) return res.status(400).json({ success: false, message: '이미지 파일이 필요합니다' });

    const inspected = inspectImageName(req.file.originalname, req.file.mimetype);
    const detectedFormat = detectImageFormat(req.file.buffer);
    if (!inspected || detectedFormat !== inspected.format) {
      return res.status(400).json({ success: false, message: '파일 내용과 이미지 형식이 일치하지 않습니다' });
    }

    fs.mkdirSync(uploadsDir, { recursive: true });
    const normalizedExtension = detectedFormat === 'jpeg' ? '.jpg' : `.${detectedFormat}`;
    const fileName = `${crypto.randomUUID()}${normalizedExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer, { flag: 'wx', mode: 0o600 });
    req.file.filename = fileName;
    req.file.path = filePath;
    delete req.file.buffer;
    next();
  });
};

module.exports = { createSecureImageUpload, detectImageFormat, inspectImageName };
