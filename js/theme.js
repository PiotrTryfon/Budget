var THEME_KEY    = 'budzet_theme';
var THEME_NAMES  = { light: 'Jasny', dark: 'Ciemny', vivid: 'Vivid' };

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function setTheme(name) {
  if (name === 'light') {
    localStorage.removeItem(THEME_KEY);
    document.documentElement.removeAttribute('data-theme');
  } else {
    localStorage.setItem(THEME_KEY, name);
    document.documentElement.setAttribute('data-theme', name);
  }
}

function applyStoredTheme() {
  var t = localStorage.getItem(THEME_KEY);
  if (t && t !== 'light') document.documentElement.setAttribute('data-theme', t);
}
