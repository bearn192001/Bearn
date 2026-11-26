export async function loadComponents() {
  // Load the shared stylesheet once, before the shared HTML is displayed.
  if (!document.querySelector('link[data-bearn-shared]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/navbar-footer.css';
    stylesheet.dataset.bearnShared = 'true';
    document.head.appendChild(stylesheet);
  }

  for (const host of document.querySelectorAll('[data-component]')) {
    const name = host.dataset.component;
    if (!['navbar', 'footer'].includes(name)) continue;
    try {
      const response = await fetch(`/components/${name}.html`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Gagal memuat ${name}: ${response.status}`);
      host.innerHTML = await response.text();
    } catch (error) {
      console.error('[BEARN components]', error);
    }
  }

  document.querySelectorAll('[data-year]').forEach(node => {
    node.textContent = new Date().getFullYear();
  });

  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mainNav');
  if (toggle && menu && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    const closeMenu = () => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Buka menu');
      toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i><span>Menu</span>';
    };
    toggle.addEventListener('click', event => {
      event.preventDefault();
      const opening = menu.hidden;
      menu.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      toggle.setAttribute('aria-label', opening ? 'Tutup menu' : 'Buka menu');
      toggle.innerHTML = opening
        ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Tutup</span>'
        : '<i class="fa-solid fa-bars" aria-hidden="true"></i><span>Menu</span>';
    });
    document.addEventListener('click', event => {
      if (!menu.hidden && !event.target.closest('.topbar')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        closeMenu();
        toggle.focus();
      }
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
  }
}
