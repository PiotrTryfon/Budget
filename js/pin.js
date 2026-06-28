var PIN_HASH_KEY    = 'budzet_pin_hash';
var PIN_SESSION_KEY = 'budzet_session_unlocked';

function isPinSet() {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

function isSessionUnlocked() {
  return sessionStorage.getItem(PIN_SESSION_KEY) === '1';
}

function _setSessionUnlocked() {
  sessionStorage.setItem(PIN_SESSION_KEY, '1');
}

var _PIN_SALT = 'budzet_v1_';

// crypto.subtle requires HTTPS (GitHub Pages). Falls back to simple hash on file://.
function _simpleHash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
  }
  return 'sh_' + (h >>> 0).toString(16).padStart(8, '0');
}

async function _hashPin(pin) {
  var salted = _PIN_SALT + pin;
  if (window.crypto && window.crypto.subtle) {
    var buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
    return Array.from(new Uint8Array(buf)).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  return _simpleHash(salted);
}

async function savePin(pin) {
  localStorage.setItem(PIN_HASH_KEY, await _hashPin(pin));
}

async function verifyPin(pin) {
  var stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return true;
  return (await _hashPin(pin)) === stored;
}

function removePin() {
  localStorage.removeItem(PIN_HASH_KEY);
}

// ─── PIN gate overlay (shown at startup when PIN is set) ─────────────────────

function renderPinGate(onUnlock) {
  var overlay = document.createElement('div');
  overlay.id  = 'pin-gate';
  overlay.innerHTML =
    '<div class="pin-box">' +
      '<div class="pin-logo">&#8381;</div>' +
      '<div class="pin-app-name">Bud&#380;et</div>' +
      '<p class="pin-prompt">Podaj PIN, aby kontynuowa&#263;</p>' +
      '<input type="password" id="pin-input" class="pin-input"' +
        ' inputmode="numeric" maxlength="16" placeholder="&#8226;&#8226;&#8226;&#8226;"' +
        ' autocomplete="current-password">' +
      '<div id="pin-error" class="pin-error"></div>' +
      '<button id="pin-submit" class="pin-submit">Odblokuj</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var input   = overlay.querySelector('#pin-input');
  var errorEl = overlay.querySelector('#pin-error');
  var btn     = overlay.querySelector('#pin-submit');

  setTimeout(function() { input.focus(); }, 80);

  function attempt() {
    var pin = input.value;
    if (!pin) { input.focus(); return; }
    btn.disabled = true;
    verifyPin(pin).then(function(ok) {
      if (ok) {
        _setSessionUnlocked();
        overlay.remove();
        onUnlock();
      } else {
        input.value = '';
        errorEl.textContent = 'Nieprawid&#322;owy PIN.';
        var box = overlay.querySelector('.pin-box');
        box.classList.add('pin-shake');
        setTimeout(function() { box.classList.remove('pin-shake'); }, 500);
        btn.disabled = false;
        input.focus();
      }
    });
  }

  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', function(e) {
    errorEl.textContent = '';
    if (e.key === 'Enter') attempt();
  });
}

// ─── PIN management panel (used by settings.js) ──────────────────────────────
// Call with the #pin-settings-wrap element directly.

function renderPinSettings(wrap) {
  var set = isPinSet();
  wrap.innerHTML = set
    ? '<p class="setting-desc" style="margin-bottom:0.75rem">PIN jest ustawiony. Wymagany przy ka&#380;dym otwarciu aplikacji.</p>' +
      '<div style="display:flex;gap:0.5rem">' +
        '<button id="btn-change-pin">Zmie&#324; PIN</button>' +
        '<button id="btn-remove-pin" class="btn-ghost">Usu&#324; PIN</button>' +
      '</div>' +
      '<div id="pin-form-area"></div>'
    : '<p class="setting-desc" style="margin-bottom:0.75rem">Brak PINu &mdash; aplikacja jest dost&#281;pna bez weryfikacji.</p>' +
      '<button id="btn-set-pin">Ustaw PIN</button>' +
      '<div id="pin-form-area"></div>';

  if (set) {
    wrap.querySelector('#btn-change-pin').addEventListener('click', function() {
      showPinForm(wrap, true);
    });
    wrap.querySelector('#btn-remove-pin').addEventListener('click', function() {
      if (!confirm('Usun&#261;&#263; PIN? Aplikacja b&#281;dzie dost&#281;pna bez weryfikacji.')) return;
      removePin();
      renderPinSettings(wrap);
    });
  } else {
    wrap.querySelector('#btn-set-pin').addEventListener('click', function() {
      showPinForm(wrap, false);
    });
  }
}

function showPinForm(wrap, isChange) {
  var area = wrap.querySelector('#pin-form-area');
  area.innerHTML =
    '<div class="panel" style="margin-top:0.75rem;max-width:300px">' +
      (isChange
        ? '<label>Aktualny PIN<input type="password" id="pf-old" class="pin-input-sm" inputmode="numeric" maxlength="16"></label>'
        : '') +
      '<label>Nowy PIN (min. 4 znaki)<input type="password" id="pf-new" class="pin-input-sm" inputmode="numeric" maxlength="16"></label>' +
      '<label>Powt&#243;rz nowy PIN<input type="password" id="pf-rep" class="pin-input-sm" inputmode="numeric" maxlength="16"></label>' +
      '<div id="pf-err" class="pin-error" style="margin:0.4rem 0 0"></div>' +
      '<div style="display:flex;gap:0.5rem;margin-top:0.75rem">' +
        '<button id="pf-save">Zapisz</button>' +
        '<button id="pf-cancel" class="btn-ghost">Anuluj</button>' +
      '</div>' +
    '</div>';

  area.querySelector('#pf-cancel').addEventListener('click', function() {
    area.innerHTML = '';
  });

  area.querySelector('#pf-save').addEventListener('click', function() {
    var newPin  = area.querySelector('#pf-new').value;
    var repPin  = area.querySelector('#pf-rep').value;
    var errEl   = area.querySelector('#pf-err');

    if (!newPin)               { errEl.textContent = 'Podaj nowy PIN.'; return; }
    if (newPin.length < 4)     { errEl.textContent = 'PIN musi mie&#263; co najmniej 4 znaki.'; return; }
    if (newPin !== repPin)     { errEl.textContent = 'PINy si&#281; r&#243;&#380;ni&#261;.'; return; }

    function doSave() {
      savePin(newPin).then(function() {
        _setSessionUnlocked();
        renderPinSettings(wrap);
      });
    }

    if (isChange) {
      var oldPin = area.querySelector('#pf-old').value;
      verifyPin(oldPin).then(function(ok) {
        if (!ok) { errEl.textContent = 'Nieprawid&#322;owy aktualny PIN.'; return; }
        doSave();
      });
    } else {
      doSave();
    }
  });
}
