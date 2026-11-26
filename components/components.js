export async function loadComponents() {
  if (!document.querySelector('link[data-bearn-icons], link[href*="font-awesome/6.7.2/css/all.min.css"]')) {
    const icons = document.createElement('link');
    icons.rel = 'stylesheet';
    icons.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    icons.dataset.bearnIcons = 'true';
    document.head.appendChild(icons);
  }

  let stylesheet = document.querySelector('link[data-bearn-shared]');
  if (!stylesheet) {
    stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/navbar-footer.css';
    stylesheet.dataset.bearnShared = 'true';
    const ready = new Promise(resolve => {
      stylesheet.addEventListener('load', resolve, {once:true});
      stylesheet.addEventListener('error', resolve, {once:true});
    });
    document.head.appendChild(stylesheet);
    await Promise.race([ready, new Promise(resolve => setTimeout(resolve, 2500))]);
  } else if (!stylesheet.sheet) {
    await Promise.race([
      new Promise(resolve => {
        stylesheet.addEventListener('load', resolve, {once:true});
        stylesheet.addEventListener('error', resolve, {once:true});
      }),
      new Promise(resolve => setTimeout(resolve, 2500))
    ]);
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

  document.querySelectorAll('[data-year]').forEach(node => node.textContent = new Date().getFullYear());
  bindNavigation();
}

function bindNavigation() {
  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mainNav');
  const backdrop = document.getElementById('navBackdrop');
  const closeButton = document.getElementById('navClose');
  if (!toggle || !menu || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';

  const closeMenu = () => {
    menu.classList.remove('is-open');
    backdrop?.classList.remove('is-visible');
    document.body.classList.remove('nav-drawer-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Buka menu');
    const icon = toggle.querySelector('.menu-icon');
    if (icon) icon.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    window.setTimeout(() => {
      if (!menu.classList.contains('is-open')) menu.hidden = true;
      if (backdrop && !backdrop.classList.contains('is-visible')) backdrop.hidden = true;
    }, 260);
  };
  const openMenu = () => {
    menu.hidden = false;
    if (backdrop) backdrop.hidden = false;
    requestAnimationFrame(() => {
      menu.classList.add('is-open');
      backdrop?.classList.add('is-visible');
    });
    document.body.classList.add('nav-drawer-open');
    toggle.setAttribute('aria-expanded','true');
    toggle.setAttribute('aria-label','Tutup menu');
    const icon = toggle.querySelector('.menu-icon');
    if (icon) icon.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  };

  toggle.addEventListener('click', event => {
    event.preventDefault();
    menu.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  closeButton?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); toggle.focus(); }
  });
  menu.querySelectorAll('.nav-accordion-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const submenu = document.getElementById(button.getAttribute('aria-controls'));
      const opening = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(opening));
      button.classList.toggle('is-expanded', opening);
      if (submenu) {
        if (opening) {
          submenu.hidden = false;
          requestAnimationFrame(() => submenu.classList.add('is-expanded'));
        } else {
          submenu.classList.remove('is-expanded');
          window.setTimeout(() => { if (button.getAttribute('aria-expanded') !== 'true') submenu.hidden = true; }, 220);
        }
      }
    });
  });
  menu.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (link) closeMenu();
  });

  // Render saved accounts. Account switching always re-authenticates with password;
  // Supabase sessions cannot safely be switched using only an email address.
  const switcher = document.getElementById('navAccountSwitcher');
  const accountList = document.getElementById('switchAccountSubmenu');
  try {
    const saved = JSON.parse(localStorage.getItem('bearn_saved_accounts_v1') || '[]')
      .filter(item => item && item.username && item.email);
    if (switcher && accountList && saved.length > 1) {
      switcher.hidden = false;
      accountList.innerHTML = '';
      saved.forEach(account => {
        const link = document.createElement('a');
        link.href = `/login.html?switch=1&email=${encodeURIComponent(account.email)}`;
        link.className = 'nav-account-option';
        const avatar = document.createElement('span');
        avatar.className = 'nav-account-avatar';
        avatar.textContent = String(account.initial || account.username.charAt(0)).slice(0,1).toUpperCase();
        const copy = document.createElement('span');
        copy.className = 'nav-account-copy';
        const name = document.createElement('b');
        name.textContent = account.username;
        const email = document.createElement('small');
        email.textContent = account.email;
        copy.append(name,email);
        link.append(avatar,copy);
        accountList.append(link);
      });
    }
  } catch (error) { console.warn('[BEARN accounts]', error); }

  document.querySelectorAll('[data-logout]').forEach(button => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => window.BEARN?.logout?.());
  });
}
