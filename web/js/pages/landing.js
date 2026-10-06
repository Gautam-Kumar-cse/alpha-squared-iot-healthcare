/**
 * ALPHA SQUARED - Landing Page Controller
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  // Render Navigation with 'home' active
  renderNavbar('home');

  // Initialize Canvas Digital Particle & Grid
  initParticleBackground('bg-canvas');

  // Re-run Lucide icons if available
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

