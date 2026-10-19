// ==UserScript==
// @name         SmartTube TV'ye Gönder
// @name:en      Send to SmartTube
// @namespace    https://github.com/local/smarttube-tv-sender
// @version      1.2.0
// @description  YouTube'da izlediğin videoyu SmartTube (Android TV) uygulamasında açar. Ekran yansıtma yapmaz; video TV'de native oynar. Düğme oynatıcı kontrol çubuğunda; yayın çubuğu sayfa yenilense de kaybolmaz.
// @description:en Open the YouTube video you are watching in SmartTube on your Android TV. No screen mirroring.
// @author       cihangir
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/* eslint-disable no-empty */
(function () {
  'use strict';

  /**
   * Bu script YouTube Lounge API'sini (telefon YouTube uygulamasındaki
   * "TV'ye gönder" ile aynı mekanizma) kullanır:
   *
   *   1) SmartTube ekranda gösterdiği TV kodunu `pairing/get_screen` ile
   *      `screenId`'ye çevirir (giriş/hesap GEREKMEZ).
   *   2) `pairing/get_lounge_token_batch` ile o ekran için geçici token alır.
   *   3) `bc/bind` + `setPlaylist` ile videoyu TV'de açar.
   *
   * Tüm istekler youtube.com'a yapılır; 3. taraf sunucu yoktur, çerez gönderilmez.
   */

  var API_BASE = 'https://www.youtube.com/api/lounge/';
  var STORAGE_KEY = 'smarttube-sender:screen-id';
  var CAST_KEY = 'smarttube-sender:cast';
  var VIDEO_ID_RE = /^[-\w]{11}$/;
  var SENDER_NAME = 'SmartTube Web Sender';

  /** Kullanıcı ayarları. */
  var OPTIONS = {
    /** Gönderim başarılı olunca Mac'teki video duraklatılsın mı? */
    pauseLocalAfterSend: true,
    /** Alttaki "TV'de oynatılıyor" çubuğu gösterilsin mi? */
    showCastBar: true,
    /** TV durumunu kaç ms'de bir tazelensin (0 = kapalı). */
    castPollMs: 10000,
    /** Sayfa yenilenince/açılınca süren yayın geri yüklensin mi? */
    restoreCastOnLoad: true
  };

  var STRINGS = {
    tr: {
      btnIdle: '📺 TV\'de aç',
      btnSending: 'Gönderiliyor…',
      btnSent: '✓ Gönderildi',
      btnError: '⚠ Gönderilemedi',
      tooltip: 'Videoyu SmartTube\'da aç (sağ tık: eşleştirmeyi sıfırla)',
      dialogTitle: 'SmartTube ile eşleştir',
      dialogText: 'TV\'de SmartTube\'u aç → Ayarlar → Remote control → ekrandaki kodu buraya gir. Kod yalnızca bir kez sorulur.',
      dialogPlaceholder: 'TV kodu',
      dialogOk: 'Bağlan',
      dialogCancel: 'İptal',
      dialogEmpty: 'Kodu girmedin.',
      errBadCode: 'TV kodu geçersiz ya da süresi dolmuş. SmartTube → Ayarlar → Remote control\'den yeni kod al.',
      errExpired: 'Eşleştirme süresi doldu. Butona tekrar basıp yeni TV kodunu gir.',
      errOffline: 'TV\'de SmartTube açık değil. Uygulamayı açıp tekrar dene.',
      errSession: 'TV ile oturum kurulamadı. Tekrar dene.',
      errTimeout: 'TV yanıt vermedi (zaman aşımı). Tekrar dene.',
      errGeneric: 'Beklenmeyen hata',
      errResponse: 'Beklenmeyen yanıt',
      errNoVideo: 'Bu sayfada bir YouTube videosu bulunamadı.',
      msgPaired: 'TV eşleştirildi ✓',
      msgReset: 'Eşleştirme sıfırlandı.',
      msgNotPaired: 'Sıfırlanacak bir eşleştirme yok.',
      confirmReset: 'SmartTube eşleştirmesi sıfırlansın mı? Bir sonraki gönderimde TV kodu yeniden sorulur.',
      castPlaying: 'TV\'de oynatılıyor',
      castPaused: 'TV\'de duraklatıldı',
      castBuffering: 'TV\'de yükleniyor',
      castEnded: 'TV\'de bitti',
      castOffline: 'TV bağlantısı koptu',
      castPause: 'TV\'de duraklat',
      castPlay: 'TV\'de oynat',
      castNext: 'TV\'de sonraki video',
      castStop: 'Yayını bitir',
      castAlready: 'Bu video zaten TV\'de oynatılıyor.',
      castStopped: 'TV bağlantısı kesildi.',
      castLost: 'TV bağlantısı koptu. Videoyu yeniden gönder.',
      castCommandFailed: 'TV komutu gönderilemedi.'
    },
    en: {
      btnIdle: '📺 Play on TV',
      btnSending: 'Sending…',
      btnSent: '✓ Sent',
      btnError: '⚠ Failed',
      tooltip: 'Open this video in SmartTube (right-click: reset pairing)',
      dialogTitle: 'Pair with SmartTube',
      dialogText: 'Open SmartTube on your TV → Settings → Remote control → enter the code shown there. You only type it once.',
      dialogPlaceholder: 'TV code',
      dialogOk: 'Pair',
      dialogCancel: 'Cancel',
      dialogEmpty: 'No code entered.',
      errBadCode: 'The TV code is invalid or expired. Get a new one in SmartTube → Settings → Remote control.',
      errExpired: 'Pairing expired. Press the button again and enter a new TV code.',
      errOffline: 'SmartTube is not open on the TV. Open the app and try again.',
      errSession: 'Could not create a session with the TV. Try again.',
      errTimeout: 'The TV did not respond (timeout). Try again.',
      errGeneric: 'Unexpected error',
      errResponse: 'Unexpected response',
      errNoVideo: 'No YouTube video found on this page.',
      msgPaired: 'TV paired ✓',
      msgReset: 'Pairing reset.',
      msgNotPaired: 'Nothing to reset.',
      confirmReset: 'Reset the SmartTube pairing? The TV code will be asked again on the next send.',
      castPlaying: 'Playing on TV',
      castPaused: 'Paused on TV',
      castBuffering: 'Buffering on TV',
      castEnded: 'Ended on TV',
      castOffline: 'TV connection lost',
      castPause: 'Pause on TV',
      castPlay: 'Play on TV',
      castNext: 'Next video on TV',
      castStop: 'Stop casting',
      castAlready: 'This video is already playing on the TV.',
      castStopped: 'TV connection closed.',
      castLost: 'TV connection lost. Send the video again.',
      castCommandFailed: 'Could not send the command to the TV.'
    }
  };

  var STYLE = [
    '#smarttube-sender-button{position:fixed;z-index:2147483000;bottom:80px;right:24px;display:none;align-items:center;gap:8px;padding:10px 16px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(18,18,18,.9);color:#fff;font:500 13px/1.2 "YouTube Sans",Roboto,system-ui,-apple-system,sans-serif;letter-spacing:.2px;cursor:pointer;opacity:.85;user-select:none;-webkit-user-select:none;box-shadow:0 6px 24px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);transition:background .15s ease,transform .12s ease,opacity .2s ease}',
    '#smarttube-sender-button[data-visible="1"]{display:inline-flex}',
    '#smarttube-sender-button[data-on="shorts"]{left:16px;right:auto;bottom:96px}',
    '#smarttube-sender-button:hover{background:rgba(255,255,255,.16);opacity:1}',
    '#smarttube-sender-button:active{transform:scale(.97)}',
    '#smarttube-sender-button[data-state="sending"]{opacity:.75;cursor:progress}',
    '#smarttube-sender-button[data-state="sent"]{background:#1a7f37;border-color:rgba(255,255,255,.25)}',
    '#smarttube-sender-button[data-state="error"]{background:#7f1d1d}',
    '#smarttube-sender-button[data-casting="1"]{background:#1565c0;border-color:rgba(255,255,255,.35)}',
    '#smarttube-sender-button .stb-icon{font-size:15px;line-height:1}',
    '#smarttube-sender-button .stb-label{white-space:nowrap}',
    '#smarttube-sender-button[data-in-controls="1"]{position:static;width:36px;height:100%;min-width:36px;padding:0;margin:0;gap:0;border:0;border-radius:0;background:transparent;box-shadow:none;opacity:.85;font-size:0;vertical-align:top}',
    '#smarttube-sender-button[data-in-controls="1"]:hover{background:transparent;opacity:1}',
    '#smarttube-sender-button[data-in-controls="1"]:active{transform:none}',
    '#smarttube-sender-button[data-in-controls="1"][data-state="sent"]{background:transparent}',
    '#smarttube-sender-button[data-in-controls="1"][data-state="error"]{background:transparent}',
    '#smarttube-sender-button[data-in-controls="1"][data-casting="1"]{background:transparent;box-shadow:inset 0 -2px 0 0 #3ea6ff}',
    '#smarttube-sender-button[data-in-controls="1"] .stb-icon{font-size:19px}',
    '#smarttube-sender-button[data-in-controls="1"] .stb-label{display:none}',
    '#smarttube-castbar{position:fixed;z-index:2147482999;left:50%;transform:translateX(-50%);bottom:24px;display:none;width:min(560px,calc(100vw - 32px));align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(20,20,20,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 40px rgba(0,0,0,.55);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;font:400 13px/1.3 "YouTube Sans",Roboto,system-ui,-apple-system,sans-serif}',
    '#smarttube-castbar[data-visible="1"]{display:flex}',
    '#smarttube-castbar[data-on="shorts"]{bottom:96px}',
    '#smarttube-castbar .stc-progress{position:absolute;left:10px;right:10px;top:0;height:3px;border-radius:3px;background:rgba(255,255,255,.16);overflow:hidden}',
    '#smarttube-castbar .stc-progress i{display:block;height:100%;width:0;background:#3ea6ff;transition:width .5s ease}',
    '#smarttube-castbar .stc-thumb{width:64px;height:36px;border-radius:6px;object-fit:cover;background:#000;flex:0 0 auto}',
    '#smarttube-castbar .stc-meta{flex:1 1 auto;min-width:0}',
    '#smarttube-castbar .stc-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#smarttube-castbar .stc-status{color:#3ea6ff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#smarttube-castbar[data-lost="1"] .stc-status{color:#ff6b6b}',
    '#smarttube-castbar .stc-actions{display:flex;align-items:center;gap:4px;flex:0 0 auto}',
    '#smarttube-castbar .stc-btn{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:transparent;color:#fff;font-size:15px;line-height:1;cursor:pointer;transition:background .15s ease}',
    '#smarttube-castbar .stc-btn:hover{background:rgba(255,255,255,.16)}',
    '#smarttube-castbar .stc-close{font-size:13px;color:#bbb}',
    '#smarttube-sender-toast{position:fixed;z-index:2147483001;left:50%;bottom:112px;max-width:340px;padding:12px 14px;border-radius:10px;background:rgba(18,18,18,.97);color:#fff;border-left:3px solid #ff0033;font:400 13px/1.45 Roboto,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transform:translateX(-50%) translateY(6px);transition:opacity .18s ease,transform .18s ease;pointer-events:none}',
    '#smarttube-sender-toast[data-visible="1"]{opacity:1;transform:translateX(-50%)}',
    '#smarttube-sender-toast[data-kind="ok"]{border-left-color:#34d058}',
    '#smarttube-sender-toast[data-kind="warn"]{border-left-color:#f0b429}',
    '#smarttube-sender-overlay{position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}',
    '#smarttube-sender-dialog{width:min(430px,calc(100vw - 32px));background:#212121;color:#fff;border-radius:14px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.6);font:400 14px/1.5 Roboto,system-ui,sans-serif}',
    '#smarttube-sender-dialog h2{margin:0 0 8px;font-size:17px;font-weight:600}',
    '#smarttube-sender-dialog p{margin:0 0 16px;color:#aaa;font-size:13px}',
    '#smarttube-sender-dialog input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #444;background:#121212;color:#fff;font:600 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:2px;text-align:center;outline:none}',
    '#smarttube-sender-dialog input:focus{border-color:#ff0033}',
    '#smarttube-sender-dialog .sts-err{color:#ff6b6b;font-size:12px;min-height:16px;margin-top:8px}',
    '#smarttube-sender-dialog .sts-row{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}',
    '#smarttube-sender-dialog button{padding:9px 16px;border-radius:999px;border:1px solid transparent;font:500 13px/1 Roboto,system-ui,sans-serif;cursor:pointer}',
    '#smarttube-sender-dialog button.sts-primary{background:#ff0033;color:#fff}',
    '#smarttube-sender-dialog button.sts-ghost{background:transparent;color:#ddd;border-color:#444}'
  ].join('\n');

  // --- Saf yardımcılar (test edilebilir) ------------------------------------

  function videoIdFromUrl(href) {
    try {
      var url = new URL(href);
      if (url.hostname === 'youtu.be') {
        var short = url.pathname.slice(1).split('/')[0];
        return VIDEO_ID_RE.test(short) ? short : null;
      }
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      if (url.pathname === '/watch') {
        var id = url.searchParams.get('v') || '';
        return VIDEO_ID_RE.test(id) ? id : null;
      }
      var match = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([-\w]{11})(?:[/?]|$)/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  var UTF8_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var UTF8_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    var text = value == null ? '' : String(value);
    if (UTF8_ENCODER) return UTF8_ENCODER.encode(text);
    var bytes = [];
    for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff);
    return new Uint8Array(bytes);
  }

  function bytesToText(bytes) {
    if (UTF8_DECODER) return UTF8_DECODER.decode(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  /**
   * Lounge `bc/bind` yanıtı: uzunluk önekli, art arda JSON parçaları.
   * Önek BAYT cinsindendir, bu yüzden ayrıştırma bayt bazında yapılır.
   * Girdi: Uint8Array/ArrayBuffer veya metin.
   */
  function parseLoungeResponse(input) {
    var bytes = toBytes(input);
    var i = 0;

    // Google delta protokolü koruması: )]}'
    if (bytes[0] === 0x29 && bytes[1] === 0x5d && bytes[2] === 0x7d && bytes[3] === 0x27) {
      while (i < bytes.length && bytes[i] !== 0x0a) i++;
      i++;
    }

    var events = [];
    while (i < bytes.length) {
      while (i < bytes.length && (bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x20 || bytes[i] === 0x09)) i++;
      if (i >= bytes.length) break;

      var start = i;
      while (i < bytes.length && bytes[i] >= 0x30 && bytes[i] <= 0x39) i++;
      if (i === start || i >= bytes.length || bytes[i] !== 0x0a) break;

      var length = Number(bytesToText(bytes.subarray(start, i)));
      if (!Number.isInteger(length) || length <= 0) break;

      i++; // \n
      if (i + length > bytes.length) break;

      try {
        var parsed = JSON.parse(bytesToText(bytes.subarray(i, i + length)));
        if (Array.isArray(parsed)) events.push.apply(events, parsed);
        else events.push(parsed);
      } catch (e) {
        break;
      }
      i += length;
    }
    return events;
  }

  function extractSession(events) {
    var list = Array.isArray(events) ? events : [];
    var pick = function (code) {
      for (var k = 0; k < list.length; k++) {
        var ev = list[k];
        if (Array.isArray(ev) && Array.isArray(ev[1]) && ev[1][0] === code) return ev[1][1];
      }
      return null;
    };

    var sid = pick('c');
    var gsessionid = pick('S');
    var last = list.length ? list[list.length - 1] : null;
    var aid = Array.isArray(last) ? last[0] : null;

    if (!sid || !gsessionid || aid === null || aid === undefined) return null;
    return { sid: sid, gsessionid: gsessionid, aid: aid };
  }

  function timeoutSignal(ms) {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  }

  // --- Node (test) çıkışı ---------------------------------------------------

  if (typeof document === 'undefined' && typeof module === 'object' && module.exports) {
    module.exports = {
      videoIdFromUrl: videoIdFromUrl,
      parseLoungeResponse: parseLoungeResponse,
      extractSession: extractSession
    };
    return;
  }

  // --- Tarayıcı (userscript) ------------------------------------------------

  bootstrap();

  function bootstrap() {
    if (window.top !== window.self) return;

    var lang = String(document.documentElement.lang || navigator.language || '').toLowerCase();
    var L = lang.indexOf('tr') === 0 ? STRINGS.tr : STRINGS.en;

    var button = null;
    var buttonIcon = null;
    var buttonLabel = null;
    var buttonText = '';
    var toastEl = null;
    var state = 'idle';
    var busy = false;
    var toastTimer = null;
    var sentTimer = null;
    var refreshTimer = null;
    var burstTimer = null;
    var waitingSince = 0;

    /** Aktif yayın oturumu (yoksa null). */
    var cast = null;
    /** TV durumunu tazeleyen zamanlayıcı. */
    var castTimer = null;
    /** Cast çubuğunun DOM referansları. */
    var castBar = null;
    /** Açılışta çalışan geri yükleme (varsa Promise). */
    var restoring = null;

    var UserError = function (kind, message) {
      this.name = 'UserError';
      this.kind = kind;
      this.message = message;
    };
    UserError.prototype = Object.create(Error.prototype);

    // --- HTTP -------------------------------------------------------------

    function apiRequest(path, body, params) {
      var url = new URL(API_BASE + path);
      Object.keys(params || {}).forEach(function (key) {
        url.searchParams.set(key, String(params[key]));
      });

      return fetch(url.href, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(body || {}).toString(),
        credentials: 'omit',
        cache: 'no-store',
        signal: timeoutSignal(15000)
      }).then(function (res) {
        return res.arrayBuffer().then(function (buffer) {
          if (!res.ok) {
            var error = new Error('HTTP ' + res.status);
            error.status = res.status;
            error.body = bytesToText(new Uint8Array(buffer)).slice(0, 300);
            throw error;
          }
          return new Uint8Array(buffer);
        });
      });
    }

    function apiText(path, body, params) {
      return apiRequest(path, body, params).then(bytesToText);
    }

    function apiJson(path, body, params) {
      return apiText(path, body, params).then(function (text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new UserError('response', L.errResponse);
        }
      });
    }

    // --- Eşleştirme -------------------------------------------------------

    function pairWithCode(code) {
      return apiJson('pairing/get_screen', { pairing_code: code }).then(function (data) {
        var screenId = data && data.screen && data.screen.screenId;
        if (!screenId) throw new UserError('pairing', L.errBadCode);
        localStorage.setItem(STORAGE_KEY, screenId);
        return screenId;
      }).catch(function (error) {
        if (error && (error.status === 400 || error.status === 404)) throw new UserError('pairing', L.errBadCode);
        throw error;
      });
    }

    function getLoungeToken(screenId) {
      return apiJson('pairing/get_lounge_token_batch', { screen_ids: screenId }).then(function (data) {
        var screens = (data && data.screens) || [];
        var token = screens[0] && screens[0].loungeToken;
        if (!token) {
          localStorage.removeItem(STORAGE_KEY);
          throw new UserError('expired', L.errExpired);
        }
        return token;
      });
    }

    function ensurePaired(askAgain) {
      var stored = askAgain ? null : localStorage.getItem(STORAGE_KEY);
      var screenIdPromise = stored
        ? Promise.resolve(stored)
        : openCodeDialog().then(function (code) {
            if (!code) return null;
            return pairWithCode(code).then(function (screenId) {
              toast(L.msgPaired, 'ok');
              return screenId;
            });
          });

      return screenIdPromise.then(function (screenId) {
        if (!screenId) return null;
        return getLoungeToken(screenId).then(function (token) {
          return { screenId: screenId, token: token };
        });
      });
    }

    function assertOnline(token) {
      return apiJson('pairing/get_screen_availability', { lounge_token: token }).then(function (data) {
        var screens = (data && data.screens) || [];
        if (!screens[0] || screens[0].status !== 'online') throw new UserError('offline', L.errOffline);
      });
    }

    // --- Yayın oturumu (cast) ---------------------------------------------

    function castCommonParams(rid) {
      return {
        name: SENDER_NAME,
        loungeIdToken: cast.token,
        SID: cast.sid,
        AID: String(cast.aid),
        gsessionid: cast.gsessionid,
        device: 'REMOTE_CONTROL',
        app: 'youtube-desktop',
        VER: '8',
        v: '2',
        RID: String(rid)
      };
    }

    /** Gelen olayları oturum durumuna işler. */
    function applyEvents(bytes) {
      var events = parseLoungeResponse(bytes);
      if (!events.length || !cast) return events;

      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (!Array.isArray(event) || !Array.isArray(event[1])) continue;
        var type = event[1][0];
        var arg = event[1][1];

        if (type === 'c') cast.sid = arg;
        else if (type === 'S') cast.gsessionid = arg;
        else if (type === 'nowPlaying') applyNowPlaying(arg);
        else if (type === 'onStateChange') cast.state = String(arg);
        else if (type === 'loungeScreenDisconnected') cast.lost = true;
      }

      var last = events[events.length - 1];
      if (Array.isArray(last) && last[0] !== null && last[0] !== undefined) cast.aid = last[0];
      return events;
    }

    function applyNowPlaying(data) {
      if (!data) return;
      if (data.videoId) cast.videoId = data.videoId;
      if (data.currentTime !== undefined) cast.currentTime = Number(data.currentTime) || 0;
      if (data.duration !== undefined) cast.duration = Number(data.duration) || 0;
      if (data.state !== undefined) cast.state = String(data.state);
      saveCastRecord();
    }

    /** TV'ye lounge komutu gönderir (play, pause, next, setPlaylist, getNowPlaying...). */
    function castCommand(name, params) {
      var offset = cast.offset;
      cast.offset = offset + 1;

      var body = { count: '1', ofs: String(offset), req0__sc: name };
      Object.keys(params || {}).forEach(function (key) {
        body['req0_' + key] = params[key];
      });

      return apiRequest('bc/bind', body, castCommonParams(cast.offset)).then(function (bytes) {
        applyEvents(bytes);
        cast.failures = 0;
        if (cast.lost) endCast(L.castLost);
        else updateCastBar();
        return bytes;
      });
    }

    // --- Yayın kaydı (sayfa yenilenince geri yükleme) ----------------------

    /** Aktif yayını localStorage'a yazar; bir şey değişmediyse dokunmaz. */
    function saveCastRecord() {
      if (!cast || !cast.videoId) return;
      var record = {
        v: 1,
        screenId: cast.screenId,
        videoId: cast.videoId,
        title: cast.title || '',
        state: cast.state || '1',
        currentTime: Math.round(cast.currentTime || 0),
        duration: Math.round(cast.duration || 0),
        at: Date.now()
      };
      var raw = JSON.stringify(record);
      if (cast.recordRaw === raw) return;
      cast.recordRaw = raw;
      try {
        localStorage.setItem(CAST_KEY, raw);
      } catch (e) {
        // kota kapalı / gizli mod: sessizce devam
      }
    }

    function loadCastRecord() {
      try {
        var raw = localStorage.getItem(CAST_KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || data.v !== 1 || !data.screenId || !data.videoId) return null;
        return data;
      } catch (e) {
        return null;
      }
    }

    function clearCastRecord() {
      try {
        localStorage.removeItem(CAST_KEY);
      } catch (e) {
        // yoksay
      }
    }

    // --- Yayın oturumu ----------------------------------------------------

    /** bc/bind ile yeni bir Lounge oturumu açar (video göndermez). */
    function openSession(screen, draft) {
      cast = {
        screenId: screen.screenId,
        token: screen.token,
        sid: null,
        gsessionid: null,
        aid: null,
        offset: 1,
        videoId: (draft && draft.videoId) || null,
        title: (draft && draft.title) || '',
        state: (draft && draft.state) || '1',
        currentTime: Number((draft && draft.currentTime) || 0) || 0,
        duration: Number((draft && draft.duration) || 0) || 0,
        failures: 0,
        lost: false,
        recordRaw: null
      };

      return apiRequest('bc/bind', {
        app: 'web',
        'mdx-version': '3',
        name: SENDER_NAME,
        id: screen.screenId,
        device: 'REMOTE_CONTROL',
        capabilities: 'que,dsdtr,atp,vsp',
        magnaKey: 'cloudPairedDevice',
        ui: 'false',
        deviceContext: 'user_agent=browser&window_width_points=&window_height_points=&os_name=browser&ms=',
        theme: 'cl',
        loungeIdToken: screen.token
      }, { RID: '1', VER: '8', CVER: '1', auth_failure_option: 'send_error' })
        .then(function (bindBytes) {
          applyEvents(bindBytes);
          if (cast && (!cast.sid || !cast.gsessionid || cast.aid === null || cast.aid === undefined)) {
            // Yedek yol: olay ayrıştırması beklenmedik bir biçimdeyse
            var session = extractSession(parseLoungeResponse(bindBytes));
            if (session) {
              cast.sid = session.sid;
              cast.gsessionid = session.gsessionid;
              cast.aid = session.aid;
            }
          }
          if (!cast || !cast.sid || !cast.gsessionid || cast.aid === null || cast.aid === undefined) {
            cast = null;
            throw new UserError('session', L.errSession);
          }
          return cast;
        });
    }

    /** Açık oturumda videoyu oynatır (yeni oturum açmaz). */
    function sendPlaylist(videoId, title) {
      return castCommand('setPlaylist', { videoId: videoId }).then(function () {
        cast.videoId = videoId;
        cast.title = title || '';
        cast.state = '1';
        cast.currentTime = 0;
        cast.duration = 0;
        saveCastRecord();
        updateCastBar();
        startCastPolling();
        return cast;
      });
    }

    /** Yeni oturum açar ve videoyu oynatır. */
    function startCast(screen, videoId, title) {
      return openSession(screen, { videoId: videoId, title: title })
        .then(function () {
          return sendPlaylist(videoId, title);
        })
        .catch(function (error) {
          // Yarım kalan oturumu bırakma
          if (cast) endCast(null);
          throw error;
        });
    }

    /**
     * TV'ye video gönderir. Oturum zaten açıksa aynı oturumu kullanır
     * (her gönderimde yeni oturum açmak TV tarafında birikmeye yol açar).
     */
    function playOnTv(screen, videoId, title) {
      var reusable = !!(cast && !cast.lost && cast.sid && cast.screenId === screen.screenId);
      if (!reusable) return startCast(screen, videoId, title);

      return sendPlaylist(videoId, title).catch(function (error) {
        var status = error && error.status;
        if (status === 400 || status === 401 || status === 410) {
          // Oturum ölmüş: sıfırdan bağlan
          endCast(null);
          return startCast(screen, videoId, title);
        }
        throw error;
      });
    }

    /**
     * Sayfa yenilendiğinde / tarayıcı yeniden açıldığında TV'de hâlâ oynayan
     * yayını geri yükler: aynı ekrana yeni oturum açıp gerçek durumu sorar.
     */
    function restoreCast() {
      if (!OPTIONS.restoreCastOnLoad || cast) return Promise.resolve(null);
      if (restoring) return restoring;

      var record = loadCastRecord();
      if (!record) return Promise.resolve(null);
      if (localStorage.getItem(STORAGE_KEY) !== record.screenId) {
        clearCastRecord();
        return Promise.resolve(null);
      }

      restoring = apiJson('pairing/get_lounge_token_batch', { screen_ids: record.screenId })
        .then(function (data) {
          var screens = (data && data.screens) || [];
          var token = screens[0] && screens[0].loungeToken;
          if (!token) throw new UserError('expired', L.errExpired);
          return openSession({ screenId: record.screenId, token: token }, record);
        })
        .then(function () {
          return refreshCast(); // TV'nin gerçek video/süre/durum bilgisi
        })
        .then(function () {
          if (!cast) return null;
          cast.restored = true;
          saveCastRecord();
          updateCastBar();
          startCastPolling();
          return cast;
        })
        .catch(function () {
          // TV kapalı ya da oturum geçersiz: sessizce vazgeç
          if (cast) endCast(null);
          clearCastRecord();
          return null;
        })
        .then(function (result) {
          restoring = null;
          return result;
        });

      return restoring;
    }

    /**
     * TV'nin gerçek durumunu ister ve çubuğu tazeler.
     * Yoklama hatalarına karşı toleranslıdır: tek bir hata yayını bitirmez
     * (bazı TV istemcileri getNowPlaying komutunu desteklemiyor olabilir).
     */
    function refreshCast() {
      if (!cast || cast.lost) return Promise.resolve();
      return castCommand('getNowPlaying').catch(function (error) {
        if (!cast) return;
        if (error && error.status === 401) {
          endCast(L.castLost);
          return;
        }
        cast.failures = (cast.failures || 0) + 1;
        if (cast.failures >= 2) endCast(L.castLost);
      });
    }

    function startCastPolling() {
      stopCastPolling();
      if (!OPTIONS.castPollMs || OPTIONS.castPollMs <= 0) return;
      castTimer = setInterval(function () {
        if (!cast || cast.lost || document.hidden) return;
        refreshCast();
      }, OPTIONS.castPollMs);
    }

    function stopCastPolling() {
      if (castTimer) clearInterval(castTimer);
      castTimer = null;
    }

    function handleCastFailure(error) {
      if (!cast) return;
      var status = error && error.status;
      if (status === 400 || status === 401 || status === 410) {
        endCast(L.castLost);
        return;
      }
      cast.failures = (cast.failures || 0) + 1;
      if (cast.failures >= 2) {
        endCast(L.castLost);
        return;
      }
      toast(L.castCommandFailed, 'warn');
    }

    function endCast(message) {
      stopCastPolling();
      cast = null;
      hideCastBar();
      applyCastingAppearance();
      clearCastRecord();
      if (message) toast(message, 'error');
    }

    function toggleCastPlayback() {
      if (!cast) return;
      var wasPaused = cast.state === '2';
      cast.state = wasPaused ? '1' : '2';
      updateCastBar();

      castCommand(wasPaused ? 'play' : 'pause').catch(function (error) {
        if (cast) {
          cast.state = wasPaused ? '2' : '1';
          updateCastBar();
        }
        handleCastFailure(error);
      });
    }

    function nextOnTv() {
      if (!cast) return;
      castCommand('next').catch(handleCastFailure);
    }

    /** Yayını bitirir ve oturumu kapatır. */
    function terminateCast() {
      if (!cast) {
        hideCastBar();
        return Promise.resolve();
      }

      var active = cast;
      cast = null;
      stopCastPolling();
      hideCastBar();
      applyCastingAppearance();
      clearCastRecord();

      return apiRequest('bc/bind', {
        ui: '',
        TYPE: 'terminate',
        clientDisconnectReason: 'MDX_SESSION_DISCONNECT_REASON_DISCONNECTED_BY_USER'
      }, {
        name: SENDER_NAME,
        loungeIdToken: active.token,
        SID: active.sid,
        AID: String(active.aid),
        gsessionid: active.gsessionid,
        device: 'REMOTE_CONTROL',
        app: 'youtube-desktop',
        VER: '8',
        v: '2',
        CVER: '1',
        RID: String(active.offset),
        auth_failure_option: 'send_error'
      }).catch(function () {
        // TV'ye ulaşılamasa da yerel durum temizlenir
      }).then(function () {
        toast(L.castStopped, 'ok');
      });
    }

    // --- Gönderim ---------------------------------------------------------

    function send() {
      var videoId = videoIdFromUrl(location.href);
      if (!videoId) {
        toast(L.errNoVideo, 'warn');
        return Promise.resolve();
      }
      if (busy) return Promise.resolve();
      if (restoring) return restoring.then(send);

      if (cast && cast.videoId === videoId && !cast.lost) {
        toast(L.castAlready, 'warn');
        updateCastBar();
        return Promise.resolve();
      }

      busy = true;
      setState('sending');
      var title = currentVideoTitle();

      return Promise.resolve()
        .then(function () {
          return ensurePaired(false).catch(function (error) {
            if (error instanceof UserError && error.kind === 'expired') return ensurePaired(true);
            throw error;
          });
        })
        .then(function (screen) {
          if (!screen) return null;
          return assertOnline(screen.token).then(function () {
            return playOnTv(screen, videoId, title);
          });
        })
        .then(function (result) {
          if (result === null || result === undefined) {
            setState('idle');
            return;
          }
          if (OPTIONS.pauseLocalAfterSend && cast && cast.videoId === videoId) pauseLocalVideo();
          setState('sent');
          applyCastingAppearance();
          clearTimeout(sentTimer);
          sentTimer = setTimeout(function () {
            if (!busy) setState('idle');
          }, 2500);
        })
        .catch(function (error) {
          setState('error');
          var message;
          if (error instanceof UserError) message = error.message;
          else if (error && error.name === 'TimeoutError') message = L.errTimeout;
          else message = L.errGeneric + ': ' + (error && error.message ? error.message : '?');

          toast(message, 'error');
          console.warn('[smarttube-sender]', error);
          setTimeout(function () {
            if (!busy) setState('idle');
          }, 1500);
        })
        .then(function () {
          busy = false;
        });
    }

    function resetPairing() {
      if (!localStorage.getItem(STORAGE_KEY)) {
        toast(L.msgNotPaired, 'warn');
        return;
      }
      if (!window.confirm(L.confirmReset)) return;
      localStorage.removeItem(STORAGE_KEY);
      clearCastRecord();
      toast(L.msgReset, 'ok');
    }

    // --- Arayüz -----------------------------------------------------------

    function injectStyles() {
      if (document.getElementById('smarttube-sender-style')) return;
      var style = document.createElement('style');
      style.id = 'smarttube-sender-style';
      style.textContent = STYLE;
      (document.head || document.documentElement).appendChild(style);
    }

    function createUi() {
      button = document.createElement('button');
      button.id = 'smarttube-sender-button';
      button.type = 'button';
      button.setAttribute('aria-label', L.btnIdle);

      buttonIcon = document.createElement('span');
      buttonIcon.className = 'stb-icon';
      buttonIcon.textContent = '📺';
      buttonLabel = document.createElement('span');
      buttonLabel.className = 'stb-label';

      button.appendChild(buttonIcon);
      button.appendChild(buttonLabel);

      button.addEventListener('click', function () {
        send();
      });
      button.addEventListener('contextmenu', function (event) {
        event.preventDefault();
        resetPairing();
      });
      document.body.appendChild(button);

      toastEl = document.createElement('div');
      toastEl.id = 'smarttube-sender-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);

      setState('idle');
      placeButton();
    }

    function setState(next) {
      state = next;
      if (!button) return;
      button.setAttribute('data-state', next === 'idle' ? '' : next);
      button.disabled = next === 'sending';
      setButtonText(next === 'sending'
        ? L.btnSending
        : next === 'sent'
          ? L.btnSent
          : next === 'error'
            ? L.btnError
            : L.btnIdle);
      applyCastingAppearance();
    }

    /** Buton metnini ayarlar; ikon span'ı korunur (textContent kullanılmaz). */
    function setButtonText(text) {
      buttonText = text;
      if (!button) return;
      if (buttonLabel) buttonLabel.textContent = text;
      button.setAttribute('aria-label', text);
      button.title = button.getAttribute('data-in-controls') === '1'
        ? text
        : text + ' — ' + L.tooltip;
    }

    /** Buton "yayında" görünümü: bu video TV'de oynuyorsa mavi + durum metni. */
    function applyCastingAppearance() {
      if (!button) return;
      var castingNow = !!(cast && cast.videoId && cast.videoId === videoIdFromUrl(location.href));
      button.setAttribute('data-casting', castingNow ? '1' : '0');
      if (state === 'idle') setButtonText(castingNow ? '📺 ' + L.castPlaying : L.btnIdle);
    }

    /**
     * Düğmeyi YouTube oynatıcısının sağ alt kontrol kümesinin başına koyar.
     * Oynatıcı var ama kontroller henüz oluşmadıysa kısa süre gizli bekler;
     * hiç oynatıcı yoksa sağ altta yüzer.
     *
     * @returns {'controls'|'waiting'|'floating'}
     */
    function placeButton() {
      if (!button) return 'floating';

      var container = document.querySelector('.html5-video-player .ytp-right-controls') ||
        document.querySelector('.ytp-right-controls');

      if (container) {
        waitingSince = 0;
        if (button.parentNode !== container) container.insertBefore(button, container.firstChild);
        setButtonSlot('1');
        return 'controls';
      }

      if (button.parentNode !== document.body) document.body.appendChild(button);
      setButtonSlot('0');

      if (document.querySelector('.html5-video-player')) {
        // Oynatıcı var, kontroller henüz hazır değil
        if (!waitingSince) waitingSince = Date.now();
        if (Date.now() - waitingSince < 5000) return 'waiting';
      } else {
        waitingSince = 0;
      }
      return 'floating';
    }

    function setButtonSlot(value) {
      if (button.getAttribute('data-in-controls') === value) return;
      button.setAttribute('data-in-controls', value);
      if (buttonText) setButtonText(buttonText);
    }

    /** Sayfadaki videonun başlığı (bulunamazsa sekme başlığından türetilir). */
    function currentVideoTitle() {
      var el = document.querySelector('ytd-watch-metadata h1') ||
        document.querySelector('#title h1 yt-formatted-string') ||
        document.querySelector('h1.ytd-watch-metadata');
      var title = el && el.textContent ? el.textContent.trim() : '';
      if (!title) {
        title = String(document.title || '')
          .replace(/^\(\d+\)\s*/, '')
          .replace(/\s*-\s*YouTube\s*$/, '');
      }
      return title;
    }

    function localVideoElement() {
      return document.querySelector('#movie_player video') ||
        document.querySelector('video.html5-main-video') ||
        document.querySelector('video');
    }

    /** TV'de oynatma başlayınca Mac'teki videoyu duraklatır. */
    function pauseLocalVideo() {
      var video = localVideoElement();
      if (!video) return;
      try {
        video.pause();
      } catch (e) {
        // yoksay
      }
    }

    function makeCastButton(className) {
      var element = document.createElement('button');
      element.type = 'button';
      element.className = 'stc-btn ' + className;
      return element;
    }

    function createCastBar() {
      var root = document.createElement('div');
      root.id = 'smarttube-castbar';
      root.setAttribute('data-visible', '0');
      root.setAttribute('role', 'status');

      var progress = document.createElement('div');
      progress.className = 'stc-progress';
      var progressFill = document.createElement('i');
      progress.appendChild(progressFill);

      var thumb = document.createElement('img');
      thumb.className = 'stc-thumb';
      thumb.alt = '';
      thumb.setAttribute('referrerpolicy', 'no-referrer');
      thumb.addEventListener('error', function () {
        thumb.style.display = 'none';
      });
      thumb.addEventListener('load', function () {
        thumb.style.display = '';
      });

      var meta = document.createElement('div');
      meta.className = 'stc-meta';
      var titleEl = document.createElement('div');
      titleEl.className = 'stc-title';
      var statusEl = document.createElement('div');
      statusEl.className = 'stc-status';
      meta.appendChild(titleEl);
      meta.appendChild(statusEl);

      var actions = document.createElement('div');
      actions.className = 'stc-actions';
      var toggleBtn = makeCastButton('stc-toggle');
      var nextBtn = makeCastButton('stc-next');
      var closeBtn = makeCastButton('stc-close');
      actions.appendChild(toggleBtn);
      actions.appendChild(nextBtn);
      actions.appendChild(closeBtn);

      root.appendChild(progress);
      root.appendChild(thumb);
      root.appendChild(meta);
      root.appendChild(actions);
      document.body.appendChild(root);

      toggleBtn.addEventListener('click', toggleCastPlayback);
      nextBtn.addEventListener('click', nextOnTv);
      closeBtn.addEventListener('click', function () {
        terminateCast();
      });

      castBar = {
        root: root,
        progressFill: progressFill,
        thumb: thumb,
        thumbVideoId: null,
        title: titleEl,
        status: statusEl,
        toggle: toggleBtn,
        next: nextBtn,
        close: closeBtn
      };
      return castBar;
    }

    function castStatusText() {
      if (!cast) return '';
      if (cast.state === '2') return L.castPaused;
      if (cast.state === '3') return L.castBuffering;
      if (cast.state === '0') return L.castEnded;
      return L.castPlaying;
    }

    /** Aynı değeri tekrar yazmadan attribute ayarlar (gereksiz DOM işini önler). */
    function setAttr(element, name, value) {
      var text = String(value);
      if (element.getAttribute(name) !== text) element.setAttribute(name, text);
    }

    function updateCastBar() {
      if (!OPTIONS.showCastBar) {
        hideCastBar();
        return;
      }
      if (!cast) {
        hideCastBar();
        applyCastingAppearance();
        return;
      }
      if (!castBar) createCastBar();
      setAttr(castBar.root, 'data-visible', '1');

      var onShorts = location.pathname.indexOf('/shorts/') === 0 ? 'shorts' : '';
      var signature = [
        cast.videoId,
        cast.title,
        cast.state,
        cast.lost ? 1 : 0,
        Math.round(cast.currentTime || 0),
        Math.round(cast.duration || 0),
        onShorts
      ].join('\u0001');

      // Görünürlük dışında değişen bir şey yoksa DOM'a hiç dokunma
      if (castBar.signature === signature) {
        applyCastingAppearance();
        return;
      }
      castBar.signature = signature;

      setAttr(castBar.root, 'data-on', onShorts);
      setAttr(castBar.root, 'data-lost', cast.lost ? '1' : '0');

      var titleText = cast.title || cast.videoId || '';
      if (castBar.title.textContent !== titleText) {
        castBar.title.textContent = titleText;
        castBar.title.title = titleText;
      }
      var statusText = cast.lost ? L.castOffline : castStatusText();
      if (castBar.status.textContent !== statusText) castBar.status.textContent = statusText;

      if (castBar.thumbVideoId !== cast.videoId) {
        castBar.thumbVideoId = cast.videoId;
        castBar.thumb.style.display = '';
        castBar.thumb.src = 'https://i.ytimg.com/vi/' + cast.videoId + '/mqdefault.jpg';
      }

      var paused = cast.state === '2';
      var toggleText = paused ? '▶' : '⏸';
      if (castBar.toggle.textContent !== toggleText) {
        castBar.toggle.textContent = toggleText;
        castBar.toggle.title = paused ? L.castPlay : L.castPause;
        castBar.toggle.setAttribute('aria-label', castBar.toggle.title);
      }
      if (!castBar.next.textContent) {
        castBar.next.textContent = '⏭';
        castBar.next.title = L.castNext;
        castBar.next.setAttribute('aria-label', L.castNext);
      }
      if (!castBar.close.textContent) {
        castBar.close.textContent = '✕';
        castBar.close.title = L.castStop;
        castBar.close.setAttribute('aria-label', L.castStop);
      }

      var percent = cast.duration > 0
        ? Math.max(0, Math.min(100, (cast.currentTime / cast.duration) * 100))
        : 0;
      castBar.progressFill.style.width = percent + '%';

      applyCastingAppearance();
    }

    function hideCastBar() {
      if (castBar) setAttr(castBar.root, 'data-visible', '0');
    }

    function toast(message, kind) {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.setAttribute('data-kind', kind || 'error');
      toastEl.setAttribute('data-visible', '1');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.setAttribute('data-visible', '0');
      }, kind === 'ok' ? 3500 : 8000);
    }

    function openCodeDialog() {
      return new Promise(function (resolve) {
        // Not: YouTube `require-trusted-types-for 'script'` uyguluyor,
        // bu yüzden innerHTML gibi TrustedHTML isteyen API'ler kullanılamaz.
        var overlay = document.createElement('div');
        overlay.id = 'smarttube-sender-overlay';

        var dialog = document.createElement('div');
        dialog.id = 'smarttube-sender-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        var titleEl = document.createElement('h2');
        titleEl.textContent = L.dialogTitle;

        var textEl = document.createElement('p');
        textEl.textContent = L.dialogText;

        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'characters');
        input.placeholder = L.dialogPlaceholder;

        var errEl = document.createElement('div');
        errEl.className = 'sts-err';

        var row = document.createElement('div');
        row.className = 'sts-row';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'sts-ghost';
        cancelBtn.textContent = L.dialogCancel;

        var okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'sts-primary';
        okBtn.textContent = L.dialogOk;

        row.appendChild(cancelBtn);
        row.appendChild(okBtn);
        dialog.appendChild(titleEl);
        dialog.appendChild(textEl);
        dialog.appendChild(input);
        dialog.appendChild(errEl);
        dialog.appendChild(row);
        overlay.appendChild(dialog);

        var done = false;
        function close(value) {
          if (done) return;
          done = true;
          document.removeEventListener('keydown', onKey, true);
          overlay.remove();
          resolve(value);
        }

        function submit() {
          var code = input.value.replace(/[\s-]/g, '').toUpperCase();
          if (!/^[A-Z0-9]{4,16}$/.test(code)) {
            errEl.textContent = L.dialogEmpty;
            input.focus();
            return;
          }
          close(code);
        }

        function onKey(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(null);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }

        okBtn.addEventListener('click', submit);
        cancelBtn.addEventListener('click', function () {
          close(null);
        });
        overlay.addEventListener('mousedown', function (event) {
          if (event.target === overlay) close(null);
        });
        document.addEventListener('keydown', onKey, true);

        document.body.appendChild(overlay);
        input.focus();
      });
    }

    function refresh() {
      var videoId = videoIdFromUrl(location.href);
      var onShorts = location.pathname.indexOf('/shorts/') === 0;
      var slot = placeButton();

      if (button) {
        setAttr(button, 'data-on', onShorts ? 'shorts' : '');
        // Kontroller hazır olana kadar köşede görünmesin
        setAttr(button, 'data-visible', videoId && slot !== 'waiting' ? '1' : '0');
      }
      if (!videoId && state !== 'idle' && !busy) setState('idle');
      else applyCastingAppearance();

      if (cast) updateCastBar();
    }

    // --- Zamanlayıcılar ---------------------------------------------------

    function startRefreshTimer() {
      if (refreshTimer) return;
      refreshTimer = setInterval(refresh, 1000);
    }

    function stopRefreshTimer() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    }

    /** Sekme gizlenince hiçbir şey çalışmasın (RAM/CPU dostu). */
    function onVisibilityChange() {
      if (document.hidden) {
        stopRefreshTimer();
      } else {
        startRefreshTimer();
        refresh();
      }
    }

    /** Kontroller oluşur oluşmaz düğmeyi yerleştirmek için kısa süreli hızlı deneme. */
    function burstPlacement() {
      clearInterval(burstTimer);
      var deadline = Date.now() + 8000;
      burstTimer = setInterval(function () {
        if (placeButton() === 'controls' || Date.now() > deadline) {
          clearInterval(burstTimer);
          burstTimer = null;
        }
      }, 150);
    }

    // --- Başlat -----------------------------------------------------------

    injectStyles();
    createUi();
    refresh();
    restoreCast();
    burstPlacement();

    window.addEventListener('yt-navigate-finish', function () {
      waitingSince = 0;
      refresh();
      burstPlacement();
    });
    window.addEventListener('popstate', refresh);
    document.addEventListener('fullscreenchange', burstPlacement);
    document.addEventListener('visibilitychange', onVisibilityChange);
    startRefreshTimer();

    window.addEventListener('keydown', function (event) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 's' && event.key !== 'S') return;
      var target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!videoIdFromUrl(location.href)) return;
      event.preventDefault();
      send();
    });

    window.__smartTubeSender = {
      send: send,
      refresh: refresh,
      resetPairing: resetPairing,
      place: placeButton,
      helpers: {
        videoIdFromUrl: videoIdFromUrl,
        parseLoungeResponse: parseLoungeResponse,
        extractSession: extractSession
      },
      cast: {
        get: function () {
          return cast;
        },
        refresh: refreshCast,
        terminate: terminateCast,
        toggle: toggleCastPlayback,
        next: nextOnTv,
        restore: restoreCast
      }
    };

    window.addEventListener('pagehide', function () {
      saveCastRecord();
      stopCastPolling();
      stopRefreshTimer();
      clearInterval(burstTimer);
      burstTimer = null;
    });
  }
})();
