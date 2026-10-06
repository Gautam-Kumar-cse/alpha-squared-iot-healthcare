/**
 * ALPHA SQUARED - Auth Page Controller (Login & Registration)
 */

import { initParticleBackground } from '../components/particle-background.js';
import { renderNavbar } from '../components/navbar.js';
import { authService } from '../services/auth-service.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar('auth');
  initParticleBackground('bg-canvas');

  // If already logged in, show option or redirect
  if (authService.isAuthenticated()) {
    const user = authService.getCurrentUser();
    showAlert(`You are currently signed in as ${user.email}. <a href="dashboard.html" style="text-decoration:underline; font-weight:700;">Proceed to Dashboard</a> or <a href="#" id="auth-force-logout" style="text-decoration:underline;">Sign Out</a>`, 'info');
    const forceLogout = document.getElementById('auth-force-logout');
    if (forceLogout) {
      forceLogout.addEventListener('click', (e) => {
        e.preventDefault();
        authService.signOut();
        window.location.reload();
      });
    }
  }

  // Handle Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const submitBtn = document.getElementById('btn-submit-login');
      const btnText = document.getElementById('btn-login-text');

      try {
        setLoading(submitBtn, btnText, true, 'Verifying Credentials...');
        hideAlert();
        await authService.signIn(email, password);
        showAlert('Authentication successful! Loading dashboard...', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 600);
      } catch (err) {
        showAlert(err.message, 'error');
        setLoading(submitBtn, btnText, false, 'Sign In to Dashboard');
      }
    });
  }

  // Handle Registration Form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const deviceId = document.getElementById('reg-device').value;
      const password = document.getElementById('reg-password').value;
      const submitBtn = document.getElementById('btn-submit-register');
      const btnText = document.getElementById('btn-register-text');

      try {
        setLoading(submitBtn, btnText, true, 'Creating Account...');
        hideAlert();
        await authService.register(name, email, password, deviceId);
        showAlert('Registration successful! Redirecting to dashboard...', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      } catch (err) {
        showAlert(err.message, 'error');
        setLoading(submitBtn, btnText, false, 'Create Account & Link Device');
      }
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

function showAlert(message, type = 'error') {
  const alertEl = document.getElementById('auth-alert') || document.getElementById('register-alert');
  if (!alertEl) return;

  alertEl.style.display = 'block';
  if (type === 'error') {
    alertEl.style.background = 'rgba(239, 68, 68, 0.15)';
    alertEl.style.border = '1px solid #ef4444';
    alertEl.style.color = '#fca5a5';
  } else if (type === 'success') {
    alertEl.style.background = 'rgba(16, 185, 129, 0.15)';
    alertEl.style.border = '1px solid #10b981';
    alertEl.style.color = '#6ee7b7';
  } else {
    alertEl.style.background = 'rgba(0, 240, 255, 0.1)';
    alertEl.style.border = '1px solid #00f0ff';
    alertEl.style.color = '#7dd3fc';
  }
  alertEl.innerHTML = message;
}

function hideAlert() {
  const alertEl = document.getElementById('auth-alert') || document.getElementById('register-alert');
  if (alertEl) alertEl.style.display = 'none';
}

function setLoading(button, textElement, isLoading, loadingText) {
  if (!button) return;
  button.disabled = isLoading;
  if (textElement) {
    textElement.textContent = loadingText;
  }
}

