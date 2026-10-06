/**
 * ALPHA SQUARED - Responsive Global Navigation Component
 */

export function renderNavbar(activePage = '') {
  const navContainer = document.getElementById('navbar-mount');
  if (!navContainer) return;

  const isDemo = localStorage.getItem('alphasquared_demo_mode') === 'true';

  const html = `
    <!-- Top Demo Mode Warning Banner -->
    <div id="demo-banner" class="demo-banner ${isDemo ? 'visible' : ''}" role="region" aria-label="Demo mode warning">
      <span class="demo-badge-tag">HACKATHON DEMO MODE</span>
      <span>Simulated sensor stream is currently active. Not receiving live physical ESP32 telemetry.</span>
      <a href="settings.html" style="color:#fef3c7;text-decoration:underline;margin-left:0.5rem;font-weight:700;">Settings</a>
    </div>

    <nav class="navbar" aria-label="Primary Navigation">
      <div class="navbar-container">
        <!-- Brand Logo -->
        <a href="index.html" class="nav-brand" aria-label="ALPHA SQUARED Home">
          <div class="brand-badge">
            <i data-lucide="activity" style="width: 22px; height: 22px;"></i>
          </div>
          <div class="brand-text">
            <span class="brand-name brand-title"><span class="alpha">ALPHA</span><span class="squared">²</span></span>
            <span class="brand-sub">IoT Health &amp; SOS</span>
          </div>
        </a>

        <!-- Desktop Menu Links -->
        <ul class="nav-menu" role="menubar">
          <li class="nav-item" role="none">
            <a href="index.html" class="nav-link ${activePage === 'home' ? 'active' : ''}" role="menuitem">
              <i data-lucide="home" style="width: 16px; height: 16px;"></i>
              <span>Home</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}" role="menuitem">
              <i data-lucide="layout-dashboard" style="width: 16px; height: 16px;"></i>
              <span>Dashboard</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="emergency.html" class="nav-link emergency-link ${activePage === 'emergency' ? 'active' : ''}" role="menuitem">
              <i data-lucide="alert-octagon" style="width: 16px; height: 16px;"></i>
              <span>Emergency</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="location.html" class="nav-link ${activePage === 'location' ? 'active' : ''}" role="menuitem">
              <i data-lucide="map-pin" style="width: 16px; height: 16px;"></i>
              <span>Live GPS</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="history.html" class="nav-link ${activePage === 'history' ? 'active' : ''}" role="menuitem">
              <i data-lucide="line-chart" style="width: 16px; height: 16px;"></i>
              <span>History</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="device.html" class="nav-link ${activePage === 'device' ? 'active' : ''}" role="menuitem">
              <i data-lucide="cpu" style="width: 16px; height: 16px;"></i>
              <span>Device</span>
            </a>
          </li>
          <li class="nav-item" role="none">
            <a href="settings.html" class="nav-link ${activePage === 'settings' ? 'active' : ''}" role="menuitem">
              <i data-lucide="settings" style="width: 16px; height: 16px;"></i>
              <span>Settings</span>
            </a>
          </li>
        </ul>

        <!-- Action Items (Beacon & Auth) -->
        <div class="nav-actions">
          <div id="system-beacon" class="system-beacon ${isDemo ? 'demo' : ''}" title="System Operational Status">
            <span class="beacon-dot"></span>
            <span id="beacon-text">${isDemo ? 'DEMO SIM' : 'ESP32 STANDBY'}</span>
          </div>

          <div id="auth-nav-slot">
            <a href="login.html" class="btn btn-secondary btn-sm" id="nav-login-btn">
              <i data-lucide="log-in" style="width: 15px; height: 15px;"></i>
              <span>Sign In</span>
            </a>
          </div>

          <!-- Mobile Toggle Button -->
          <button class="mobile-toggle" id="mobile-menu-toggle" aria-label="Toggle Navigation Menu" aria-expanded="false">
            <i data-lucide="menu" style="width: 22px; height: 22px;"></i>
          </button>
        </div>
      </div>

      <!-- Mobile Dropdown Drawer -->
      <div class="mobile-drawer" id="mobile-drawer" aria-hidden="true">
        <a href="index.html" class="nav-link ${activePage === 'home' ? 'active' : ''}">
          <i data-lucide="home" style="width: 18px; height: 18px;"></i>
          <span>Home Overview</span>
        </a>
        <a href="dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
          <i data-lucide="layout-dashboard" style="width: 18px; height: 18px;"></i>
          <span>Telemetry Dashboard</span>
        </a>
        <a href="emergency.html" class="nav-link emergency-link ${activePage === 'emergency' ? 'active' : ''}">
          <i data-lucide="alert-octagon" style="width: 18px; height: 18px;"></i>
          <span>Emergency Center</span>
        </a>
        <a href="location.html" class="nav-link ${activePage === 'location' ? 'active' : ''}">
          <i data-lucide="map-pin" style="width: 18px; height: 18px;"></i>
          <span>Live Location &amp; Maps</span>
        </a>
        <a href="history.html" class="nav-link ${activePage === 'history' ? 'active' : ''}">
          <i data-lucide="line-chart" style="width: 18px; height: 18px;"></i>
          <span>Vitals History</span>
        </a>
        <a href="device.html" class="nav-link ${activePage === 'device' ? 'active' : ''}">
          <i data-lucide="cpu" style="width: 18px; height: 18px;"></i>
          <span>Hardware &amp; ESP32</span>
        </a>
        <a href="settings.html" class="nav-link ${activePage === 'settings' ? 'active' : ''}">
          <i data-lucide="settings" style="width: 18px; height: 18px;"></i>
          <span>Settings &amp; Contacts</span>
        </a>
      </div>
    </nav>
  `;

  navContainer.innerHTML = html;

  // Mobile Drawer Toggle Event
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = drawer.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      drawer.setAttribute('aria-hidden', String(!isOpen));
    });
  }

  // Scroll effect on navbar
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }
  });

  // Check auth status from localStorage / session to update Auth button
  updateAuthNav();

  // Initialize Lucide icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: navContainer });
  }
}

export function updateAuthNav() {
  const authSlot = document.getElementById('auth-nav-slot');
  if (!authSlot) return;

  const userSession = localStorage.getItem('alphasquared_auth_user');
  if (userSession) {
    try {
      const user = JSON.parse(userSession);
      authSlot.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span style="font-size:0.8rem;color:#94a3b8;display:none;margin-right:4px;" class="desktop-user-email">${user.email?.split('@')[0] || 'User'}</span>
          <button class="btn btn-secondary btn-sm" id="nav-logout-btn" title="Sign Out">
            <i data-lucide="log-out" style="width: 14px; height: 14px;"></i>
            <span>Logout</span>
          </button>
        </div>
      `;
      const logoutBtn = document.getElementById('nav-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('alphasquared_auth_user');
          window.location.href = 'login.html';
        });
      }
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: authSlot });
      }
    } catch {
      // Ignored
    }
  }
}

export function updateBeaconStatus(status, text) {
  const beacon = document.getElementById('system-beacon');
  const beaconText = document.getElementById('beacon-text');
  if (!beacon || !beaconText) return;

  beacon.className = `system-beacon ${status.toLowerCase()}`;
  beaconText.textContent = text;
}

