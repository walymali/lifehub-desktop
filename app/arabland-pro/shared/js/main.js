/* ArabLand Pro - Shared JavaScript */

document.addEventListener('DOMContentLoaded', () => {
  /* ── Mobile Menu Toggle ──────────────────────── */
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('.nav-links');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      nav.classList.toggle('active');
      menuBtn.classList.toggle('active');
      document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
    });
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('active');
        menuBtn.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /* ── Scroll Animations (IntersectionObserver) ── */
  const fadeEls = document.querySelectorAll('.fade-up');
  if (fadeEls.length && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), i * 100);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    fadeEls.forEach(el => obs.observe(el));
  } else {
    fadeEls.forEach(el => el.classList.add('visible'));
  }

  /* ── FAQ Accordion ───────────────────────────── */
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      item.closest('.faq-list')?.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* ── Sticky Navbar ───────────────────────────── */
  const header = document.querySelector('.site-header');
  if (header) {
    let last = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      header.classList.toggle('scrolled', y > 50);
      last = y;
    }, { passive: true });
  }

  /* ── Smooth scroll for anchor links ──────────── */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
