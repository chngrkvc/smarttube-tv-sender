/**
 * Saf yardımcı fonksiyonların testleri.
 * Çalıştır: node test/lounge.test.cjs
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

const helper = require(path.join(__dirname, '..', 'smarttube-sender.user.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (error) {
    failed++;
    console.error('  FAIL ' + name);
    console.error('       ' + error.message);
  }
}

// --- videoIdFromUrl ---------------------------------------------------------

test('watch URL', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('watch URL with extra params', () => {
  assert.strictEqual(
    helper.videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s'),
    'dQw4w9WgXcQ'
  );
});

test('shorts URL', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/shorts/aBcDeFgHiJk'), 'aBcDeFgHiJk');
});

test('live URL', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/live/aBcDeFgHiJk?feature=share'), 'aBcDeFgHiJk');
});

test('youtu.be URL is tolerated', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://youtu.be/aBcDeFgHiJk?t=10'), 'aBcDeFgHiJk');
});

test('home page has no video', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/'), null);
});

test('playlist page has no video', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/playlist?list=PL123'), null);
});

test('search page has no video', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/results?search_query=test'), null);
});

test('other host has no video', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
});

test('too short video id is rejected', () => {
  assert.strictEqual(helper.videoIdFromUrl('https://www.youtube.com/watch?v=abc'), null);
});

// --- Lounge yanıt ayrıştırma ------------------------------------------------

/** Lounge `bc/bind` yanıtını üretir: uzunluk öneki + JSON dizisi. */
function encodeChunk(events) {
  const json = JSON.stringify(events);
  return Buffer.byteLength(json, 'utf8') + '\n' + json;
}

const sampleSession = [
  [5, ['c', 'SID-abc', 'CVER-1']],
  [6, ['S', 'GSESSION-xyz']]
];

test('tek parça yanıt ayrıştırılır', () => {
  const events = helper.parseLoungeResponse(encodeChunk(sampleSession));
  assert.strictEqual(events.length, 2);
  assert.deepStrictEqual(events[0], [5, ['c', 'SID-abc', 'CVER-1']]);
});

test('art arda gelen parçalar birleştirilir', () => {
  const text = encodeChunk([[5, ['c', 'SID-1']]]) + encodeChunk([[6, ['S', 'GSID-1']]]);
  const events = helper.parseLoungeResponse(text);
  assert.strictEqual(events.length, 2);
  assert.deepStrictEqual(events[1], [6, ['S', 'GSID-1']]);
});

test('baştaki )]}\' koruması atlanır', () => {
  const text = ")]}'\n" + encodeChunk(sampleSession);
  const events = helper.parseLoungeResponse(text);
  assert.strictEqual(events.length, 2);
});

test('oturum bilgileri çıkarılır', () => {
  const events = helper.parseLoungeResponse(encodeChunk(sampleSession));
  assert.deepStrictEqual(helper.extractSession(events), {
    sid: 'SID-abc',
    gsessionid: 'GSESSION-xyz',
    aid: 6
  });
});

test('eksik oturumda null döner', () => {
  const events = helper.parseLoungeResponse(encodeChunk([[5, ['c', 'SID-abc']]]));
  assert.strictEqual(helper.extractSession(events), null);
});

test('bozuk girdi çökmez', () => {
  assert.deepStrictEqual(helper.parseLoungeResponse('not a lounge response'), []);
  assert.deepStrictEqual(helper.parseLoungeResponse(''), []);
  assert.deepStrictEqual(helper.parseLoungeResponse(null), []);
  assert.strictEqual(helper.extractSession([]), null);
  assert.strictEqual(helper.extractSession(null), null);
});

test('çok baytlı (Türkçe) içerik doğru kesilir', () => {
  const events = [[7, ['c', 'SID-ığüş', 'Türkçe içerik üğşiöç']], [8, ['S', 'GSID-ığ']]];
  const text = encodeChunk(events);
  const parsed = helper.parseLoungeResponse(text);
  assert.strictEqual(parsed.length, 2);
  assert.deepStrictEqual(helper.extractSession(parsed), { sid: 'SID-ığüş', gsessionid: 'GSID-ığ', aid: 8 });
});

test('Buffer girdisi doğrudan ayrıştırılır', () => {
  const bytes = Buffer.from(")]}'\n" + encodeChunk(sampleSession), 'utf8');
  const parsed = helper.parseLoungeResponse(bytes);
  assert.deepStrictEqual(helper.extractSession(parsed), { sid: 'SID-abc', gsessionid: 'GSESSION-xyz', aid: 6 });
});

test('kesilmiş yanıt çökmeden kısmi sonuç döner', () => {
  const text = encodeChunk(sampleSession);
  const parsed = helper.parseLoungeResponse(text.slice(0, text.length - 5));
  assert.ok(Array.isArray(parsed));
});

// --- pickLocale -------------------------------------------------------------

test('pickLocale: Türkçe sistem dili', () => {
  assert.strictEqual(helper.pickLocale(['tr-TR', 'en-US']), 'tr');
});

test('pickLocale: İspanyolca sistem dili', () => {
  assert.strictEqual(helper.pickLocale(['es-ES', 'en-US']), 'es');
  assert.strictEqual(helper.pickLocale(['es-419']), 'es');
});

test('pickLocale: İngilizce sistem dili', () => {
  assert.strictEqual(helper.pickLocale(['en-GB']), 'en');
});

test('pickLocale: desteklenmeyen diller atlanır', () => {
  assert.strictEqual(helper.pickLocale(['de-DE', 'fr-FR', 'es-MX']), 'es');
  assert.strictEqual(helper.pickLocale(['de-DE', 'fr-FR']), 'en');
});

test('pickLocale: boş/bozuk girdi İngilizceye düşer', () => {
  assert.strictEqual(helper.pickLocale([]), 'en');
  assert.strictEqual(helper.pickLocale(null), 'en');
  assert.strictEqual(helper.pickLocale(undefined), 'en');
  assert.strictEqual(helper.pickLocale([null, '', '  ']), 'en');
});

test('pickLocale: büyük harf ve boşluk toleransı', () => {
  assert.strictEqual(helper.pickLocale([' TR-tr ']), 'tr');
});

console.log('\n' + passed + ' geçti, ' + failed + ' başarısız');
process.exit(failed === 0 ? 0 : 1);
