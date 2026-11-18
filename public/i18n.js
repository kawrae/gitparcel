// English UI strings double as message keys and the built-in fallback.
let messages = {};
const catalogs = new Map();
let numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export function number(value) {
  return numbers.format(value);
}

export function t(key, values = {}) {
  const template = Object.hasOwn(messages, key) ? messages[key] : key;
  return template.replace(/\{(\w+)\}/g, (token, name) => {
    if (!Object.hasOwn(values, name)) return token;
    const value = values[name];
    if (value instanceof Date) return value.toLocaleTimeString(document.documentElement.lang);
    return typeof value === 'number' ? number(value) : value;
  });
}

export function initLanguage(render, onError) {
  const trigger = document.getElementById('language');
  const picker = trigger.closest('.language-picker');
  const panel = picker.querySelector('.language-panel');
  const menu = document.getElementById('language-menu');
  const options = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
  const bindings = [];
  for (const [selector, attribute] of [
    ['[data-i18n]', null],
    ['[data-i18n-aria]', 'aria-label'],
    ['[data-i18n-placeholder]', 'placeholder'],
  ]) {
    for (const element of document.querySelectorAll(selector)) {
      const source = attribute ? element.getAttribute(attribute) : element.textContent;
      bindings.push({ element, attribute, key: source.trim().replace(/\s+/g, ' ') });
    }
  }

  let request = 0;
  async function apply(language, remember) {
    const current = ++request;
    try {
      if (language !== 'en' && !catalogs.has(language)) {
        const catalogLanguage = language === 'ar-PS' ? 'ar' : language;
        const url = new URL('./locales/' + catalogLanguage + '.json', import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Language unavailable');
        catalogs.set(language, await response.json());
      }
    } catch {
      if (current === request) {
        onError();
      }
      return;
    }
    if (current !== request) return;
    messages = catalogs.get(language) || {};
    numbers = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
    document.documentElement.lang = language;
    document.documentElement.dir = language.startsWith('ar') ? 'rtl' : 'ltr';
    for (const option of options) {
      option.setAttribute('aria-checked', option.lang === language);
      if (option.lang === language)
        trigger.setAttribute('aria-label', t('Language') + ' · ' + option.textContent.trim());
    }
    document.getElementById('language-code').textContent = language.split('-')[0].toUpperCase();
    for (const { element, attribute, key } of bindings) {
      if (attribute) element.setAttribute(attribute, t(key));
      else element.textContent = t(key);
    }
    document.title = t('GitHub to ZIP') + ' · GitParcel';
    document.querySelector('meta[name="description"]').content = document.querySelector(
      '.hero-copy p [data-i18n]',
    ).textContent;
    render();
    if (remember) {
      try {
        localStorage.setItem('gitparcel-language', language);
      } catch { }
    }
  }

  function openMenu() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector('[aria-checked="true"]').focus();
  }
  function closeMenu(restoreFocus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  trigger.addEventListener('click', () => (panel.hidden ? openMenu() : closeMenu(true)));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    }
  });
  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[role="menuitemradio"]');
    if (!option) return;
    closeMenu(true);
    apply(option.lang, true);
  });
  menu.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    let next;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeMenu(true);
        return;
      case 'Tab':
        closeMenu(true);
        return;
      case 'ArrowDown':
        next = (index + 1) % options.length;
        break;
      case 'ArrowUp':
        next = (index + options.length - 1) % options.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    options[next].focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!picker.contains(event.target)) closeMenu();
  });
  picker.addEventListener('focusout', (event) => {
    if (!picker.contains(event.relatedTarget)) closeMenu();
  });
  let initial = 'en';
  try {
    const saved = localStorage.getItem('gitparcel-language');
    if (options.some((option) => option.lang === saved)) initial = saved;
  } catch { }
  apply(initial, false);
}
