var THEME_KEY = 'budzet_theme';

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

