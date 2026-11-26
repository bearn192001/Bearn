const loadStyles = () => {
  if (document.querySelector('link[data-bearn-shared]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/navbar-footer.css';
  link.dataset.bearnShared = 'true';
  document.head.append(link);
};

export async function loadComponents() {
  loadStyles();
  for (const el of document.querySelectorAll('[data-component]')) {
    const name = el.dataset.component;
    if (!['navbar', 'footer'].includes(name)) continue;
    const res = await fetch(`/components/${name}.html`);
    if (res.ok) el.innerHTML = await res.text();
  }

  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('mainNav');
  toggle?.addEventListener('click', () => {
    const isOpen = !nav.hidden;
    nav.hidden = isOpen;
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.innerHTML = isOpen
      ? '<i class="fa-solid fa-bars" aria-hidden="true"></i><span>Menu</span>'
      : '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Tutup</span>';
  });

  document.addEventListener('click', event => {
    if (!nav || nav.hidden) return;
    if (!event.target.closest('.topbar')) {
      nav.hidden = true;
      toggle?.setAttribute('aria-expanded', 'false');
      if (toggle) toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i><span>Menu</span>';
    }
  });

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', () => window.BEARN?.logout());
  });
}
