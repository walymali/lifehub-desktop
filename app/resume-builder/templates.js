/**
 * LifeHub Resume Builder — Templates
 * 5 template renderers, each pure: (cv) => htmlString
 *
 * All templates respect cv.themeColor as the accent color.
 */
(function () {
  'use strict';

  // ── Helpers ──
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

  function contactBits(p) {
    return [p.email, p.phone, p.location, p.website]
      .filter(Boolean).map(esc);
  }

  // ── Template: Modern (current 2-col, dark heading) ──
  function modern(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';
    const photoHtml = cv.photo ? `<img class="rb-photo" src="${esc(cv.photo)}" alt="">` : '';

    return `
<div class="rb rb-modern" style="--accent:${c}">
  <header class="rb-header" style="border-bottom:3px solid ${c}">
    ${photoHtml}
    <div>
      <h1 class="rb-name">${esc(p.name)}</h1>
      <div class="rb-title" style="color:${c}">${esc(p.title)}</div>
      <div class="rb-contact">
        ${contactBits(p).map(b => `<span>${b}</span>`).join('')}
      </div>
    </div>
  </header>
  <main class="rb-body rb-grid-2">
    ${cv.summary ? `<section class="rb-full"><h3 style="border-color:${c}">Summary</h3><p class="rb-summary">${nl2br(cv.summary)}</p></section>` : ''}
    <section><h3 style="border-color:${c}">Experience</h3>${entryList(cv.experience)}</section>
    <section><h3 style="border-color:${c}">Education</h3>${entryList(cv.education)}</section>
    ${cv.skills?.length ? `<section class="rb-full"><h3 style="border-color:${c}">Skills</h3>${skillTags(cv.skills, c, 'pill')}</section>` : ''}
  </main>
</div>`;
  }

  // ── Template: Classic (single-column, traditional) ──
  function classic(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';

    return `
<div class="rb rb-classic" style="--accent:${c}">
  <header class="rb-header rb-center">
    <h1 class="rb-name" style="font-size:1.9rem;letter-spacing:0.04em">${esc((p.name || '').toUpperCase())}</h1>
    <div class="rb-title">${esc(p.title)}</div>
    <div class="rb-contact rb-center-row">
      ${contactBits(p).map(b => `<span>${b}</span>`).join(' &nbsp;·&nbsp; ')}
    </div>
  </header>
  <hr style="border:none;border-top:1px solid #ccc;margin:0 40px">
  <main class="rb-body rb-single">
    ${cv.summary ? `<section><h3 class="rb-classic-h">Professional Summary</h3><p class="rb-summary">${nl2br(cv.summary)}</p></section>` : ''}
    <section><h3 class="rb-classic-h">Experience</h3>${entryList(cv.experience)}</section>
    <section><h3 class="rb-classic-h">Education</h3>${entryList(cv.education)}</section>
    ${cv.skills?.length ? `<section><h3 class="rb-classic-h">Skills</h3><p class="rb-skills-inline">${cv.skills.map(esc).join(' · ')}</p></section>` : ''}
  </main>
</div>`;
  }

  // ── Template: Creative (left sidebar with photo) ──
  function creative(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';
    const photoHtml = cv.photo
      ? `<img class="rb-photo rb-photo-lg" src="${esc(cv.photo)}" alt="">`
      : `<div class="rb-photo-placeholder" style="background:${c}20">${esc((p.name || '?').slice(0, 1))}</div>`;

    return `
<div class="rb rb-creative" style="--accent:${c}">
  <aside class="rb-side" style="background:${c};color:#fff">
    ${photoHtml}
    <div class="rb-side-inner">
      <h1 class="rb-name" style="color:#fff">${esc(p.name)}</h1>
      <div class="rb-title" style="color:rgba(255,255,255,0.85)">${esc(p.title)}</div>

      <h4 class="rb-side-h">Contact</h4>
      <ul class="rb-contact-list">
        ${p.email ? `<li>${esc(p.email)}</li>` : ''}
        ${p.phone ? `<li>${esc(p.phone)}</li>` : ''}
        ${p.location ? `<li>${esc(p.location)}</li>` : ''}
        ${p.website ? `<li>${esc(p.website)}</li>` : ''}
      </ul>

      ${cv.skills?.length ? `<h4 class="rb-side-h">Skills</h4><div class="rb-side-skills">${cv.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}

      ${cv.education?.length ? `<h4 class="rb-side-h">Education</h4>${cv.education.map(e => `<div class="rb-side-edu"><strong>${esc(e.title)}</strong><div>${esc(e.company)}</div><div style="opacity:0.7">${esc(e.period)}</div></div>`).join('')}` : ''}
    </div>
  </aside>
  <main class="rb-main">
    ${cv.summary ? `<section><h3 style="color:${c}">About Me</h3><p class="rb-summary">${nl2br(cv.summary)}</p></section>` : ''}
    <section><h3 style="color:${c}">Experience</h3>${entryList(cv.experience, { accent: c, style: 'timeline' })}</section>
  </main>
</div>`;
  }

  // ── Template: Minimal (lots of whitespace, monochrome) ──
  function minimal(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';

    return `
<div class="rb rb-minimal" style="--accent:${c}">
  <header class="rb-header rb-min-header">
    <h1 class="rb-name" style="font-weight:300;font-size:2.2rem;letter-spacing:-0.02em">${esc(p.name)}</h1>
    <div class="rb-title" style="font-weight:300;color:#888;margin-top:2px">${esc(p.title)}</div>
    <div class="rb-contact" style="margin-top:14px;color:#aaa;font-size:0.7rem">
      ${contactBits(p).map(b => `<span>${b}</span>`).join(' &nbsp; ')}
    </div>
  </header>
  <main class="rb-body rb-single" style="padding-top:8px">
    ${cv.summary ? `<section><p class="rb-summary" style="font-size:0.92rem;color:#444;line-height:1.8">${nl2br(cv.summary)}</p></section>` : ''}
    <section><h3 class="rb-min-h">Experience</h3>${entryList(cv.experience, { style: 'minimal' })}</section>
    <section><h3 class="rb-min-h">Education</h3>${entryList(cv.education, { style: 'minimal' })}</section>
    ${cv.skills?.length ? `<section><h3 class="rb-min-h">Skills</h3><p style="font-size:0.78rem;color:#666;line-height:2">${cv.skills.map(esc).join(' &nbsp;·&nbsp; ')}</p></section>` : ''}
  </main>
</div>`;
  }

  // ── Template: Tech (mono accents, dark header) ──
  function tech(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';

    return `
<div class="rb rb-tech" style="--accent:${c}">
  <header class="rb-header rb-tech-header" style="background:#0f0f0f;color:#fff">
    <div class="rb-tech-left">
      <div class="rb-tech-mono">~/cv $ whoami</div>
      <h1 class="rb-name" style="color:#fff;font-family:'JetBrains Mono',monospace">${esc(p.name)}</h1>
      <div class="rb-title" style="color:${c};font-family:'JetBrains Mono',monospace">&gt; ${esc(p.title)}</div>
    </div>
    <div class="rb-tech-right rb-tech-mono">
      ${p.email ? `<div>email: <span style="color:${c}">${esc(p.email)}</span></div>` : ''}
      ${p.phone ? `<div>phone: <span style="color:${c}">${esc(p.phone)}</span></div>` : ''}
      ${p.location ? `<div>loc&nbsp;&nbsp;: <span style="color:${c}">${esc(p.location)}</span></div>` : ''}
      ${p.website ? `<div>web&nbsp;&nbsp;: <span style="color:${c}">${esc(p.website)}</span></div>` : ''}
    </div>
  </header>
  <main class="rb-body rb-single">
    ${cv.summary ? `<section><h3 class="rb-tech-h" style="color:${c}">// summary</h3><p class="rb-summary">${nl2br(cv.summary)}</p></section>` : ''}
    <section><h3 class="rb-tech-h" style="color:${c}">// experience</h3>${entryList(cv.experience, { style: 'tech', accent: c })}</section>
    <section><h3 class="rb-tech-h" style="color:${c}">// education</h3>${entryList(cv.education, { style: 'tech', accent: c })}</section>
    ${cv.skills?.length ? `<section><h3 class="rb-tech-h" style="color:${c}">// skills</h3>${skillTags(cv.skills, c, 'tech')}</section>` : ''}
  </main>
</div>`;
  }

  // ── Shared sub-renderers ──
  function entryList(arr, opts = {}) {
    if (!arr || !arr.length) return '<p style="color:#aaa;font-size:0.78rem;font-style:italic">None added yet</p>';
    const accent = opts.accent || '#1a1a1a';
    return arr.map(e => {
      if (opts.style === 'timeline') {
        return `<div class="rb-entry rb-timeline-entry" style="border-left:2px solid ${accent}40;padding-left:16px;margin-left:6px">
          <h4>${esc(e.title)}</h4>
          <div class="rb-meta">${esc(e.company)}${e.period ? ' · ' + esc(e.period) : ''}</div>
          ${e.desc ? `<p>${nl2br(e.desc)}</p>` : ''}
        </div>`;
      }
      if (opts.style === 'minimal') {
        return `<div class="rb-entry" style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <h4 style="font-weight:500">${esc(e.title)}</h4>
            <span style="font-size:0.7rem;color:#aaa">${esc(e.period)}</span>
          </div>
          <div class="rb-meta" style="color:#888">${esc(e.company)}</div>
          ${e.desc ? `<p>${nl2br(e.desc)}</p>` : ''}
        </div>`;
      }
      if (opts.style === 'tech') {
        return `<div class="rb-entry" style="margin-bottom:14px">
          <h4 style="font-family:'JetBrains Mono',monospace">${esc(e.title)}</h4>
          <div class="rb-meta" style="font-family:'JetBrains Mono',monospace;color:${accent}">@ ${esc(e.company)} <span style="color:#999">[${esc(e.period)}]</span></div>
          ${e.desc ? `<p>${nl2br(e.desc)}</p>` : ''}
        </div>`;
      }
      // default
      return `<div class="rb-entry">
        <h4>${esc(e.title)}</h4>
        <div class="rb-meta">${esc(e.company)}${e.period ? ' | ' + esc(e.period) : ''}</div>
        ${e.desc ? `<p>${nl2br(e.desc)}</p>` : ''}
      </div>`;
    }).join('');
  }

  function skillTags(arr, accent, style) {
    if (style === 'tech') {
      return `<div class="rb-skills" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem">${arr.map(s => `<span style="background:${accent}15;color:${accent};padding:3px 9px;border-radius:4px;margin:2px;display:inline-block">${esc(s)}</span>`).join('')}</div>`;
    }
    return `<div class="rb-skills">${arr.map(s => `<span class="rb-skill" style="border:1px solid ${accent}33">${esc(s)}</span>`).join('')}</div>`;
  }

  // ── Cover Letter Renderer ──
  function coverLetter(cv) {
    const p = cv.personal || {};
    const c = cv.themeColor || '#1a1a1a';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
<div class="rb rb-cover" style="--accent:${c}">
  <header class="rb-cover-head">
    <div>
      <h1 class="rb-name">${esc(p.name)}</h1>
      <div class="rb-title">${esc(p.title)}</div>
    </div>
    <div class="rb-cover-meta">
      ${p.email ? `<div>${esc(p.email)}</div>` : ''}
      ${p.phone ? `<div>${esc(p.phone)}</div>` : ''}
      ${p.location ? `<div>${esc(p.location)}</div>` : ''}
    </div>
  </header>
  <hr style="border:none;border-top:2px solid ${c};margin:0 40px">
  <div class="rb-cover-body">
    <div style="text-align:right;color:#999;font-size:0.78rem;margin-bottom:24px">${today}</div>
    <div class="rb-cover-text">${nl2br(cv.coverLetter || '')}</div>
  </div>
</div>`;
  }

  // ── Dispatcher ──
  const TEMPLATES = { modern, classic, creative, minimal, tech };

  function render(cv) {
    const fn = TEMPLATES[cv.template] || modern;
    return fn(cv);
  }

  function listTemplates() {
    return [
      { id: 'modern', name: 'Modern', desc: 'Clean two-column layout' },
      { id: 'classic', name: 'Classic', desc: 'Traditional, conservative' },
      { id: 'creative', name: 'Creative', desc: 'Sidebar with photo' },
      { id: 'minimal', name: 'Minimal', desc: 'Whitespace + thin lines' },
      { id: 'tech', name: 'Tech', desc: 'Monospace, dark accents' }
    ];
  }

  // ── Export ──
  window.RBTemplates = { render, renderCoverLetter: coverLetter, listTemplates };
})();
