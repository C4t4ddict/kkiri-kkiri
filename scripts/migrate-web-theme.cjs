// One-time, idempotent color-only migration. Light values remain exact fallbacks.
// Layout, content, images, and brand backgrounds are deliberately not rewritten.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const files = ['styles.css', 'styles/workspace.css', 'styles/curricula.css',
  'styles/calendar.css', 'activity-documents.css', 'pages/journey.css',
  'features/activity/ActivityProgress.css'];
const colorPattern = /#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b|rgba?\([\d\s.,%]+\)|\bwhite\b|\bblack\b/gi;
function rgb(value) {
  if (value === 'white') return [255, 255, 255, 1];
  if (value === 'black') return [0, 0, 0, 1];
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  }
  const values = value.match(/[\d.]+/g).map(Number);
  return [...values.slice(0, 3), values[3] ?? 1];
}
function family(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return 'accent';
  let hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return hue < 18 || hue >= 345 ? 'danger' : hue < 65 ? 'warning' : hue < 175 ? 'success' : hue < 245 ? 'info' : 'accent';
}
function transform(color, property, selector) {
  const [r, g, b, alpha] = rgb(color.toLowerCase());
  const mean = (r + g + b) / 3, delta = Math.max(r, g, b) - Math.min(r, g, b);
  let token;
  if (/^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(property)) {
    // Light foregrounds on branded heroes/buttons/code blocks must stay light.
    if (mean > 202 || alpha < .5) return color;
    token = delta < 50 ? (mean < 68 ? 'text' : mean < 133 ? 'text-sub' : 'text-muted') : family(r, g, b);
  } else if (/^(background|background-color|background-image)$/.test(property)) {
    if (selector.includes('.cp-organization-icon.has-logo') || mean < 180 || alpha < .5) return color;
    token = selector === ':root' ? 'canvas' : alpha < 1 ? 'chrome' : delta > 12 ? `${family(r, g, b)}-soft`
      : mean >= 251 ? 'surface' : mean >= 231 ? 'surface-subtle' : 'surface-muted';
  } else if (/^(border.*|outline.*)$/.test(property)) {
    if (alpha < .5) return color;
    token = delta > 55 ? 'border-accent' : 'border';
  }
  return token ? `var(--theme-${token}, ${color})` : color;
}
for (const file of files) {
  const location = path.resolve(__dirname, '../web/src', file);
  const source = fs.readFileSync(location, 'utf8');
  const root = postcss.parse(source);
  let changed = 0;
  root.walkDecls(decl => {
    if (decl.prop.startsWith('--') || decl.value.includes('--theme-') || /url\(/i.test(decl.value)) return;
    const old = decl.value;
    decl.value = old.replace(colorPattern, color => transform(color, decl.prop, decl.parent.selector || ''));
    if (/^(color|fill|stroke)$/.test(decl.prop)) {
      decl.value = decl.value.replace(/var\(--primary(?:-dark|-light)?\)/g, value => `var(--theme-accent, ${value})`);
    }
    if (old !== decl.value) changed += 1;
  });
  if (changed) fs.writeFileSync(location, root.toString());
  console.log(`${file}: ${changed} color declarations`);
}
