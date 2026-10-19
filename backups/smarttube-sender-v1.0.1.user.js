// ==UserScript==
// @name         SmartTube TV'ye Gönder
// @name:en      Send to SmartTube
// @namespace    https://github.com/local/smarttube-tv-sender
// @version      1.0.1
// @description  YouTube'da izlediğin videoyu SmartTube (Android TV) uygulamasında açar. Ekran yansıtma yapmaz; video TV'de native oynar.
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
  var VIDEO_ID_RE = /^[-\w]{11}$/;
  var SENDER_NAME = 'SmartTube Web Sender';

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
      confirmReset: 'SmartTube eşleştirmesi sıfırlansın mı? Bir sonraki gönderimde TV kodu yeniden sorulur.'
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
      confirmReset: 'Reset the SmartTube pairing? The TV code will be asked again on the next send.'
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
    '#smarttube-sender-toast{position:fixed;z-index:2147483001;right:24px;bottom:140px;max-width:340px;padding:12px 14px;border-radius:10px;background:rgba(18,18,18,.97);color:#fff;border-left:3px solid #ff0033;font:400 13px/1.45 Roboto,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;pointer-events:none}',
    '#smarttube-sender-toast[data-visible="1"]{opacity:1;transform:none}',
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
    var toastEl = null;
    var state = 'idle';
    var busy = false;
    var toastTimer = null;
    var sentTimer = null;

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

    function playOnTv(screen, videoId) {
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
          var session = extractSession(parseLoungeResponse(bindBytes));
          if (!session) throw new UserError('session', L.errSession);

          return apiText('bc/bind', {
            count: '1',
            ofs: '1',
            req0__sc: 'setPlaylist',
            req0_videoId: videoId
          }, {
            name: SENDER_NAME,
            loungeIdToken: screen.token,
            SID: session.sid,
            AID: String(session.aid),
            gsessionid: session.gsessionid,
            device: 'REMOTE_CONTROL',
            app: 'youtube-desktop',
            VER: '8',
            v: '2',
            RID: '2'
          });
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

      busy = true;
      setState('sending');

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
            return playOnTv(screen, videoId);
          });
        })
        .then(function (result) {
          if (result === null) {
            setState('idle');
            return;
          }
          setState('sent');
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
    }

    function setState(next) {
      state = next;
      if (!button) return;
      button.setAttribute('data-state', next === 'idle' ? '' : next);
      button.disabled = next === 'sending';
      button.textContent = next === 'sending'
        ? L.btnSending
        : next === 'sent'
          ? L.btnSent
          : next === 'error'
            ? L.btnError
            : L.btnIdle;
      button.title = L.tooltip;
      button.setAttribute('aria-label', button.textContent);
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

      if (button) {
        button.setAttribute('data-on', onShorts ? 'shorts' : '');
        button.setAttribute('data-visible', videoId ? '1' : '0');
      }
      if (!videoId && state !== 'idle' && !busy) setState('idle');
    }

    // --- Başlat -----------------------------------------------------------

    injectStyles();
    createUi();
    refresh();

    window.addEventListener('yt-navigate-finish', refresh);
    window.addEventListener('popstate', refresh);
    setInterval(refresh, 1000);

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
      helpers: {
        videoIdFromUrl: videoIdFromUrl,
        parseLoungeResponse: parseLoungeResponse,
        extractSession: extractSession
      }
    };
  }
})();
