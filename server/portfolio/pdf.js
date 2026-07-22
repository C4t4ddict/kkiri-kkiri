const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const REGULAR_FONT = path.join(
  __dirname,
  '..',
  'node_modules',
  '@fontsource',
  'noto-sans-kr',
  'files',
  'noto-sans-kr-korean-400-normal.woff',
);
const BOLD_FONT = path.join(
  __dirname,
  '..',
  'node_modules',
  '@fontsource',
  'noto-sans-kr',
  'files',
  'noto-sans-kr-korean-700-normal.woff',
);

const PURPLE = '#6F4CF6';
const PURPLE_DARK = '#3F277D';
const PURPLE_SOFT = '#F2EEFF';
const INK = '#172033';
const MUTED = '#667085';
const BORDER = '#E7E3F5';
const TASK_CONTENT_TOP = 136;
const TASK_CONTENT_BOTTOM = 770;
const TASK_CARD_HEADER_HEIGHT = 50;
const TASK_ROW_HEIGHT = 37;
const TASK_SECTION_GAP = 14;

const taskSections = [
  ['monthly', '월간 목표'],
  ['weekly', '주간 목표'],
  ['daily', '일일 목표'],
  ['overall', '기타 완료 작업'],
];

const drawRoundedCard = (doc, x, y, width, height, fill = '#FFFFFF', stroke = BORDER) => {
  doc.roundedRect(x, y, width, height, 16).fillAndStroke(fill, stroke);
};

const drawMetric = (doc, x, y, width, label, value) => {
  const valueText = String(value);
  drawRoundedCard(doc, x, y, width, 76, '#FFFFFF', BORDER);
  doc.font('Regular').fontSize(9).fillColor(MUTED).text(label, x + 14, y + 13, { width: width - 28 });
  doc.font('Bold').fontSize(valueText.length > 14 ? 12 : 16).fillColor(INK).text(valueText, x + 14, y + 35, {
    width: width - 28,
    ellipsis: true,
  });
};

const drawHeader = (doc, portfolio) => {
  doc.rect(0, 0, 595.28, 292).fill(PURPLE_DARK);
  doc.circle(520, 28, 120).fillOpacity(0.12).fill('#FFFFFF');
  doc.circle(70, 255, 105).fillOpacity(0.08).fill('#FFFFFF');
  doc.fillOpacity(1);

  doc.font('Bold').fontSize(10).fillColor('#DAD1FF').text('KKIRI KKIRI · MINI PORTFOLIO', 48, 48);
  doc.font('Bold').fontSize(29).fillColor('#FFFFFF').text(portfolio.activity_name || '미니포트폴리오', 48, 88, {
    width: 490,
    lineGap: 5,
  });
  doc.font('Regular').fontSize(11).fillColor('#E7E0FF').text(
    `${portfolio.user_name || ''} · ${portfolio.role || '역할 미정'}`,
    48,
    176,
  );
  doc.roundedRect(48, 212, 140, 32, 16).fill(PURPLE);
  doc.font('Bold').fontSize(10).fillColor('#FFFFFF').text(portfolio.activity_type || '팀 활동', 62, 222, {
    width: 112,
    align: 'center',
  });
};

const addCoverPage = (doc, portfolio) => {
  drawHeader(doc, portfolio);

  if (portfolio.cover_image_path && fs.existsSync(portfolio.cover_image_path)) {
    try {
      doc.roundedRect(397, 188, 150, 104, 14).save().clip();
      doc.image(portfolio.cover_image_path, 397, 188, { fit: [150, 104], align: 'center', valign: 'center' });
      doc.restore();
    } catch {
      doc.restore();
    }
  }

  doc.font('Bold').fontSize(17).fillColor(INK).text('활동 한눈에 보기', 48, 326);
  const metricWidth = 153;
  drawMetric(doc, 48, 360, metricWidth, '활동 기간', portfolio.period || '-');
  drawMetric(doc, 221, 360, metricWidth, '완료 작업', `${portfolio.completed_task_count || 0}건`);
  drawMetric(doc, 394, 360, metricWidth, '함께한 인원', `${portfolio.member_count || 1}명`);

  drawRoundedCard(doc, 48, 462, 499, 176, PURPLE_SOFT, '#DDD3FF');
  doc.font('Bold').fontSize(11).fillColor(PURPLE).text('ACTIVITY SUMMARY', 68, 486);
  doc.font('Bold').fontSize(19).fillColor(INK).text('나의 활동 요약', 68, 511);
  doc.font('Regular').fontSize(12).fillColor(MUTED).text(
    portfolio.summary || `${portfolio.activity_name || '활동'}에서 맡은 역할과 완료 작업을 정리했습니다.`,
    68,
    548,
    { width: 456, lineGap: 6 },
  );

  doc.font('Regular').fontSize(9).fillColor('#98A2B3').text(
    `생성일 ${new Date().toISOString().slice(0, 10)}  ·  끼리끼리 미니포트폴리오`,
    48,
    790,
    { width: 499, align: 'center' },
  );
};

const splitTextByHeight = (doc, text, width, maxHeight) => {
  const tokens = String(text || '').split(/(\s+)/).filter(Boolean);
  const chunks = [];
  let current = '';

  tokens.forEach((token) => {
    const whitespace = /^\s+$/.test(token);
    const normalized = whitespace
      ? (token.includes('\n') ? '\n'.repeat(Math.min(2, (token.match(/\n/g) || []).length)) : ' ')
      : token;
    const candidate = `${current}${normalized}`;
    if (current.trim() && doc.heightOfString(candidate, { width, lineGap: 5 }) > maxHeight) {
      chunks.push(current.trim());
      current = whitespace ? '' : token;
    } else {
      current = candidate;
    }
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

const getNarrativeBlocks = (doc, portfolio) => {
  const blocks = [];
  const achievementText = (portfolio.achievements || []).map((item) => `• ${item}`).join('\n');
  if (achievementText) blocks.push({ title: '핵심 성과', body: achievementText });
  if (portfolio.reflection) blocks.push({ title: '활동 회고', body: portfolio.reflection });
  const linkText = (portfolio.links || []).map((link) => `${link.title || '관련 링크'}\n${link.url}`).join('\n\n');
  if (linkText) blocks.push({ title: '관련 링크', body: linkText });

  return blocks.flatMap((block) => {
    const chunks = splitTextByHeight(doc, block.body, 455, 470);
    return chunks.map((body, index) => ({
      title: index ? `${block.title} · 계속` : block.title,
      body,
    }));
  });
};

const drawNarrativeHeader = (doc, pageIndex) => {
  doc.rect(0, 0, 595.28, 108).fill(PURPLE_DARK);
  doc.font('Bold').fontSize(10).fillColor('#DAD1FF').text('02 · STORY & OUTCOME', 48, 34);
  doc.font('Bold').fontSize(23).fillColor('#FFFFFF').text('성과와 활동 회고', 48, 58);
  doc.font('Bold').fontSize(9).fillColor('#DAD1FF').text(String(pageIndex + 1).padStart(2, '0'), 500, 68, {
    width: 47,
    align: 'right',
  });
};

const addNarrativePages = (doc, portfolio) => {
  const blocks = getNarrativeBlocks(doc, portfolio);
  if (!blocks.length) return;
  let pageIndex = -1;
  let y = 0;

  const startPage = () => {
    doc.addPage();
    pageIndex += 1;
    drawNarrativeHeader(doc, pageIndex);
    y = 136;
  };

  blocks.forEach((block) => {
    doc.font('Regular').fontSize(11);
    const bodyHeight = doc.heightOfString(block.body, { width: 455, lineGap: 5 });
    const cardHeight = Math.max(104, bodyHeight + 72);
    if (pageIndex < 0 || y + cardHeight > 780) startPage();
    drawRoundedCard(doc, 48, y, 499, cardHeight, '#FFFFFF', BORDER);
    doc.font('Bold').fontSize(11).fillColor(PURPLE).text(block.title, 70, y + 22, { width: 455 });
    doc.font('Regular').fontSize(11).fillColor(INK).text(block.body, 70, y + 50, {
      width: 455,
      lineGap: 5,
      link: /^https?:\/\//.test(block.body) ? block.body : undefined,
    });
    y += cardHeight + 14;
  });
};

const buildTaskPages = (groups = {}) => {
  const pages = [];
  let currentPage = [];
  let remainingHeight = TASK_CONTENT_BOTTOM - TASK_CONTENT_TOP;

  const startNewPage = () => {
    if (currentPage.length) pages.push(currentPage);
    currentPage = [];
    remainingHeight = TASK_CONTENT_BOTTOM - TASK_CONTENT_TOP;
  };

  taskSections.forEach(([key, title]) => {
    const tasks = Array.isArray(groups[key]) ? groups[key] : [];
    let offset = 0;

    while (offset < tasks.length) {
      const minimumHeight = TASK_CARD_HEADER_HEIGHT + TASK_ROW_HEIGHT;
      if (remainingHeight < minimumHeight) startNewPage();

      const maxItems = Math.max(
        1,
        Math.floor((remainingHeight - TASK_CARD_HEADER_HEIGHT) / TASK_ROW_HEIGHT),
      );
      const chunk = tasks.slice(offset, offset + maxItems);
      const height = TASK_CARD_HEADER_HEIGHT + (chunk.length * TASK_ROW_HEIGHT);

      currentPage.push({
        key,
        title,
        tasks: chunk,
        offset,
        total: tasks.length,
        height,
      });
      offset += chunk.length;
      remainingHeight -= height + TASK_SECTION_GAP;
    }
  });

  if (currentPage.length) pages.push(currentPage);
  return pages;
};

const drawTaskPageHeader = (doc, pageIndex, sectionNumber) => {
  doc.rect(0, 0, 595.28, 108).fill(PURPLE_DARK);
  doc.font('Bold').fontSize(10).fillColor('#DAD1FF').text(
    pageIndex === 0
      ? `${sectionNumber} · COMPLETED WORK`
      : `${sectionNumber} · COMPLETED WORK · CONTINUED`,
    48,
    34,
  );
  doc.font('Bold').fontSize(23).fillColor('#FFFFFF').text('담당해서 완료한 작업', 48, 58);
  doc.font('Bold').fontSize(9).fillColor('#DAD1FF').text(
    String(pageIndex + 1).padStart(2, '0'),
    500,
    68,
    { width: 47, align: 'right' },
  );
};

const drawTaskSection = (doc, section, y) => {
  drawRoundedCard(doc, 48, y, 499, section.height, '#FFFFFF', BORDER);
  doc.roundedRect(64, y + 16, 92, 24, 12).fill(PURPLE_SOFT);
  doc.font('Bold').fontSize(9).fillColor(PURPLE).text(
    section.offset > 0 ? `${section.title} · 계속` : section.title,
    70,
    y + 23,
    { width: 80, align: 'center' },
  );
  doc.font('Regular').fontSize(9).fillColor(MUTED).text(
    `${section.offset + 1}–${section.offset + section.tasks.length} / ${section.total}`,
    408,
    y + 22,
    { width: 116, align: 'right' },
  );

  section.tasks.forEach((task, index) => {
    const taskY = y + 51 + (index * TASK_ROW_HEIGHT);
    doc.circle(74, taskY + 7, 7).fill(PURPLE);
    doc.font('Regular').fontSize(11).fillColor(INK).text(task.title, 92, taskY, {
      width: 418,
      ellipsis: true,
    });
  });
};

const addTaskPage = (doc, portfolio) => {
  const groups = portfolio.completed_tasks || {};
  const pages = buildTaskPages(groups);
  const hasNarrative = getNarrativeBlocks(doc, portfolio).length > 0;
  const sectionNumber = hasNarrative ? '03' : '02';

  if (!pages.length) {
    doc.addPage();
    drawTaskPageHeader(doc, 0, sectionNumber);
    drawRoundedCard(doc, 48, TASK_CONTENT_TOP, 499, 88, '#FAFAFC', BORDER);
    doc.font('Regular').fontSize(12).fillColor(MUTED).text(
      '기록된 완료 작업이 없습니다.',
      68,
      TASK_CONTENT_TOP + 34,
    );
    return;
  }

  pages.forEach((sections, pageIndex) => {
    doc.addPage();
    drawTaskPageHeader(doc, pageIndex, sectionNumber);
    let y = TASK_CONTENT_TOP;
    sections.forEach((section) => {
      drawTaskSection(doc, section, y);
      y += section.height + TASK_SECTION_GAP;
    });
  });
};

const createMiniPortfolioPdf = (portfolio) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, info: {
    Title: `${portfolio.activity_name || '활동'} 미니포트폴리오`,
    Author: portfolio.user_name || '끼리끼리 사용자',
    Subject: '끼리끼리 활동 미니포트폴리오',
  } });
  doc.registerFont('Regular', REGULAR_FONT);
  doc.registerFont('Bold', BOLD_FONT);
  addCoverPage(doc, portfolio);
  addNarrativePages(doc, portfolio);
  addTaskPage(doc, portfolio);
  doc.end();
  return doc;
};

module.exports = { buildTaskPages, createMiniPortfolioPdf };
