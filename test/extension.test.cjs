'use strict';

/**
 * Eklenti paketinin tutarlılığını doğrular:
 *   - manifest geçerli mi, sürüm userscript ile aynı mı?
 *   - content.js, userscript kaynağıyla birebir aynı mı (kayma olmasın)?
 *   - ikonlar geçerli PNG mi?
 *
 *   node test/extension.test.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const USERSCRIPT = path.join(ROOT, 'smarttube-sender.user.js');
const EXTENSION = path.join(ROOT, 'extension');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function userscriptVersion(source) {
  const match = source.match(/^\/\/ @version\s+(\S+)/m);
  return match ? match[1] : null;
}

function userscriptBody(source) {
  const marker = '// ==/UserScript==';
  const index = source.indexOf(marker);
  if (index === -1) throw new Error('userscript başlığı bulunamadı');
  return source.slice(index + marker.length).replace(/^\r?\n/, '');
}

function extensionBody(source) {
  const index = source.indexOf('\n');
  const second = source.indexOf('\n', index + 1);
  return source.slice(second + 1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
const content = fs.readFileSync(path.join(EXTENSION, 'content.js'), 'utf8');
const userscript = fs.readFileSync(USERSCRIPT, 'utf8');

test('manifest: Manifest V3', () => {
  assert.strictEqual(manifest.manifest_version, 3);
});

test('manifest: sürüm userscript ile aynı', () => {
  assert.strictEqual(manifest.version, userscriptVersion(userscript));
});

test('manifest: ad/açıklama yerelleştirilmiş', () => {
  assert.strictEqual(manifest.name, '__MSG_extName__');
  assert.strictEqual(manifest.description, '__MSG_extDescription__');
  assert.strictEqual(manifest.default_locale, 'en');
});

test('yerelleştirme: tr/en/es mesajları eksiksiz', () => {
  for (const locale of ['tr', 'en', 'es']) {
    const file = path.join(EXTENSION, '_locales', locale, 'messages.json');
    assert.ok(fs.existsSync(file), locale + '/messages.json yok');
    const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of ['extName', 'extDescription']) {
      assert.ok(messages[key] && typeof messages[key].message === 'string', locale + '/' + key + ' eksik');
      assert.ok(messages[key].message.trim().length > 0, locale + '/' + key + ' boş');
    }
    assert.ok(messages.extName.message.length <= 45, locale + ': ad 45 karakteri aşıyor');
    assert.ok(messages.extDescription.message.length <= 132, locale + ': açıklama 132 karakteri aşıyor');
  }
});

test('yerelleştirme: userscript ile aynı diller', () => {
  const match = userscript.match(/SUPPORTED_LOCALES\s*=\s*\[([^\]]+)\]/);
  assert.ok(match, 'SUPPORTED_LOCALES bulunamadı');
  const locales = match[1].split(',').map((item) => item.trim().replace(/['"]/g, '')).sort();
  const dirs = fs.readdirSync(path.join(EXTENSION, '_locales')).sort();
  assert.deepStrictEqual(locales, dirs);
});

test('manifest: content script youtube.com üzerinde', () => {
  assert.strictEqual(manifest.content_scripts.length, 1);
  const script = manifest.content_scripts[0];
  assert.deepStrictEqual(script.js, ['content.js']);
  assert.ok(script.matches.includes('https://www.youtube.com/*'));
  assert.strictEqual(script.all_frames, false);
});

test('manifest: ikonlar tanımlı ve dosyalar var', () => {
  for (const size of [16, 32, 48, 128]) {
    const rel = manifest.icons[String(size)];
    assert.ok(rel, size + ' ikonu tanımlı olmalı');
    assert.ok(fs.existsSync(path.join(EXTENSION, rel)), rel + ' bulunamadı');
  }
});

test('manifest: gereksiz izin yok', () => {
  assert.strictEqual(manifest.permissions, undefined);
  assert.deepStrictEqual(manifest.host_permissions, ['https://www.youtube.com/*']);
});

test('content.js: userscript gövdesiyle birebir aynı', () => {
  assert.strictEqual(extensionBody(content), userscriptBody(userscript));
});

test('content.js: userscript başlığı taşımıyor', () => {
  assert.ok(content.indexOf('==UserScript==') === -1);
  assert.ok(content.indexOf('// @match') === -1);
});

test('ikonlar: geçerli PNG ve doğru boyut', () => {
  for (const size of [16, 32, 48, 128]) {
    const buffer = fs.readFileSync(path.join(EXTENSION, 'icons', 'icon' + size + '.png'));
    const signature = buffer.subarray(0, 8).toString('hex');
    assert.strictEqual(signature, '89504e470d0a1a0a', 'PNG imzası');
    assert.strictEqual(buffer.readUInt32BE(16), size, 'genişlik');
    assert.strictEqual(buffer.readUInt32BE(20), size, 'yükseklik');
  }
});

test('ikonlar: yuvarlak kırmızı zemin + beyaz oynat üçgeni', () => {
  const zlib = require('zlib');
  const buffer = fs.readFileSync(path.join(EXTENSION, 'icons', 'icon128.png'));
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = 128 * 4 + 1;
  const pixel = (x, y) => {
    const base = y * stride + 1 + x * 4;
    return [raw[base], raw[base + 1], raw[base + 2], raw[base + 3]];
  };

  assert.deepStrictEqual(pixel(2, 2), [0, 0, 0, 0], 'köşe saydam');
  assert.deepStrictEqual(pixel(64, 8), [255, 0, 51, 255], 'üst kenar kırmızı');
  assert.deepStrictEqual(pixel(20, 64), [255, 0, 51, 255], 'sol taraf kırmızı');
  assert.deepStrictEqual(pixel(64, 64), [255, 255, 255, 255], 'orta beyaz');
});

let passed = 0;
for (const item of tests) {
  try {
    item.fn();
    passed++;
    console.log('  ok   ' + item.name);
  } catch (error) {
    console.error('  FAIL ' + item.name + '\n       ' + error.message);
    process.exitCode = 1;
  }
}

console.log('\n' + passed + ' geçti, ' + (tests.length - passed) + ' başarısız');
