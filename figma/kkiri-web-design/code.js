const C = {
  brand: '#7A5AF8',
  brandDark: '#5B21B6',
  brandDeep: '#3F277D',
  brandLight: '#A48CFF',
  brandSoft: '#F4F1FF',
  canvas: '#F7F8FC',
  surface: '#FFFFFF',
  text: '#101828',
  textSub: '#667085',
  textMuted: '#98A2B3',
  border: '#E4E7EC',
  borderStrong: '#D0D5DD',
  success: '#027A48',
  successSoft: '#ECFDF3',
  warning: '#B54708',
  warningSoft: '#FFF7E8',
  danger: '#B42318',
  dangerSoft: '#FEF3F2',
  inkPurple: '#211A3B',
};

let fonts = {
  regular: { family: 'Noto Sans KR', style: 'Regular' },
  medium: { family: 'Noto Sans KR', style: 'Medium' },
  bold: { family: 'Noto Sans KR', style: 'Bold' },
  black: { family: 'Noto Sans KR', style: 'Black' },
};

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function fill(hex, opacity = 1) {
  return { type: 'SOLID', color: rgb(hex), opacity };
}

function gradient(from, to) {
  return [{
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
      { position: 0, color: { ...rgb(from), a: 1 } },
      { position: 1, color: { ...rgb(to), a: 1 } },
    ],
  }];
}

async function loadFonts() {
  try {
    await Promise.all(Object.values(fonts).map((font) => figma.loadFontAsync(font)));
  } catch (_) {
    fonts = {
      regular: { family: 'Inter', style: 'Regular' },
      medium: { family: 'Inter', style: 'Medium' },
      bold: { family: 'Inter', style: 'Bold' },
      black: { family: 'Inter', style: 'Black' },
    };
    await Promise.all(Object.values(fonts).map((font) => figma.loadFontAsync(font)));
  }
}

function autoNode(name, direction = 'VERTICAL', gap = 0, padding = 0, component = false) {
  const node = component ? figma.createComponent() : figma.createFrame();
  node.name = name;
  node.layoutMode = direction;
  node.primaryAxisSizingMode = 'AUTO';
  node.counterAxisSizingMode = 'AUTO';
  node.itemSpacing = gap;
  node.paddingTop = padding;
  node.paddingRight = padding;
  node.paddingBottom = padding;
  node.paddingLeft = padding;
  node.fills = [];
  node.clipsContent = false;
  return node;
}

function fixedWidth(node, width) {
  node.resize(width, Math.max(1, node.height));
  if (node.layoutMode === 'VERTICAL') node.counterAxisSizingMode = 'FIXED';
  if (node.layoutMode === 'HORIZONTAL') node.primaryAxisSizingMode = 'FIXED';
  return node;
}

function fixedHeight(node, height) {
  node.resize(Math.max(1, node.width), height);
  if (node.layoutMode === 'VERTICAL') node.primaryAxisSizingMode = 'FIXED';
  if (node.layoutMode === 'HORIZONTAL') node.counterAxisSizingMode = 'FIXED';
  return node;
}

function stretch(node) {
  node.layoutAlign = 'STRETCH';
  return node;
}

function surface(node, color = C.surface, radius = 0, border = null) {
  node.fills = [fill(color)];
  node.cornerRadius = radius;
  if (border) {
    node.strokes = [fill(border)];
    node.strokeWeight = 1;
  }
  return node;
}

function shadow(node, opacity = 0.08) {
  node.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0.24, g: 0.15, b: 0.49, a: opacity },
    offset: { x: 0, y: 18 },
    radius: 50,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  }];
  return node;
}

function text(value, size = 14, weight = 'regular', color = C.text, width = null, lineHeight = 1.45) {
  const node = figma.createText();
  node.fontName = fonts[weight] || fonts.regular;
  node.fontSize = size;
  node.characters = String(value);
  node.fills = [fill(color)];
  node.lineHeight = { value: size * lineHeight, unit: 'PIXELS' };
  node.textAutoResize = width ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
  if (width) node.resize(width, Math.max(node.height, size * lineHeight));
  return node;
}

function namedText(name, value, size, weight, color, width, lineHeight) {
  const node = text(value, size, weight, color, width, lineHeight);
  node.name = name;
  return node;
}

function icon(glyph = '•', color = C.brand, background = C.brandSoft, size = 42) {
  const frame = autoNode('icon', 'VERTICAL', 0, 0);
  frame.primaryAxisAlignItems = 'CENTER';
  frame.counterAxisAlignItems = 'CENTER';
  surface(frame, background, Math.round(size * 0.32));
  frame.resize(size, size);
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.appendChild(text(glyph, Math.round(size * 0.38), 'bold', color));
  return frame;
}

function divider(color = C.border) {
  const line = figma.createRectangle();
  line.name = 'divider';
  line.resize(100, 1);
  line.fills = [fill(color)];
  line.layoutAlign = 'STRETCH';
  return line;
}

function pill(label, color = C.brandDark, background = C.brandSoft) {
  const node = autoNode('pill', 'HORIZONTAL', 0, 0);
  node.primaryAxisAlignItems = 'CENTER';
  node.counterAxisAlignItems = 'CENTER';
  node.paddingTop = 6;
  node.paddingBottom = 6;
  node.paddingLeft = 10;
  node.paddingRight = 10;
  surface(node, background, 999);
  const labelNode = namedText('label', label, 10, 'bold', color);
  node.appendChild(labelNode);
  return node;
}

function sectionHeading(eyebrow, title, description = '', width = 720) {
  const node = autoNode('section heading', 'VERTICAL', 5, 0);
  fixedWidth(node, width);
  node.appendChild(text(eyebrow, 10, 'black', C.brand));
  node.appendChild(text(title, 28, 'black', C.text, width, 1.25));
  if (description) node.appendChild(text(description, 13, 'regular', C.textSub, width, 1.65));
  return node;
}

function bindTextProperties(component, entries) {
  Object.entries(entries).forEach(([propertyName, node]) => {
    try {
      const id = component.addComponentProperty(propertyName, 'TEXT', node.characters);
      node.componentPropertyReferences = { characters: id };
    } catch (_) {}
  });
}

function findText(node, name) {
  return node.findOne((child) => child.type === 'TEXT' && child.name === name);
}

function instance(component, overrides = {}, width = null, height = null) {
  const node = component.createInstance();
  Object.entries(overrides).forEach(([name, value]) => {
    const target = findText(node, name);
    if (target) target.characters = String(value);
  });
  if (width && height) node.resize(width, height);
  else if (width) node.resize(width, node.height);
  else if (height) node.resize(node.width, height);
  return node;
}

function uniquePage(name) {
  let candidate = name;
  let index = 2;
  while (figma.root.children.some((page) => page.name === candidate)) {
    candidate = `${name} (${index})`;
    index += 1;
  }
  const page = figma.createPage();
  page.name = candidate;
  page.backgrounds = [fill(C.canvas)];
  return page;
}

function componentSection(page, title, x, y, width = 1320) {
  const section = autoNode(title, 'VERTICAL', 20, 24);
  section.x = x;
  section.y = y;
  fixedWidth(section, width);
  surface(section, '#FFFFFF', 24, C.border);
  section.appendChild(text(title, 22, 'black', C.text));
  page.appendChild(section);
  return section;
}

function createButtonComponent(name, label, color, background, border = null) {
  const button = autoNode(name, 'HORIZONTAL', 8, 0, true);
  button.primaryAxisAlignItems = 'CENTER';
  button.counterAxisAlignItems = 'CENTER';
  button.paddingTop = 13;
  button.paddingBottom = 13;
  button.paddingLeft = 18;
  button.paddingRight = 18;
  surface(button, background, 13, border);
  const labelNode = namedText('label', label, 13, 'bold', color);
  button.appendChild(labelNode);
  bindTextProperties(button, { Label: labelNode });
  return button;
}

function createSearchComponent() {
  const search = autoNode('Input / Search', 'HORIZONTAL', 10, 0, true);
  search.counterAxisAlignItems = 'CENTER';
  search.paddingTop = 11;
  search.paddingBottom = 11;
  search.paddingLeft = 15;
  search.paddingRight = 15;
  fixedWidth(search, 360);
  surface(search, C.surface, 13, C.border);
  search.appendChild(text('⌕', 18, 'bold', C.textMuted));
  const placeholder = namedText('placeholder', '활동과 팀을 탐색해보세요', 12, 'regular', C.textMuted, 290);
  search.appendChild(placeholder);
  bindTextProperties(search, { Placeholder: placeholder });
  return search;
}

function createPageTitleComponent() {
  const component = autoNode('Header / Page Title', 'VERTICAL', 5, 0, true);
  fixedWidth(component, 720);
  const eyebrow = namedText('eyebrow', 'EYEBROW', 10, 'black', C.brand);
  const title = namedText('title', '페이지 제목', 38, 'black', C.text, 720, 1.2);
  const description = namedText('description', '페이지를 설명하는 문장입니다.', 13, 'regular', C.textSub, 720, 1.6);
  component.appendChild(eyebrow);
  component.appendChild(title);
  component.appendChild(description);
  bindTextProperties(component, { Eyebrow: eyebrow, Title: title, Description: description });
  return component;
}

function createTopbarComponent(searchComponent) {
  const component = autoNode('Navigation / Topbar', 'HORIZONTAL', 16, 0, true);
  component.primaryAxisAlignItems = 'MAX';
  component.counterAxisAlignItems = 'CENTER';
  component.paddingLeft = 42;
  component.paddingRight = 42;
  fixedWidth(component, 1194);
  fixedHeight(component, 74);
  surface(component, C.canvas, 0);
  component.strokes = [fill(C.border)];
  component.strokeBottomWeight = 1;
  component.appendChild(searchComponent.createInstance());
  component.appendChild(icon('•', C.textSub, C.surface, 42));
  return component;
}

function createSidebarComponent() {
  const component = autoNode('Navigation / Sidebar', 'VERTICAL', 0, 22, true);
  fixedWidth(component, 246);
  fixedHeight(component, 900);
  component.primaryAxisAlignItems = 'SPACE_BETWEEN';
  surface(component, C.surface, 0);
  component.strokes = [fill(C.border)];
  component.strokeRightWeight = 1;

  const top = autoNode('top', 'VERTICAL', 38, 0);
  const logo = namedText('logo', '끼리끼리', 27, 'black', C.brand);
  top.appendChild(logo);
  const nav = autoNode('navigation', 'VERTICAL', 8, 0);
  const items = [['⌂', '홈'], ['▤', '정보'], ['◇', '커리큘럼'], ['◎', '매칭'], ['◔', '활동'], ['○', '마이페이지'], ['✎', '커리큘럼 스튜디오']];
  items.forEach(([glyph, label], index) => {
    const row = autoNode(`nav/${label}`, 'HORIZONTAL', 13, 0);
    row.counterAxisAlignItems = 'CENTER';
    row.paddingTop = 13;
    row.paddingBottom = 13;
    row.paddingLeft = 15;
    row.paddingRight = 15;
    fixedWidth(row, 202);
    surface(row, index === 0 ? C.brandSoft : C.surface, 14);
    row.appendChild(text(glyph, 17, 'bold', index === 0 ? C.brand : C.textSub));
    row.appendChild(namedText(`nav-label-${label}`, label, 14, 'bold', index === 0 ? C.brand : C.textSub));
    nav.appendChild(row);
  });
  top.appendChild(nav);
  component.appendChild(top);

  const footer = autoNode('profile', 'HORIZONTAL', 10, 10);
  footer.counterAxisAlignItems = 'CENTER';
  fixedWidth(footer, 202);
  surface(footer, '#F8F9FC', 16);
  footer.appendChild(icon('김', C.surface, C.brand, 42));
  const profile = autoNode('profile copy', 'VERTICAL', 2, 0);
  profile.appendChild(namedText('user-name', '김하늘', 12, 'bold', C.text));
  profile.appendChild(namedText('user-meta', '컴퓨터공학과', 9, 'regular', C.textSub));
  footer.appendChild(profile);
  footer.appendChild(text('↪', 16, 'bold', C.textSub));
  component.appendChild(footer);
  bindTextProperties(component, { Logo: logo });
  return component;
}

function createMetricComponent() {
  const component = autoNode('Card / Metric', 'HORIZONTAL', 13, 18, true);
  component.counterAxisAlignItems = 'CENTER';
  fixedWidth(component, 268);
  surface(component, C.surface, 19, C.border);
  component.appendChild(icon('✓', C.brand, C.brandSoft, 42));
  const copy = autoNode('copy', 'VERTICAL', 2, 0);
  const value = namedText('value', '12+', 19, 'black', C.text);
  const label = namedText('label', '접수 중 활동', 10, 'regular', C.textSub);
  copy.appendChild(value);
  copy.appendChild(label);
  component.appendChild(copy);
  bindTextProperties(component, { Value: value, Label: label });
  return component;
}

function createCurriculumCardComponent() {
  const component = autoNode('Card / Curriculum', 'VERTICAL', 0, 22, true);
  fixedWidth(component, 350);
  fixedHeight(component, 330);
  surface(component, C.surface, 22, C.border);

  const companyRow = autoNode('company', 'HORIZONTAL', 11, 0);
  companyRow.counterAxisAlignItems = 'CENTER';
  stretch(companyRow);
  companyRow.appendChild(icon('K', C.brand, C.brandSoft, 44));
  const companyCopy = autoNode('company copy', 'VERTICAL', 3, 0);
  const company = namedText('company', 'Kakao Cloud', 12, 'bold', C.text);
  const role = namedText('role', 'Cloud Platform Engineer', 9, 'regular', C.textSub);
  companyCopy.appendChild(company);
  companyCopy.appendChild(role);
  companyRow.appendChild(companyCopy);
  const difficulty = pill('중급', C.warning, C.warningSoft);
  difficulty.name = 'difficulty';
  companyRow.appendChild(difficulty);
  component.appendChild(companyRow);

  const title = namedText('title', 'Kubernetes 실무 로드맵', 19, 'black', C.text, 306, 1.45);
  title.layoutAlign = 'STRETCH';
  component.appendChild(title);
  const description = namedText('description', '컨테이너 운영부터 배포 자동화까지 실무 역량을 단계적으로 학습합니다.', 11, 'regular', C.textSub, 306, 1.75);
  description.layoutAlign = 'STRETCH';
  component.appendChild(description);
  const meta = autoNode('meta', 'HORIZONTAL', 12, 0);
  ['8주', '주 5시간', '24개 목표'].forEach((value) => meta.appendChild(text(value, 9, 'bold', C.textSub)));
  component.appendChild(meta);
  component.appendChild(divider('#F0EFF3'));
  const foot = autoNode('foot', 'HORIZONTAL', 0, 0);
  foot.primaryAxisAlignItems = 'SPACE_BETWEEN';
  stretch(foot);
  foot.appendChild(namedText('participants', '128명이 학습 중', 9, 'regular', C.textMuted));
  foot.appendChild(text('과정 보기  ↗', 10, 'bold', C.brand));
  component.appendChild(foot);
  bindTextProperties(component, { Company: company, Role: role, Title: title, Description: description });
  return component;
}

function createActivityCardComponent() {
  const component = autoNode('Card / Activity', 'VERTICAL', 0, 0, true);
  fixedWidth(component, 350);
  fixedHeight(component, 330);
  surface(component, C.surface, 22, C.border);
  component.clipsContent = true;
  const poster = autoNode('poster', 'VERTICAL', 0, 0);
  poster.primaryAxisAlignItems = 'CENTER';
  poster.counterAxisAlignItems = 'CENTER';
  fixedWidth(poster, 350);
  fixedHeight(poster, 205);
  poster.fills = gradient('#EEEAFE', '#D9D1FF');
  poster.appendChild(text('✦', 42, 'black', C.brand));
  component.appendChild(poster);
  const body = autoNode('body', 'VERTICAL', 8, 16);
  fixedWidth(body, 350);
  const tags = autoNode('tags', 'HORIZONTAL', 5, 0);
  tags.appendChild(pill('공모전'));
  tags.appendChild(pill('접수중 D-18'));
  body.appendChild(tags);
  const title = namedText('title', '2026 클라우드 네이티브 아이디어 공모전', 15, 'bold', C.text, 318, 1.45);
  const organizer = namedText('organizer', '한국클라우드산업협회', 11, 'regular', C.textSub);
  body.appendChild(title);
  body.appendChild(organizer);
  component.appendChild(body);
  bindTextProperties(component, { Title: title, Organizer: organizer });
  return component;
}

function createListComponent(name, titleDefault, subtitleDefault, statusDefault = '') {
  const component = autoNode(name, 'HORIZONTAL', 15, 18, true);
  component.counterAxisAlignItems = 'CENTER';
  fixedWidth(component, 1120);
  surface(component, C.surface, 19, C.border);
  component.appendChild(statusDefault ? pill(statusDefault, C.warning, C.warningSoft) : icon('◎', C.brand, C.brandSoft, 46));
  const copy = autoNode('copy', 'VERTICAL', 4, 0);
  const title = namedText('title', titleDefault, 14, 'bold', C.text, 920, 1.4);
  const subtitle = namedText('subtitle', subtitleDefault, 11, 'regular', C.textSub, 920, 1.5);
  copy.appendChild(title);
  copy.appendChild(subtitle);
  component.appendChild(copy);
  component.appendChild(text('›', 23, 'regular', C.textMuted));
  bindTextProperties(component, { Title: title, Subtitle: subtitle });
  return component;
}

function createMenuCardComponent() {
  const component = autoNode('Card / Menu', 'HORIZONTAL', 14, 20, true);
  component.counterAxisAlignItems = 'CENTER';
  fixedWidth(component, 553);
  surface(component, C.surface, 20, C.border);
  component.appendChild(icon('◇', C.brand, C.brandSoft, 50));
  const copy = autoNode('copy', 'VERTICAL', 5, 0);
  const title = namedText('title', '나의 지원', 15, 'bold', C.text, 430);
  const description = namedText('description', '지원 단계와 합류 제안을 확인합니다.', 11, 'regular', C.textSub, 430);
  copy.appendChild(title);
  copy.appendChild(description);
  component.appendChild(copy);
  component.appendChild(text('›', 22, 'regular', C.textMuted));
  bindTextProperties(component, { Title: title, Description: description });
  return component;
}

function createGoalRowComponent() {
  const component = autoNode('List / Goal Row', 'HORIZONTAL', 12, 14, true);
  component.counterAxisAlignItems = 'CENTER';
  fixedWidth(component, 620);
  surface(component, C.surface, 14, C.border);
  component.appendChild(icon('✓', C.success, C.successSoft, 30));
  const copy = autoNode('copy', 'VERTICAL', 3, 0);
  const title = namedText('title', '클러스터 구성 실습 완료', 12, 'bold', C.text, 470);
  const date = namedText('date', '2026-08-27', 9, 'regular', C.textSub);
  copy.appendChild(title);
  copy.appendChild(date);
  component.appendChild(copy);
  component.appendChild(pill('완료', C.success, C.successSoft));
  bindTextProperties(component, { Title: title, Date: date });
  return component;
}

function createFieldComponent() {
  const component = autoNode('Form / Field', 'VERTICAL', 7, 0, true);
  fixedWidth(component, 420);
  const label = namedText('label', '필드 라벨', 11, 'bold', '#475467');
  component.appendChild(label);
  const input = autoNode('input', 'HORIZONTAL', 0, 12);
  fixedWidth(input, 420);
  surface(input, C.surface, 12, C.borderStrong);
  const placeholder = namedText('placeholder', '내용을 입력하세요', 12, 'regular', C.textMuted, 380);
  input.appendChild(placeholder);
  component.appendChild(input);
  bindTextProperties(component, { Label: label, Placeholder: placeholder });
  return component;
}

function createModalComponent(fieldComponent, buttonComponent) {
  const component = autoNode('Modal / Template Editor', 'VERTICAL', 18, 26, true);
  fixedWidth(component, 560);
  surface(component, C.surface, 24);
  shadow(component, 0.18);
  const head = autoNode('head', 'HORIZONTAL', 0, 0);
  head.primaryAxisAlignItems = 'SPACE_BETWEEN';
  stretch(head);
  const title = namedText('title', '새 지원서', 22, 'black', C.text);
  head.appendChild(title);
  head.appendChild(text('×', 28, 'regular', C.textSub));
  component.appendChild(head);
  component.appendChild(instance(fieldComponent, { label: '템플릿 이름', placeholder: '템플릿 이름' }));
  const bodyField = instance(fieldComponent, { label: '지원 내용', placeholder: '자주 쓰는 지원 내용을 입력하세요' });
  bodyField.resize(508, 112);
  component.appendChild(bodyField);
  const button = instance(buttonComponent, { label: '저장하기' });
  fixedWidth(button, 508);
  component.appendChild(button);
  bindTextProperties(component, { Title: title });
  return component;
}

function createFoundations() {
  const page = uniquePage('KKIRI · 00 Foundations');
  const title = sectionHeading('DESIGN FOUNDATION', '끼리끼리 웹 디자인 토큰', '웹 구현의 CSS 토큰을 Figma 기준으로 정리한 페이지입니다.', 1000);
  title.x = 80;
  title.y = 80;
  page.appendChild(title);

  const colorSection = componentSection(page, 'Colors', 80, 220, 1280);
  const swatches = autoNode('swatches', 'HORIZONTAL', 14, 0);
  [
    ['Primary', C.brand], ['Primary Dark', C.brandDark], ['Primary Soft', C.brandSoft],
    ['Canvas', C.canvas], ['Surface', C.surface], ['Text', C.text],
    ['Text Sub', C.textSub], ['Border', C.border], ['Success', C.success], ['Danger', C.danger],
  ].forEach(([name, color]) => {
    const card = autoNode(name, 'VERTICAL', 8, 0);
    const sample = figma.createRectangle();
    sample.resize(104, 76);
    sample.cornerRadius = 14;
    sample.fills = [fill(color)];
    sample.strokes = [fill(C.border)];
    card.appendChild(sample);
    card.appendChild(text(name, 11, 'bold', C.text));
    card.appendChild(text(color, 9, 'regular', C.textSub));
    swatches.appendChild(card);
  });
  colorSection.appendChild(swatches);

  const typeSection = componentSection(page, 'Typography', 80, 520, 1280);
  [['Display', 48, 'black'], ['H1', 38, 'black'], ['H2', 28, 'black'], ['Body', 14, 'regular'], ['Caption', 11, 'regular'], ['Label', 10, 'bold']].forEach(([name, size, weight]) => {
    const row = autoNode(name, 'HORIZONTAL', 24, 0);
    row.counterAxisAlignItems = 'CENTER';
    row.appendChild(text(name, 11, 'bold', C.textSub, 120));
    row.appendChild(text('함께할 사람을 찾고, 성장한 기록을 남겨요.', size, weight, C.text, 1000, 1.35));
    typeSection.appendChild(row);
  });

  try {
    const collection = figma.variables.createVariableCollection('KKIRI Web Tokens');
    const mode = collection.defaultModeId;
    Object.entries(C).forEach(([name, value]) => {
      const variable = figma.variables.createVariable(`Color/${name}`, collection, 'COLOR');
      variable.setValueForMode(mode, { ...rgb(value), a: 1 });
    });
    [4, 8, 12, 16, 20, 24, 32, 40, 48, 64].forEach((value) => {
      const variable = figma.variables.createVariable(`Spacing/${value}`, collection, 'FLOAT');
      variable.setValueForMode(mode, value);
    });
  } catch (_) {}

  return page;
}

function createComponents() {
  const page = uniquePage('KKIRI · 01 Components');
  const components = {};

  const navSection = componentSection(page, 'Navigation', 80, 80, 1360);
  components.sidebar = createSidebarComponent();
  components.search = createSearchComponent();
  components.topbar = createTopbarComponent(components.search);
  const navRow = autoNode('navigation examples', 'HORIZONTAL', 28, 0);
  navRow.counterAxisAlignItems = 'MIN';
  navRow.appendChild(components.sidebar);
  navRow.appendChild(components.topbar);
  navSection.appendChild(navRow);

  const actionSection = componentSection(page, 'Actions & Inputs', 80, 1150, 1360);
  components.buttonPrimary = createButtonComponent('Button / Primary', '시작하기', C.surface, C.brand);
  components.buttonSecondary = createButtonComponent('Button / Secondary', '취소', C.textSub, C.surface, C.border);
  components.buttonDanger = createButtonComponent('Button / Danger', '삭제', C.danger, C.dangerSoft);
  components.field = createFieldComponent();
  const actionRow = autoNode('actions', 'HORIZONTAL', 18, 0);
  actionRow.counterAxisAlignItems = 'MIN';
  actionRow.appendChild(components.buttonPrimary);
  actionRow.appendChild(components.buttonSecondary);
  actionRow.appendChild(components.buttonDanger);
  actionRow.appendChild(components.search);
  actionSection.appendChild(actionRow);
  actionSection.appendChild(components.field);

  const headerSection = componentSection(page, 'Headers & Status', 80, 1480, 1360);
  components.pageTitle = createPageTitleComponent();
  components.metric = createMetricComponent();
  const headerRow = autoNode('headers', 'HORIZONTAL', 40, 0);
  headerRow.appendChild(components.pageTitle);
  headerRow.appendChild(components.metric);
  headerRow.appendChild(pill('합류 완료', C.success, C.successSoft));
  headerSection.appendChild(headerRow);

  const cardSection = componentSection(page, 'Cards', 80, 1780, 1360);
  components.curriculumCard = createCurriculumCardComponent();
  components.activityCard = createActivityCardComponent();
  components.menuCard = createMenuCardComponent();
  const cardRow = autoNode('cards', 'HORIZONTAL', 18, 0);
  cardRow.counterAxisAlignItems = 'MIN';
  cardRow.appendChild(components.curriculumCard);
  cardRow.appendChild(components.activityCard);
  cardRow.appendChild(components.menuCard);
  cardSection.appendChild(cardRow);

  const listSection = componentSection(page, 'Lists & Workflow', 80, 2300, 1360);
  components.recruitmentRow = createListComponent('List / Recruitment', '쿠버네티스 스터디 팀원 모집', 'Kubernetes 실무 로드맵 · 온라인 · 3명 모집');
  components.applicationRow = createListComponent('List / Application', '프론트엔드 개발 파트 지원', '2026 대학생 서비스 개발 공모전', '검토 중');
  components.goalRow = createGoalRowComponent();
  listSection.appendChild(components.recruitmentRow);
  listSection.appendChild(components.applicationRow);
  listSection.appendChild(components.goalRow);

  const modalSection = componentSection(page, 'Modals', 80, 2760, 1360);
  components.templateModal = createModalComponent(components.field, components.buttonPrimary);
  modalSection.appendChild(components.templateModal);
  return { page, components };
}

function setActiveNavigation(sidebar, activeLabel) {
  const label = findText(sidebar, `nav-label-${activeLabel}`);
  if (!label || !label.parent || label.parent.type !== 'FRAME') return;
  label.fills = [fill(C.brand)];
  label.parent.fills = [fill(C.brandSoft)];
  const iconText = label.parent.findOne((node) => node.type === 'TEXT' && node !== label);
  if (iconText) iconText.fills = [fill(C.brand)];
}

function createShell(page, components, activeLabel, height = 1200) {
  const screen = autoNode(`Desktop / ${activeLabel}`, 'HORIZONTAL', 0, 0);
  screen.x = 80;
  screen.y = 80;
  screen.resize(1440, height);
  screen.primaryAxisSizingMode = 'FIXED';
  screen.counterAxisSizingMode = 'FIXED';
  screen.fills = [fill(C.canvas)];
  screen.clipsContent = true;

  const sidebar = instance(components.sidebar, {}, 246, height);
  setActiveNavigation(sidebar, activeLabel);
  screen.appendChild(sidebar);

  const main = autoNode('main column', 'VERTICAL', 0, 0);
  main.resize(1194, height);
  main.primaryAxisSizingMode = 'FIXED';
  main.counterAxisSizingMode = 'FIXED';
  main.fills = [fill(C.canvas)];
  main.appendChild(instance(components.topbar, {}, 1194, 74));

  const content = autoNode('page content', 'VERTICAL', 24, 36);
  content.paddingBottom = 70;
  content.resize(1194, height - 74);
  content.primaryAxisSizingMode = 'FIXED';
  content.counterAxisSizingMode = 'FIXED';
  content.fills = [fill(C.canvas)];
  content.clipsContent = false;
  main.appendChild(content);
  screen.appendChild(main);
  page.appendChild(screen);
  return { screen, content };
}

function pageTitleInstance(components, eyebrow, titleValue, description) {
  const node = instance(components.pageTitle, {
    eyebrow,
    title: titleValue,
    description,
  }, 900);
  return node;
}

function sectionHead(titleValue, link = '') {
  const row = autoNode('section head', 'HORIZONTAL', 0, 0);
  row.primaryAxisAlignItems = 'SPACE_BETWEEN';
  row.counterAxisAlignItems = 'CENTER';
  fixedWidth(row, 1122);
  row.appendChild(text(titleValue, 21, 'black', C.text));
  if (link) row.appendChild(text(`${link}  ›`, 12, 'bold', C.brand));
  return row;
}

function cardRow(nodes, width = 1122, gap = 18) {
  const row = autoNode('card row', 'HORIZONTAL', gap, 0);
  fixedWidth(row, width);
  row.counterAxisAlignItems = 'MIN';
  nodes.forEach((node) => row.appendChild(node));
  return row;
}

function simpleCard(name, titleValue, body, width = 350, height = null) {
  const card = autoNode(name, 'VERTICAL', 10, 20);
  fixedWidth(card, width);
  if (height) fixedHeight(card, height);
  surface(card, C.surface, 20, C.border);
  card.appendChild(text(titleValue, 16, 'bold', C.text, width - 40, 1.4));
  card.appendChild(text(body, 11, 'regular', C.textSub, width - 40, 1.75));
  return card;
}

function makeHero(width, height, eyebrow, titleValue, description, buttonLabel = '') {
  const hero = autoNode('hero', 'HORIZONTAL', 20, 44);
  hero.primaryAxisAlignItems = 'SPACE_BETWEEN';
  hero.counterAxisAlignItems = 'CENTER';
  fixedWidth(hero, width);
  fixedHeight(hero, height);
  hero.fills = gradient(C.brandDeep, C.brand);
  hero.cornerRadius = 32;
  hero.clipsContent = true;

  const copy = autoNode('hero copy', 'VERTICAL', 10, 0);
  fixedWidth(copy, Math.round(width * 0.62));
  copy.appendChild(text(eyebrow, 10, 'black', '#D9D1FF'));
  copy.appendChild(text(titleValue, 42, 'black', C.surface, Math.round(width * 0.6), 1.22));
  copy.appendChild(text(description, 14, 'regular', '#E6E0FF', Math.round(width * 0.58), 1.75));
  if (buttonLabel) {
    const button = autoNode('hero button', 'HORIZONTAL', 0, 0);
    button.primaryAxisAlignItems = 'CENTER';
    button.counterAxisAlignItems = 'CENTER';
    button.paddingTop = 13;
    button.paddingBottom = 13;
    button.paddingLeft = 18;
    button.paddingRight = 18;
    surface(button, C.surface, 13);
    button.appendChild(text(buttonLabel, 13, 'bold', C.brandDark));
    copy.appendChild(button);
  }
  hero.appendChild(copy);

  const visual = autoNode('hero visual', 'VERTICAL', 10, 0);
  visual.primaryAxisAlignItems = 'CENTER';
  visual.counterAxisAlignItems = 'CENTER';
  fixedWidth(visual, Math.round(width * 0.28));
  fixedHeight(visual, height - 70);
  visual.fills = [fill(C.surface, 0.11)];
  visual.strokes = [fill(C.surface, 0.18)];
  visual.cornerRadius = 24;
  visual.appendChild(icon('✦', C.surface, C.brandLight, 76));
  visual.appendChild(text('나의 성장 로드맵', 13, 'bold', C.surface));
  hero.appendChild(visual);
  return hero;
}

function createLoginScreen() {
  const page = uniquePage('KKIRI · 02 Login');
  const screen = autoNode('Desktop / Login', 'HORIZONTAL', 0, 0);
  screen.x = 80;
  screen.y = 80;
  screen.resize(1440, 900);
  screen.primaryAxisSizingMode = 'FIXED';
  screen.counterAxisSizingMode = 'FIXED';
  screen.fills = [fill(C.surface)];
  screen.clipsContent = true;

  const brand = autoNode('brand panel', 'VERTICAL', 18, 110);
  brand.primaryAxisAlignItems = 'CENTER';
  fixedWidth(brand, 756);
  fixedHeight(brand, 900);
  brand.fills = gradient(C.brandDeep, C.brand);
  brand.appendChild(icon('✦', C.surface, C.brandLight, 52));
  brand.appendChild(text('KKIRI KKIRI', 11, 'black', '#DDD6FE'));
  brand.appendChild(text('함께할 사람을 찾고,\n성장한 기록을 남겨요.', 54, 'black', C.surface, 540, 1.25));
  screen.appendChild(brand);

  const panel = autoNode('login panel', 'VERTICAL', 14, 132);
  fixedWidth(panel, 684);
  fixedHeight(panel, 900);
  surface(panel, C.surface);
  const form = autoNode('login form', 'VERTICAL', 14, 0);
  fixedWidth(form, 420);
  form.appendChild(text('끼리끼리', 27, 'black', C.brand));
  form.appendChild(text('다시 만나서 반가워요', 30, 'black', C.text, 420, 1.3));
  form.appendChild(text('모바일 앱과 같은 계정으로 로그인하세요.', 12, 'regular', C.textSub));
  ['이메일\nname@example.com', '비밀번호\n비밀번호'].forEach((value) => {
    const [labelValue, placeholder] = value.split('\n');
    const field = autoNode('field', 'VERTICAL', 7, 0);
    field.appendChild(text(labelValue, 11, 'bold', '#475467'));
    const input = autoNode('input', 'HORIZONTAL', 0, 12);
    fixedWidth(input, 420);
    surface(input, C.surface, 12, C.borderStrong);
    input.appendChild(text(placeholder, 12, 'regular', C.textMuted));
    field.appendChild(input);
    form.appendChild(field);
  });
  const loginButton = autoNode('login', 'HORIZONTAL', 0, 13);
  loginButton.primaryAxisAlignItems = 'CENTER';
  loginButton.counterAxisAlignItems = 'CENTER';
  fixedWidth(loginButton, 420);
  surface(loginButton, C.brand, 13);
  loginButton.appendChild(text('로그인', 13, 'bold', C.surface));
  form.appendChild(loginButton);
  panel.appendChild(form);
  screen.appendChild(panel);
  page.appendChild(screen);
  return page;
}

function createHomeScreen(components) {
  const page = uniquePage('KKIRI · 03 Home');
  const { content } = createShell(page, components, '홈', 1460);
  content.appendChild(makeHero(1122, 312, 'WELCOME BACK', '김하늘님, 오늘의 실행이\n원하는 커리어에 닿도록.', '기업 커리큘럼부터 공모전, 팀 목표까지 한 곳에서 이어가세요.', '기업 커리큘럼 보기'));

  content.appendChild(cardRow([
    instance(components.metric, { value: '12+', label: '접수 중 활동' }),
    instance(components.metric, { value: '3', label: '나의 지원' }),
    instance(components.metric, { value: '탐색', label: '모집 중인 팀' }),
    instance(components.metric, { value: '관리', label: '성장 기록' }),
  ], 1122, 14));

  content.appendChild(sectionHead('기업이 제안한 성장 로드맵', '전체보기'));
  content.appendChild(cardRow([
    instance(components.curriculumCard, { company: 'Kakao Cloud', role: 'Cloud Platform Engineer', title: 'Kubernetes 실무 로드맵' }),
    instance(components.curriculumCard, { company: 'Naver', role: 'Backend Engineer', title: '대규모 트래픽 백엔드 과정' }),
    instance(components.curriculumCard, { company: 'Toss', role: 'Frontend Engineer', title: '제품 중심 프론트엔드 성장 과정' }),
  ]));
  content.appendChild(sectionHead('지금 지원할 수 있는 활동', '전체보기'));
  content.appendChild(cardRow([
    instance(components.activityCard, { title: '2026 클라우드 네이티브 아이디어 공모전', organizer: '한국클라우드산업협회' }),
    instance(components.activityCard, { title: '대학생 서비스 기획 챌린지', organizer: 'Soom Square' }),
    instance(components.activityCard, { title: 'AI 기반 지역문제 해결 해커톤', organizer: '서울창업허브' }),
  ]));
  return page;
}

function createInfoScreen(components) {
  const page = uniquePage('KKIRI · 04 Info');
  const { content } = createShell(page, components, '정보', 1420);
  content.appendChild(pageTitleInstance(components, 'DISCOVER', '활동 정보', '공모전, 대외활동, 교육과 행사를 한 번에 찾아보세요.'));
  const banner = autoNode('curriculum banner', 'HORIZONTAL', 16, 22);
  banner.counterAxisAlignItems = 'CENTER';
  fixedWidth(banner, 1122);
  banner.fills = gradient(C.brandDeep, C.brand);
  banner.cornerRadius = 22;
  banner.appendChild(icon('✦', C.surface, C.brandLight, 48));
  const bannerCopy = autoNode('copy', 'VERTICAL', 4, 0);
  bannerCopy.appendChild(text('기업이 제안하는 기술 성장 과정', 10, 'bold', '#DDD6FE'));
  bannerCopy.appendChild(text('기업 커리큘럼을 개인·팀 활동으로 시작하세요', 17, 'black', C.surface));
  bannerCopy.appendChild(text('내 일정에 맞춘 월간·주간·일일 목표가 자동으로 만들어집니다.', 11, 'regular', '#E6E0FF'));
  banner.appendChild(bannerCopy);
  banner.appendChild(text('→', 24, 'bold', C.surface));
  content.appendChild(banner);
  content.appendChild(instance(components.search, { placeholder: '활동명이나 주최기관 검색' }, 560));
  const activities = Array.from({ length: 6 }, (_, index) => instance(components.activityCard, {
    title: ['클라우드 네이티브 아이디어 공모전', '대학생 서비스 기획 챌린지', 'AI 지역문제 해결 해커톤', '오픈소스 기여 프로그램', '청년 데이터 분석 경진대회', '모바일 앱 개발 캠프'][index],
    organizer: ['한국클라우드산업협회', 'Soom Square', '서울창업허브', 'OSS Korea', '데이터산업진흥원', '디지털인재원'][index],
  }));
  content.appendChild(cardRow(activities.slice(0, 3)));
  content.appendChild(cardRow(activities.slice(3, 6)));
  return page;
}

function createInfoDetailScreen(components) {
  const page = uniquePage('KKIRI · 05 Info Detail');
  const { content } = createShell(page, components, '정보', 1660);
  content.appendChild(text('←  활동 정보', 13, 'bold', C.brand));
  const layout = autoNode('detail layout', 'HORIZONTAL', 30, 0);
  fixedWidth(layout, 1122);
  layout.counterAxisAlignItems = 'MIN';

  const article = autoNode('article', 'VERTICAL', 22, 0);
  fixedWidth(article, 752);
  const tags = autoNode('tags', 'HORIZONTAL', 6, 0);
  tags.appendChild(pill('공모전'));
  tags.appendChild(pill('IT·소프트웨어'));
  article.appendChild(tags);
  article.appendChild(text('2026 클라우드 네이티브\n아이디어 공모전', 42, 'black', C.text, 752, 1.2));
  article.appendChild(text('한국클라우드산업협회에서 진행하는 활동입니다. 일정과 지원 조건을 한눈에 확인하세요.', 15, 'regular', C.textSub, 720, 1.7));
  article.appendChild(text('주최  한국클라우드산업협회    ·    접수  2026년 9월 14일까지', 11, 'bold', C.textSub));
  const poster = autoNode('poster', 'VERTICAL', 0, 0);
  fixedWidth(poster, 752);
  fixedHeight(poster, 430);
  poster.primaryAxisAlignItems = 'CENTER';
  poster.counterAxisAlignItems = 'CENTER';
  poster.fills = gradient('#EEEAFE', '#CFC3FF');
  poster.cornerRadius = 24;
  poster.appendChild(text('CLOUD NATIVE\nIDEA CONTEST', 38, 'black', C.brandDeep, 500, 1.2));
  article.appendChild(poster);
  article.appendChild(cardRow([
    simpleCard('summary', '운영 기간', '2026.09.21 ~ 2026.11.30', 176),
    simpleCard('summary', '모집 대상', '대학생 및 취업 준비생', 176),
    simpleCard('summary', '진행 장소', '온라인 및 서울', 176),
    simpleCard('summary', '혜택·시상', '총상금 1,000만원', 176),
  ], 752, 16));
  article.appendChild(sectionHeading('ACTIVITY BRIEF', '공고 상세', '클라우드 네이티브 기술을 활용해 실제 문제를 해결하는 아이디어와 프로토타입을 제안합니다. 팀 구성, 제출 형식, 심사 기준을 확인하고 공식 공고에서 최신 일정을 반드시 확인해주세요.', 752));
  layout.appendChild(article);

  const aside = autoNode('aside', 'VERTICAL', 18, 0);
  fixedWidth(aside, 340);
  const schedule = simpleCard('deadline', '지원 일정', '접수 시작  2026.08.20\n접수 마감  2026.09.14', 340);
  const apply = instance(components.buttonPrimary, { label: '지원 페이지 열기  ↗' });
  fixedWidth(apply, 300);
  schedule.appendChild(apply);
  aside.appendChild(schedule);
  aside.appendChild(simpleCard('teams', '함께 준비할 팀  3', '백엔드 개발자 1명 모집\n기획·디자인 파트 모집\n클라우드 인프라 경험자 모집', 340));
  aside.appendChild(simpleCard('guide', '읽기 전 확인하세요', '접수 일정과 자격 조건은 주최기관 사정에 따라 변경될 수 있습니다.', 340));
  layout.appendChild(aside);
  content.appendChild(layout);
  return page;
}

function createCurriculaScreen(components) {
  const page = uniquePage('KKIRI · 06 Curricula');
  const { content } = createShell(page, components, '커리큘럼', 1290);
  content.appendChild(makeHero(1122, 410, 'ENTERPRISE CURRICULUM', '기업이 제안한 성장 기준을\n나의 실행 계획으로.', '직무에 필요한 기술을 확인하고 개인 또는 팀 활동으로 추가해 월간·주간·일일 목표를 관리하세요.', '커리큘럼 둘러보기'));
  const toolbar = autoNode('catalog toolbar', 'HORIZONTAL', 24, 0);
  toolbar.primaryAxisAlignItems = 'SPACE_BETWEEN';
  toolbar.counterAxisAlignItems = 'MAX';
  fixedWidth(toolbar, 1122);
  toolbar.appendChild(sectionHeading('CURATED ROADMAPS', '기업 커리큘럼', '관심 기업, 직무 또는 기술 스택으로 찾아보세요.', 620));
  toolbar.appendChild(instance(components.search, { placeholder: '기업, 직무, 기술 검색' }, 360));
  content.appendChild(toolbar);
  const filters = autoNode('filters', 'HORIZONTAL', 8, 0);
  ['전체', '입문', '중급', '심화'].forEach((label, index) => filters.appendChild(pill(label, index === 0 ? C.surface : C.textSub, index === 0 ? C.brand : C.surface)));
  content.appendChild(filters);
  content.appendChild(cardRow([
    instance(components.curriculumCard, { company: 'Kakao Cloud', role: 'Cloud Platform Engineer', title: 'Kubernetes 실무 로드맵' }),
    instance(components.curriculumCard, { company: 'Naver', role: 'Backend Engineer', title: '대규모 트래픽 백엔드 과정' }),
    instance(components.curriculumCard, { company: 'Toss', role: 'Frontend Engineer', title: '제품 중심 프론트엔드 성장 과정' }),
  ]));
  return page;
}

function learningColumn(titleValue, description, goals, width = 350) {
  const card = autoNode('learning column', 'VERTICAL', 14, 20);
  fixedWidth(card, width);
  surface(card, C.surface, 22, C.border);
  const head = autoNode('head', 'HORIZONTAL', 11, 0);
  head.counterAxisAlignItems = 'CENTER';
  head.appendChild(icon('✓', C.brand, C.brandSoft, 40));
  const copy = autoNode('copy', 'VERTICAL', 3, 0);
  copy.appendChild(text(titleValue, 14, 'bold', C.text));
  copy.appendChild(text(description, 9, 'regular', C.textSub));
  head.appendChild(copy);
  head.appendChild(pill(String(goals.length)));
  card.appendChild(head);
  goals.forEach((goal, index) => {
    const row = autoNode('goal', 'HORIZONTAL', 10, 0);
    row.counterAxisAlignItems = 'MIN';
    row.appendChild(text(String(index + 1).padStart(2, '0'), 10, 'black', C.brand));
    const goalCopy = autoNode('goal copy', 'VERTICAL', 3, 0);
    goalCopy.appendChild(text(goal, 11, 'bold', C.text, width - 80, 1.5));
    goalCopy.appendChild(text(`시작 +${index * 3}일 · ${index % 2 ? 90 : 60}분`, 9, 'regular', C.textSub));
    row.appendChild(goalCopy);
    card.appendChild(row);
  });
  return card;
}

function createCurriculumDetailScreen(components) {
  const page = uniquePage('KKIRI · 07 Curriculum Detail');
  const { screen, content } = createShell(page, components, '커리큘럼', 1780);
  content.appendChild(text('←  기업 커리큘럼', 13, 'bold', C.brand));
  const hero = makeHero(1122, 390, 'CLOUD PLATFORM ENGINEER', 'Kubernetes 실무 로드맵', '컨테이너 운영부터 배포 자동화, 관측 가능성까지 실무에서 요구되는 쿠버네티스 역량을 단계적으로 학습합니다.', '내 활동에 추가');
  const visualLabel = hero.findOne((node) => node.type === 'TEXT' && node.characters === '나의 성장 로드맵');
  if (visualLabel) visualLabel.characters = 'Kakao Cloud · 기업 제공';
  content.appendChild(hero);
  content.appendChild(cardRow([
    simpleCard('insight', '24', '전체 목표\n월간·주간·일일 목표', 268),
    simpleCard('insight', '40h', '예상 학습시간\n개인 일정에 따라 조정', 268),
    simpleCard('insight', '16', '실행 과제\n캘린더에 자동 배치', 268),
    simpleCard('insight', '128', '학습 참여\n상세 기록은 비공개', 268),
  ], 1122, 16));
  content.appendChild(cardRow([
    simpleCard('about', '이 과정을 마치면', '실무 환경에서 쿠버네티스 클러스터를 구성하고, 선언적 배포와 운영 자동화를 설계할 수 있습니다. 기업이 제안한 목표는 기준점이며 실제 일정은 사용자가 결정합니다.', 735),
    simpleCard('privacy', '학습 기록은 나의 것', '기업은 개인 일정과 상세 달성 기록을 볼 수 없습니다. 채용 제출은 별도 동의가 필요합니다.', 371),
  ], 1122, 16));
  content.appendChild(sectionHeading('LEARNING MAP', '학습 과정', '큰 목표부터 오늘 할 일까지 연결된 구조입니다.', 760));
  content.appendChild(cardRow([
    learningColumn('월간 마일스톤', '과정의 큰 방향과 도달 기준', ['클러스터 운영 기반 완성', '운영 자동화 역량 검증']),
    learningColumn('주간 목표', '한 주 단위 학습 묶음', ['컨테이너 오케스트레이션 이해', '클러스터 설치와 네트워크', '배포 전략과 롤백', '관측 가능성 구축']),
    learningColumn('일일 실행', '캘린더에 배치되는 행동', ['kubectl 핵심 명령 실습', 'Deployment 작성', 'Service 연결', 'Ingress 구성', 'Helm 차트 배포', 'Prometheus 지표 확인']),
  ]));

  const modalScreen = screen.clone();
  modalScreen.name = 'Desktop / Curriculum Detail · Setup Modal';
  modalScreen.x = 1600;
  page.appendChild(modalScreen);
  const overlay = figma.createRectangle();
  overlay.name = 'modal overlay';
  overlay.resize(1440, 1780);
  overlay.fills = [fill(C.text, 0.48)];
  overlay.layoutPositioning = 'ABSOLUTE';
  overlay.x = 0;
  overlay.y = 0;
  modalScreen.appendChild(overlay);
  const modal = autoNode('Add to Activity Modal', 'VERTICAL', 18, 26);
  fixedWidth(modal, 680);
  surface(modal, C.surface, 24);
  shadow(modal, 0.18);
  modal.layoutPositioning = 'ABSOLUTE';
  modal.appendChild(sectionHeading('ADD TO ACTIVITY', '학습 방식과 일정을 정해주세요', '', 620));
  modal.appendChild(cardRow([
    simpleCard('personal mode', '개인으로 시작', '내 일정에 맞춰 혼자 완주해요.', 300),
    simpleCard('team mode', '팀으로 시작', '팀원과 목표를 나누고 함께 완주해요.', 300),
  ], 620, 16));
  const fields = cardRow([
    instance(components.field, { label: '학습 시작일', placeholder: '2026-09-01' }, 302),
    instance(components.field, { label: '팀 이름', placeholder: 'Kubernetes 완주 스터디' }, 302),
  ], 620, 16);
  modal.appendChild(fields);
  modal.appendChild(text('학습 가능한 요일', 11, 'bold', '#475467'));
  const days = autoNode('weekdays', 'HORIZONTAL', 8, 0);
  ['월', '화', '수', '목', '금', '토', '일'].forEach((day, index) => days.appendChild(pill(day, [0, 2, 4].includes(index) ? C.surface : C.textSub, [0, 2, 4].includes(index) ? C.brand : C.canvas)));
  modal.appendChild(days);
  modal.appendChild(simpleCard('preview', '내 일정 미리보기', '2026.09.01 ~ 2026.10.26  ·  40시간  ·  주간 8개  ·  일일 16개', 620));
  const submit = instance(components.buttonPrimary, { label: '이 일정으로 활동에 추가  →' });
  fixedWidth(submit, 620);
  modal.appendChild(submit);
  modal.x = 380;
  modal.y = 280;
  modalScreen.appendChild(modal);
  return page;
}

function createMatchingScreen(components) {
  const page = uniquePage('KKIRI · 08 Matching');
  const { content } = createShell(page, components, '매칭', 1080);
  content.appendChild(pageTitleInstance(components, 'TEAM MATCHING', '함께할 팀 찾기', '관심 활동을 중심으로 조건이 맞는 팀을 찾아보세요.'));
  [
    ['쿠버네티스 실무 완주 스터디', 'Kubernetes 실무 로드맵 · 온라인 · 3명 모집'],
    ['클라우드 공모전 백엔드 개발자 모집', '클라우드 네이티브 아이디어 공모전 · 혼합 · 1명 모집'],
    ['서비스 기획과 UX 리서치 팀원 모집', '대학생 서비스 기획 챌린지 · 오프라인 · 2명 모집'],
    ['AI 해커톤 프론트엔드 파트 모집', 'AI 지역문제 해결 해커톤 · 온라인 · 1명 모집'],
    ['오픈소스 첫 기여 함께 시작해요', 'OSS 기여 프로그램 · 온라인 · 4명 모집'],
  ].forEach(([titleValue, subtitle]) => content.appendChild(instance(components.recruitmentRow, { title: titleValue, subtitle })));
  return page;
}

function createActivityScreen(components) {
  const page = uniquePage('KKIRI · 09 Activity');
  const { content } = createShell(page, components, '활동', 1540);
  content.appendChild(pageTitleInstance(components, 'MY ACTIVITY', '나의 활동', '공모전과 기업 커리큘럼을 같은 방식으로 실행하고 기록하세요.'));
  const workspace = autoNode('workspace', 'HORIZONTAL', 18, 0);
  fixedWidth(workspace, 1122);
  workspace.counterAxisAlignItems = 'MIN';
  const list = autoNode('activity list', 'VERTICAL', 8, 12);
  fixedWidth(list, 270);
  surface(list, C.surface, 20, C.border);
  list.appendChild(text('진행 중인 활동  3', 12, 'bold', C.text));
  ['Kubernetes 실무 로드맵', '클라우드 공모전 팀', '서비스 기획 챌린지'].forEach((value, index) => {
    const item = simpleCard('activity item', value, index === 0 ? '기업 커리큘럼 · 개인' : '공모전 · 팀', 246);
    if (index === 0) item.fills = [fill(C.brandSoft)];
    list.appendChild(item);
  });
  workspace.appendChild(list);

  const main = autoNode('workspace main', 'VERTICAL', 18, 0);
  fixedWidth(main, 834);
  const overview = autoNode('overview', 'VERTICAL', 18, 28);
  fixedWidth(overview, 834);
  overview.fills = gradient(C.inkPurple, C.brandDark);
  overview.cornerRadius = 26;
  overview.appendChild(pill('기업 커리큘럼 · 개인', C.surface, C.brand));
  overview.appendChild(text('Kubernetes 실무 로드맵', 28, 'black', C.surface));
  overview.appendChild(text('Cloud Platform Engineer · 2026년 10월 26일까지', 11, 'regular', '#DDD6FE'));
  const progress = cardRow([
    simpleCard('progress', '42%', '전체 완료', 240),
    simpleCard('progress', '5/8', '오늘 완료', 240),
    simpleCard('progress', '7', '진행 중', 240),
  ], 778, 14);
  overview.appendChild(progress);
  main.appendChild(overview);

  const weekly = simpleCard('weekly rhythm', '이번 주 실행 흐름', '월  ████████  80%    화  █████  50%    수  ██████████  100%\n목  ███  30%       금  ███████  70%     토  ██  20%     일  ████  40%', 834);
  main.appendChild(weekly);
  const boards = cardRow([
    simpleCard('goals', '목표 관리', '✓ kubectl 핵심 명령 실습\n◔ Deployment 작성\n○ Service와 Ingress 연결\n○ Helm 차트로 배포', 506),
    simpleCard('notices', '나의 메모', '클러스터 네트워크 정리\nIngress Controller 비교\n다음 주 팀 스터디 질문', 310),
  ], 834, 18);
  main.appendChild(boards);
  workspace.appendChild(main);
  content.appendChild(workspace);
  return page;
}

function createMyPageScreen(components) {
  const page = uniquePage('KKIRI · 10 My Page');
  const { content } = createShell(page, components, '마이페이지', 1050);
  const profile = autoNode('profile hero', 'HORIZONTAL', 22, 32);
  profile.counterAxisAlignItems = 'CENTER';
  fixedWidth(profile, 1122);
  profile.fills = gradient(C.brandDark, C.brand);
  profile.cornerRadius = 28;
  profile.appendChild(icon('김', C.surface, C.brandLight, 84));
  const copy = autoNode('copy', 'VERTICAL', 4, 0);
  copy.appendChild(text('MY PROFILE', 10, 'black', '#DDD6FE'));
  copy.appendChild(text('김하늘', 30, 'black', C.surface));
  copy.appendChild(text('haneul@example.com · 컴퓨터공학과', 12, 'regular', '#E7E0FF'));
  profile.appendChild(copy);
  content.appendChild(profile);
  content.appendChild(cardRow([
    instance(components.menuCard, { title: '나의 지원', description: '지원 단계와 합류 제안을 확인합니다.' }),
    instance(components.menuCard, { title: '지원서 관리', description: '자주 쓰는 지원 내용을 템플릿으로 관리합니다.' }),
  ], 1122, 16));
  content.appendChild(cardRow([
    instance(components.menuCard, { title: '관심 활동', description: '저장한 활동을 다시 확인합니다.' }),
    instance(components.menuCard, { title: '미니포트폴리오', description: '지난 활동과 성과를 정리합니다.' }),
  ], 1122, 16));
  return page;
}

function createApplicationsScreen(components) {
  const page = uniquePage('KKIRI · 11 Applications');
  const { content } = createShell(page, components, '마이페이지', 1050);
  content.appendChild(pageTitleInstance(components, 'APPLICATIONS', '나의 지원', '지원부터 팀 합류까지 진행 상황을 확인하세요.'));
  [
    ['프론트엔드 개발 파트 지원', '2026 대학생 서비스 개발 공모전'],
    ['클라우드 인프라 파트 지원', '클라우드 네이티브 아이디어 공모전'],
    ['서비스 기획 파트 지원', '지역문제 해결 해커톤'],
    ['오픈소스 문서화 파트 지원', '2026 OSS 기여 프로그램'],
  ].forEach(([titleValue, subtitle]) => content.appendChild(instance(components.applicationRow, { title: titleValue, subtitle })));
  return page;
}

function timelineCard() {
  const card = autoNode('timeline', 'VERTICAL', 0, 22);
  fixedWidth(card, 548);
  surface(card, C.surface, 22, C.border);
  card.appendChild(text('지원 진행 상황', 19, 'black', C.text));
  [['✓', '지원서 제출', '2026.08.21 14:32'], ['✓', '지원서 확인', '2026.08.22 10:15'], ['•', '팀 합류 제안', '현재 단계'], ['○', '합류 완료', '예정']].forEach(([glyph, label, date], index) => {
    const row = autoNode('timeline step', 'HORIZONTAL', 12, 10);
    row.counterAxisAlignItems = 'CENTER';
    row.appendChild(icon(glyph, index < 2 ? C.surface : C.brand, index < 2 ? C.brand : C.brandSoft, 30));
    const copy = autoNode('copy', 'VERTICAL', 3, 0);
    copy.appendChild(text(label, 13, 'bold', index === 3 ? C.textMuted : C.text));
    copy.appendChild(text(date, 9, index === 2 ? 'bold' : 'regular', index === 2 ? C.brand : C.textSub));
    row.appendChild(copy);
    card.appendChild(row);
  });
  return card;
}

function createApplicationDetailScreen(components) {
  const page = uniquePage('KKIRI · 12 Application Detail');
  const { content } = createShell(page, components, '마이페이지', 1120);
  content.appendChild(text('←  나의 지원', 13, 'bold', C.brand));
  content.appendChild(pageTitleInstance(components, 'APPLICATION STATUS', '프론트엔드 개발 파트 지원', '2026 대학생 서비스 개발 공모전'));
  const submission = simpleCard('submission', '제출한 지원 내용', 'React와 TypeScript를 활용한 웹 서비스 개발 경험이 있습니다. 사용자 문제를 정의하고 팀과 함께 빠르게 실험하며, 모바일 앱과 웹의 일관된 경험을 만드는 데 기여하고 싶습니다.', 556);
  const actions = cardRow([
    instance(components.buttonSecondary, { label: '거절' }),
    instance(components.buttonPrimary, { label: '팀 합류하기' }),
  ], 516, 10);
  submission.appendChild(actions);
  content.appendChild(cardRow([timelineCard(), submission], 1122, 18));
  return page;
}

function templateCard(titleValue, body, isDefault = false) {
  const card = autoNode('template card', 'VERTICAL', 14, 22);
  fixedWidth(card, 553);
  fixedHeight(card, 220);
  card.primaryAxisAlignItems = 'SPACE_BETWEEN';
  surface(card, C.surface, 22, C.border);
  const copy = autoNode('copy', 'VERTICAL', 12, 0);
  const titleRow = autoNode('title', 'HORIZONTAL', 8, 0);
  titleRow.appendChild(text(titleValue, 16, 'bold', C.text));
  if (isDefault) titleRow.appendChild(pill('기본'));
  copy.appendChild(titleRow);
  copy.appendChild(text(body, 12, 'regular', C.textSub, 509, 1.8));
  card.appendChild(copy);
  const actions = autoNode('actions', 'HORIZONTAL', 10, 0);
  actions.appendChild(text('수정', 11, 'bold', C.brand));
  actions.appendChild(text('삭제', 11, 'bold', C.danger));
  card.appendChild(actions);
  return card;
}

function createTemplatesScreen(components) {
  const page = uniquePage('KKIRI · 13 Templates');
  const { screen, content } = createShell(page, components, '마이페이지', 1080);
  const titleRow = autoNode('title actions', 'HORIZONTAL', 20, 0);
  titleRow.primaryAxisAlignItems = 'SPACE_BETWEEN';
  titleRow.counterAxisAlignItems = 'MIN';
  fixedWidth(titleRow, 1122);
  titleRow.appendChild(pageTitleInstance(components, 'APPLICATION LIBRARY', '지원서 관리', '자주 사용하는 지원 내용을 저장하고 모집글에서 불러오세요.'));
  titleRow.appendChild(instance(components.buttonPrimary, { label: '새 템플릿' }));
  content.appendChild(titleRow);
  content.appendChild(cardRow([
    templateCard('개발 직무 기본 지원서', 'React와 TypeScript 기반 웹 서비스 개발 경험, 팀 프로젝트에서의 협업 방식과 문제 해결 과정을 정리한 기본 지원서입니다.', true),
    templateCard('해커톤 지원서', '빠르게 가설을 세우고 프로토타입을 구현한 경험을 중심으로 작성한 해커톤용 지원서입니다.'),
  ], 1122, 16));
  content.appendChild(cardRow([
    templateCard('클라우드 인프라 지원서', 'Docker, Kubernetes, CI/CD 학습 경험과 개인 프로젝트 운영 기록을 정리했습니다.'),
    templateCard('서비스 기획 지원서', '사용자 인터뷰와 데이터 기반 문제 정의 경험을 중심으로 작성했습니다.'),
  ], 1122, 16));

  const modalScreen = screen.clone();
  modalScreen.name = 'Desktop / Templates · Editor Modal';
  modalScreen.x = 1600;
  page.appendChild(modalScreen);
  const overlay = figma.createRectangle();
  overlay.name = 'modal overlay';
  overlay.resize(1440, 1080);
  overlay.fills = [fill(C.text, 0.48)];
  overlay.layoutPositioning = 'ABSOLUTE';
  overlay.x = 0;
  overlay.y = 0;
  modalScreen.appendChild(overlay);
  const modal = instance(components.templateModal, { title: '새 지원서' });
  modal.layoutPositioning = 'ABSOLUTE';
  modal.x = 440;
  modal.y = 230;
  modalScreen.appendChild(modal);
  return page;
}

function createStudioField(label, placeholder, width = 500, height = 44) {
  const field = autoNode('studio field', 'VERTICAL', 7, 0);
  fixedWidth(field, width);
  field.appendChild(text(label, 11, 'bold', '#475467'));
  const input = autoNode('input', 'HORIZONTAL', 0, 12);
  fixedWidth(input, width);
  fixedHeight(input, height);
  surface(input, C.surface, 12, C.borderStrong);
  input.counterAxisAlignItems = 'CENTER';
  input.appendChild(text(placeholder, 12, 'regular', C.textMuted, width - 24));
  field.appendChild(input);
  return field;
}

function studioNode(level, titleValue, description, width = 760) {
  const node = autoNode('goal editor', 'HORIZONTAL', 12, 16);
  node.counterAxisAlignItems = 'MIN';
  fixedWidth(node, width);
  surface(node, C.surface, 16, C.border);
  node.appendChild(text('⋮', 22, 'bold', C.textMuted));
  node.appendChild(pill(level, level === '월간' ? C.brandDark : level === '주간' ? C.warning : C.success, level === '월간' ? C.brandSoft : level === '주간' ? C.warningSoft : C.successSoft));
  const copy = autoNode('copy', 'VERTICAL', 5, 0);
  copy.appendChild(text(titleValue, 13, 'bold', C.text, 560));
  copy.appendChild(text(description, 10, 'regular', C.textSub, 560));
  copy.appendChild(text('시작 +0일    종료 +6일    예상 180분', 9, 'regular', C.textMuted));
  node.appendChild(copy);
  node.appendChild(text('×', 18, 'regular', C.danger));
  return node;
}

function createStudioScreen(components) {
  const page = uniquePage('KKIRI · 14 Curriculum Studio');
  const { content } = createShell(page, components, '커리큘럼 스튜디오', 1820);
  content.appendChild(pageTitleInstance(components, 'CURRICULUM STUDIO', '기업 커리큘럼 만들기', '기업의 기술 요구를 사용자가 실행할 수 있는 월간·주간·일일 목표로 구성하세요.'));
  const layout = autoNode('studio layout', 'HORIZONTAL', 20, 0);
  fixedWidth(layout, 1122);
  layout.counterAxisAlignItems = 'MIN';

  const main = autoNode('studio main', 'VERTICAL', 20, 0);
  fixedWidth(main, 810);
  const info = autoNode('company info', 'VERTICAL', 20, 24);
  fixedWidth(info, 810);
  surface(info, C.surface, 22, C.border);
  info.appendChild(sectionHeading('COURSE INFO', '기업과 과정 정보', '탐색 카드와 상세 화면에 표시되는 기본 정보입니다.', 760));
  info.appendChild(cardRow([
    createStudioField('기업명', '예: 끼리끼리 테크 파트너', 370),
    createStudioField('브랜드 컬러', '#6C5CE7', 370),
  ], 760, 20));
  info.appendChild(createStudioField('커리큘럼 제목', '예: Kubernetes 실무 로드맵', 760));
  info.appendChild(cardRow([
    createStudioField('대상 직무', 'Cloud Platform Engineer', 370),
    createStudioField('난이도', '입문', 370),
  ], 760, 20));
  info.appendChild(cardRow([
    createStudioField('권장 기간', '8주', 370),
    createStudioField('주당 학습시간', '5시간', 370),
  ], 760, 20));
  info.appendChild(createStudioField('한 줄 요약', '사용자가 과정의 가치와 결과를 빠르게 이해할 수 있게 작성해주세요.', 760, 68));
  info.appendChild(createStudioField('상세 설명', '학습 배경, 기대 결과, 권장 선수 지식을 설명해주세요.', 760, 112));
  main.appendChild(info);

  const goals = autoNode('goals', 'VERTICAL', 14, 24);
  fixedWidth(goals, 810);
  surface(goals, C.surface, 22, C.border);
  const goalsHead = autoNode('goals head', 'HORIZONTAL', 0, 0);
  goalsHead.primaryAxisAlignItems = 'SPACE_BETWEEN';
  goalsHead.counterAxisAlignItems = 'CENTER';
  stretch(goalsHead);
  goalsHead.appendChild(sectionHeading('LEARNING GOALS', '학습 목표 구성', '상대 날짜를 사용자의 일정에 맞춰 실제 일정으로 변환합니다.', 590));
  goalsHead.appendChild(instance(components.buttonSecondary, { label: '+ 목표 추가' }));
  goals.appendChild(goalsHead);
  goals.appendChild(studioNode('월간', '클러스터 운영 기반 완성', '8주 과정의 핵심 도달 기준'));
  goals.appendChild(studioNode('주간', '컨테이너 오케스트레이션 이해', '핵심 개념과 리소스 관계 학습'));
  goals.appendChild(studioNode('일일', 'kubectl 핵심 명령 실습', '클러스터 상태 조회와 리소스 제어'));
  main.appendChild(goals);
  layout.appendChild(main);

  const aside = autoNode('publish aside', 'VERTICAL', 18, 22);
  fixedWidth(aside, 292);
  surface(aside, C.surface, 20, C.border);
  aside.appendChild(text('PUBLISH CHECK', 10, 'black', C.brand));
  aside.appendChild(text('배포 전 확인', 19, 'black', C.text));
  ['✓  최소 1개 이상의 목표', '✓  월간 마일스톤', '✓  실행 가능한 일일 목표'].forEach((value) => aside.appendChild(text(value, 11, 'bold', C.textSub, 248)));
  aside.appendChild(simpleCard('publish now', '바로 공개하기', '저장 즉시 사용자가 탐색할 수 있습니다.', 248));
  const save = instance(components.buttonPrimary, { label: '커리큘럼 저장  →' });
  fixedWidth(save, 248);
  aside.appendChild(save);
  layout.appendChild(aside);
  content.appendChild(layout);
  return page;
}

async function run() {
  if (figma.editorType !== 'figma') {
    figma.closePlugin('Figma Design 파일에서 실행해주세요.');
    return;
  }
  await loadFonts();
  await figma.loadAllPagesAsync();
  const foundations = createFoundations();
  const { components } = createComponents();
  createLoginScreen();
  createHomeScreen(components);
  createInfoScreen(components);
  createInfoDetailScreen(components);
  createCurriculaScreen(components);
  createCurriculumDetailScreen(components);
  createMatchingScreen(components);
  createActivityScreen(components);
  createMyPageScreen(components);
  createApplicationsScreen(components);
  createApplicationDetailScreen(components);
  createTemplatesScreen(components);
  const studioPage = createStudioScreen(components);
  await figma.setCurrentPageAsync(studioPage);
  figma.viewport.scrollAndZoomIntoView(studioPage.children);
  figma.notify('끼리끼리 웹 디자인 시스템과 전체 화면을 생성했습니다.');
  figma.closePlugin('KKIRI 웹 디자인 생성 완료');
  return foundations;
}

run().catch((error) => {
  console.error(error);
  figma.closePlugin(`생성 실패: ${error instanceof Error ? error.message : String(error)}`);
});
