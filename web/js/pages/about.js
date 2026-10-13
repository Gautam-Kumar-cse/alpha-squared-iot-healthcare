/**
 * ALPHA SQUARED - About Us Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  // Render Navigation with 'about' active
  renderNavbar('about');

  // Initialize Canvas Digital Particle & Grid background
  initParticleBackground('bg-canvas');

  // Re-run Lucide icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

