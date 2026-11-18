export function initAnalyticsConsent() {
  const key = 'gitparcel-analytics-consent';
  const prompt = document.getElementById('analytics-prompt');
  const settings = document.getElementById('analytics-settings');
  let choice = null;
  let openedFromSettings = false;
  let scriptLoaded = false;

  function apply(value) {
    choice = value === 'yes' || value === 'no' ? value : null;
    prompt.hidden = choice !== null;
    settings.setAttribute('aria-expanded', String(!prompt.hidden));
    if (choice !== 'yes' || scriptLoaded || location.hostname !== 'gitparcel.vercel.app') return;

    // Recheck consent for later events if the visitor changes their mind in this tab.
    window.va ||= function () {
      (window.vaq ||= []).push(arguments);
    };
    window.va('beforeSend', (event) => (choice === 'yes' ? event : null));
    const script = document.createElement('script');
    script.src = '/_vercel/insights/script.js';
    scriptLoaded = true;
    document.head.append(script);
  }

  settings.addEventListener('click', () => {
    openedFromSettings = true;
    prompt.hidden = false;
    settings.setAttribute('aria-expanded', 'true');
    prompt.querySelector('[data-consent="' + (choice || 'no') + '"]').focus();
  });

  for (const button of prompt.querySelectorAll('[data-consent]')) {
    button.addEventListener('click', () => {
      const value = button.dataset.consent;
      try {
        localStorage.setItem(key, value);
      } catch {}
      apply(value);
      if (openedFromSettings) settings.focus();
      openedFromSettings = false;
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.storageArea === localStorage && (event.key === key || event.key === null)) {
      apply(event.newValue);
    }
  });
  let saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch {}
  apply(saved);
}
