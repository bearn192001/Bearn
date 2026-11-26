export async function loadComponents() {
  // Shared icon font is required by navbar/footer on every page (not just index).
  if (!document.querySelector('link[data-bearn-icons], link[href*="font-awesome/6.7.2/css/all.min.css"]')) {
    const icons = document.createElement('link');
    icons.rel = 'stylesheet';
    icons.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    icons.dataset.bearnIcons = 'true';
    document.head.appendChild(icons);
  }

  const stylesheet = document.querySelector('link[data-bearn-shared]') || (() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/navbar-footer.css';
    link.dataset.bearnShared = 'true';
    document.head.appendChild(link);
    return link;
  })();

  // Wait until shared styles are ready to prevent an unstyled navbar flash.
  if (!stylesheet.sheet) {
    await new Promise(resolve => {
      stylesheet.addEventListener('load', resolve, {once:true});
      stylesheet.addEventListener('error', resolve, {once:true});
    });
  }

  for (const host of document.querySelectorAll('[data-component]')) {
    const name = host.dataset.component;
    if (!['navbar', 'footer'].includes(name)) continue;
    try {
      const response = await fetch(`/components/${name}.html`, {cache:'no-cache'});
      if (!response.ok) throw new Error(`Gagal memuat ${name}: ${response.status}`);
      host.innerHTML = await response.text();
      if (name === 'navbar') host.classList.add('bearn-navbar-host');
    } catch (error) {
      console.error(`[BEARN] Komponen ${name} gagal dimuat`, error);
    }
  }

  document.querySelectorAll('[data-year]').forEach(node => {
    node.textContent = new Date().getFullYear();
  });

  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mainNav');
  if (!toggle || !menu || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';

  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Buka menu');
    toggle.querySelector('.menu-icon').innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    toggle.querySelector('.menu-label').textContent = 'Menu';
  };
  toggle.addEventListener('click', event => {
    event.preventDefault();
    const opening = menu.hidden;
    menu.hidden = !opening;
    toggle.setAttribute('aria-expanded',String(opening));
    toggle.setAttribute('aria-label',opening ? 'Tutup menu' : 'Buka menu');
    toggle.querySelector('.menu-icon').innerHTML = opening
      ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    toggle.querySelector('.menu-label').textContent = opening ? 'Tutup' : 'Menu';
  });
  document.addEventListener('click', event => {
    if (!menu.hidden && !event.target.closest('.topbar')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { closeMenu(); toggle.focus(); }
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
}
