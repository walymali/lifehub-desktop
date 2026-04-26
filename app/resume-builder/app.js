/**
 * LifeHub Resume Builder — App Controller
 * Wires storage + AI + templates + UI together.
 */
(function () {
  'use strict';

  // ── State ──
  let cv = null;                  // active CV object
  let previewMode = 'resume';     // 'resume' | 'cover'
  const undoStack = [];            // for ✨ Improve undo
  const MAX_UNDO = 20;

  // ── Modal helpers (replace native prompt/confirm/alert) ──
  // Returns a Promise. Never blocks.
  function openModal(config) {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('modal-backdrop');
      if (!backdrop) return resolve(null);

      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const fieldHtml = config.type === 'prompt'
        ? `<input type="text" id="modal-input" value="${esc(config.default || '').replace(/"/g,'&quot;')}" placeholder="${esc(config.placeholder || '')}">`
        : config.type === 'textarea'
          ? `<textarea id="modal-input" placeholder="${esc(config.placeholder || '')}">${esc(config.default || '')}</textarea>`
          : '';

      const okLabel = config.okLabel || 'OK';
      const cancelLabel = config.cancelLabel || 'Cancel';
      const okClass = config.danger ? 'rb-modal-btn-danger' : 'rb-modal-btn-primary';
      const showCancel = config.type !== 'alert';

      backdrop.innerHTML = `
        <div class="rb-modal" role="dialog" aria-modal="true">
          <h3>${esc(config.title || '')}</h3>
          ${config.message ? `<p>${config.messageHtml ? config.message : esc(config.message)}</p>` : ''}
          ${fieldHtml}
          <div class="rb-modal-actions">
            ${showCancel ? `<button class="rb-modal-btn rb-modal-btn-ghost" id="modal-cancel">${esc(cancelLabel)}</button>` : ''}
            <button class="rb-modal-btn ${okClass}" id="modal-ok">${esc(okLabel)}</button>
          </div>
        </div>`;

      backdrop.classList.add('show');
      backdrop.setAttribute('aria-hidden', 'false');

      const input = document.getElementById('modal-input');
      const ok = document.getElementById('modal-ok');
      const cancel = document.getElementById('modal-cancel');

      const close = (result) => {
        backdrop.classList.remove('show');
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.removeEventListener('keydown', onKey, true);
        backdrop.onclick = null;
        setTimeout(() => { backdrop.innerHTML = ''; }, 250);
        resolve(result);
      };

      const getVal = () => input ? input.value : true;

      ok.addEventListener('click', () => close(getVal()));
      cancel?.addEventListener('click', () => close(config.type === 'prompt' || config.type === 'textarea' ? null : false));
      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(config.type === 'prompt' || config.type === 'textarea' ? null : false);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close(config.type === 'prompt' || config.type === 'textarea' ? null : false);
        else if (e.key === 'Enter' && (!input || input.tagName === 'INPUT')) {
          e.preventDefault();
          close(getVal());
        }
      };
      document.addEventListener('keydown', onKey, { capture: true, once: false });
      backdrop.addEventListener('keydown', onKey, true);

      setTimeout(() => {
        if (input) { input.focus(); input.select?.(); }
        else ok.focus();
      }, 50);
    });
  }

  const ui = {
    alert: (title, message) => openModal({ type: 'alert', title, message, okLabel: 'OK' }),
    confirm: (title, message, opts = {}) => openModal({
      type: 'confirm', title, message,
      okLabel: opts.okLabel || 'OK',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: opts.danger
    }),
    prompt: (title, defaultValue, opts = {}) => openModal({
      type: opts.textarea ? 'textarea' : 'prompt',
      title,
      message: opts.message,
      default: defaultValue,
      placeholder: opts.placeholder,
      okLabel: opts.okLabel || 'OK'
    })
  };

  // ── Custom modal: History (wider, custom body) ──
  function openCustomModal(htmlBody, opts = {}) {
    return new Promise(resolve => {
      const backdrop = document.getElementById('modal-backdrop');
      if (!backdrop) return resolve(null);
      backdrop.innerHTML = `
        <div class="rb-modal ${opts.wide ? 'rb-modal-wide' : ''}" role="dialog" aria-modal="true">
          ${htmlBody}
        </div>`;
      backdrop.classList.add('show');
      backdrop.setAttribute('aria-hidden', 'false');
      const close = (result) => {
        backdrop.classList.remove('show');
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.onclick = null;
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => { backdrop.innerHTML = ''; }, 250);
        resolve(result);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey, true);
      backdrop.onclick = (e) => { if (e.target === backdrop) close(null); };
      // Expose close so the HTML body can trigger it
      backdrop._close = close;
    });
  }
  function closeCustomModal(result) {
    const bd = document.getElementById('modal-backdrop');
    if (bd && bd._close) bd._close(result);
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cv = window.RBStorage.getActiveCV();
    if (!cv) {
      cv = window.RBStorage.createCV('My CV');
    }
    bindGlobalActions();
    // Show a toast while AI retries are pending
    window.RBAi?.setProgressHook?.(p => {
      const t = document.getElementById('toast');
      if (!t) return;
      if (p.retrying) {
        const reason = p.reason === 'rate-limit' ? 'Rate limited' : 'Server busy';
        t.textContent = `${reason} — auto-retrying in ${p.secondsLeft}s… (attempt ${p.attempt})`;
        t.classList.add('show');
        t.onclick = null;
      } else {
        t.classList.remove('show');
      }
    });
    renderAll();
  }

  // ── Render dispatchers ──
  function renderAll() {
    renderCVList();
    renderTemplatePicker();
    renderThemeSwatches();
    renderPhoto();
    renderForm();
    renderExperienceForms();
    renderEducationForms();
    renderSkillsList();
    renderTargetJob();
    renderATSCard();
    renderApiKeyStatus();
    renderPreview();
    renderPreviewTabs();
  }

  function renderPreview() {
    const root = document.getElementById('preview');
    if (!root) return;
    if (previewMode === 'cover' && cv.coverLetter) {
      root.innerHTML = window.RBTemplates.renderCoverLetter(cv);
    } else {
      root.innerHTML = window.RBTemplates.render(cv);
    }
  }

  // ── CV List / Library ──
  function renderCVList() {
    const sel = document.getElementById('cv-select');
    if (!sel) return;
    const list = window.RBStorage.listCVs();
    sel.innerHTML = list.map(c =>
      `<option value="${c.id}" ${c.id === cv.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');
  }

  function switchCV(id) {
    saveAndPersist(true);
    window.RBStorage.setActiveCV(id);
    cv = window.RBStorage.getActiveCV();
    undoStack.length = 0;
    renderAll();
  }

  async function newCV() {
    const name = await ui.prompt('New CV', 'New CV', { placeholder: 'e.g. Designer CV', message: 'Give your new CV a name:' });
    if (name === null) return;
    saveAndPersist(true);
    cv = window.RBStorage.createBlankCV(name || 'New CV');
    undoStack.length = 0;
    renderAll();
  }

  function duplicateActiveCV() {
    saveAndPersist(true);
    cv = window.RBStorage.duplicateCV(cv.id);
    renderAll();
  }

  async function renameActiveCV() {
    const name = await ui.prompt('Rename CV', cv.name, { placeholder: 'CV name' });
    if (!name) return;
    cv.name = name;
    saveAndPersist(true);
    renderCVList();
  }

  async function deleteActiveCV() {
    const ok = await ui.confirm('Delete CV', `Delete "${cv.name}"? This cannot be undone.`, { okLabel: 'Delete', danger: true });
    if (!ok) return;
    window.RBStorage.deleteCV(cv.id);
    cv = window.RBStorage.getActiveCV();
    renderAll();
  }

  // ── Template Picker ──
  function renderTemplatePicker() {
    const root = document.getElementById('template-picker');
    if (!root) return;
    const templates = window.RBTemplates.listTemplates();
    root.innerHTML = templates.map(t => `
      <button class="tpl-btn ${t.id === cv.template ? 'active' : ''}" data-tpl="${t.id}" title="${escapeHtml(t.desc)}">
        <span class="tpl-name">${escapeHtml(t.name)}</span>
      </button>
    `).join('');
    root.querySelectorAll('.tpl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cv.template = btn.dataset.tpl;
        saveAndPersist();
        renderTemplatePicker();
        renderPreview();
      });
    });
  }

  // ── Theme Swatches ──
  function renderThemeSwatches() {
    const root = document.getElementById('theme-swatches');
    if (!root) return;
    const colors = ['#1a1a1a', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ea580c', '#0d9488'];
    root.innerHTML = colors.map(c => `
      <button class="swatch ${c === cv.themeColor ? 'active' : ''}" style="background:${c}" data-color="${c}"></button>
    `).join('') + `
      <label class="swatch swatch-picker" title="Custom color">
        <input type="color" value="${cv.themeColor}" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">
      </label>
    `;
    root.querySelectorAll('[data-color]').forEach(b => {
      b.addEventListener('click', () => {
        cv.themeColor = b.dataset.color;
        saveAndPersist();
        renderThemeSwatches();
        renderPreview();
      });
    });
    const picker = root.querySelector('.swatch-picker input');
    if (picker) {
      picker.addEventListener('input', e => {
        cv.themeColor = e.target.value;
        saveAndPersist();
        renderPreview();
      });
    }
  }

  // ── Photo ──
  function renderPhoto() {
    const preview = document.getElementById('photo-preview');
    const remove = document.getElementById('photo-remove');
    if (!preview) return;
    if (cv.photo) {
      preview.innerHTML = `<img src="${cv.photo}" alt="">`;
      if (remove) remove.style.display = 'inline-block';
    } else {
      preview.textContent = '+';
      if (remove) remove.style.display = 'none';
    }
  }

  function handlePhoto(file) {
    if (!file) return;
    if (file.size > 1024 * 1024 * 2) {
      ui.alert('Photo too big', 'Please pick an image under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      cv.photo = e.target.result;
      saveAndPersist();
      renderPhoto();
      renderPreview();
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    cv.photo = null;
    saveAndPersist();
    renderPhoto();
    renderPreview();
  }

  // ── Personal + Summary form ──
  function renderForm() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && el.value !== val) el.value = val || '';
    };
    set('f-name', cv.personal.name);
    set('f-title', cv.personal.title);
    set('f-email', cv.personal.email);
    set('f-phone', cv.personal.phone);
    set('f-location', cv.personal.location);
    set('f-website', cv.personal.website);
    set('f-summary', cv.summary);
  }

  function bindForm() {
    const map = {
      'f-name': v => cv.personal.name = v,
      'f-title': v => cv.personal.title = v,
      'f-email': v => cv.personal.email = v,
      'f-phone': v => cv.personal.phone = v,
      'f-location': v => cv.personal.location = v,
      'f-website': v => cv.personal.website = v,
      'f-summary': v => cv.summary = v
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        map[id](el.value);
        saveAndPersist();
        renderPreview();
      });
    });
  }

  // ── Experience / Education forms ──
  function renderExperienceForms() {
    renderEntryGroup('exp-list', cv.experience, 'experience');
  }
  function renderEducationForms() {
    renderEntryGroup('edu-list', cv.education, 'education');
  }

  function renderEntryGroup(containerId, arr, type) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const isExp = type === 'experience';
    root.innerHTML = arr.map((e, i) => `
      <div class="entry-card" data-i="${i}">
        <div class="entry-head">
          <strong>${isExp ? 'Position' : 'Degree'} ${i + 1}</strong>
          <button class="icon-btn entry-remove" title="Remove">×</button>
        </div>
        <div class="field"><label>${isExp ? 'Job Title' : 'Degree'}</label>
          <input type="text" data-k="title" value="${escapeAttr(e.title)}">
        </div>
        <div class="row">
          <div class="field"><label>${isExp ? 'Company' : 'Institution'}</label>
            <input type="text" data-k="company" value="${escapeAttr(e.company)}">
          </div>
          <div class="field"><label>Period</label>
            <input type="text" data-k="period" value="${escapeAttr(e.period)}" placeholder="2020 - Present">
          </div>
        </div>
        <div class="field">
          <label>Description ${isExp ? '<button class="ai-btn" data-ai="bullet" title="Improve with AI">✨</button>' : ''}</label>
          <textarea data-k="desc" rows="3">${escapeHtml(e.desc)}</textarea>
        </div>
      </div>
    `).join('') + `
      <button class="add-entry">+ Add ${isExp ? 'Position' : 'Education'}</button>
    `;

    // Wire inputs
    root.querySelectorAll('.entry-card').forEach(card => {
      const i = +card.dataset.i;
      card.querySelectorAll('[data-k]').forEach(input => {
        input.addEventListener('input', () => {
          arr[i][input.dataset.k] = input.value;
          saveAndPersist();
          renderPreview();
        });
      });
      card.querySelector('.entry-remove').addEventListener('click', () => {
        arr.splice(i, 1);
        saveAndPersist();
        type === 'experience' ? renderExperienceForms() : renderEducationForms();
        renderPreview();
      });
      const aiBtn = card.querySelector('.ai-btn[data-ai="bullet"]');
      if (aiBtn) {
        aiBtn.addEventListener('click', () => improveBulletByIndex(i));
      }
    });
    root.querySelector('.add-entry').addEventListener('click', () => {
      arr.push({ title: '', company: '', period: '', desc: '' });
      saveAndPersist();
      type === 'experience' ? renderExperienceForms() : renderEducationForms();
    });
  }

  // ── Skills ──
  function renderSkillsList() {
    const root = document.getElementById('skills-list');
    if (!root) return;
    root.innerHTML = cv.skills.map((s, i) => `
      <span class="skill-tag">${escapeHtml(s)}<button data-i="${i}" title="Remove">×</button></span>
    `).join('');
    root.querySelectorAll('button[data-i]').forEach(b => {
      b.addEventListener('click', () => {
        cv.skills.splice(+b.dataset.i, 1);
        saveAndPersist();
        renderSkillsList();
        renderPreview();
      });
    });
  }

  function addSkill(text) {
    const s = (text || '').trim();
    if (!s) return;
    if (!cv.skills.includes(s)) cv.skills.push(s);
    saveAndPersist();
    renderSkillsList();
    renderPreview();
  }

  // ── Target Job (JD) ──
  function renderTargetJob() {
    const ta = document.getElementById('target-job');
    if (ta && ta.value !== cv.targetJob) ta.value = cv.targetJob || '';
  }

  // ── ATS Card ──
  function renderATSCard() {
    const root = document.getElementById('ats-card');
    if (!root) return;
    if (!cv.atsScore) {
      root.style.display = 'none';
      return;
    }
    const { score, missingKeywords = [], suggestions = [] } = cv.atsScore;
    const color = score >= 75 ? '#16a34a' : score >= 50 ? '#ca8a04' : '#dc2626';
    root.style.display = 'block';
    root.innerHTML = `
      <div class="ats-head">
        <div class="ats-score" style="color:${color};border-color:${color}">${score}<span>/100</span></div>
        <div>
          <div class="ats-title">ATS Match Score</div>
          <div class="ats-sub">${score >= 75 ? 'Strong match' : score >= 50 ? 'Decent — improve below' : 'Needs work'}</div>
        </div>
      </div>
      ${missingKeywords.length ? `
        <div class="ats-section">
          <div class="ats-label">Missing keywords (click to add as skill)</div>
          <div class="ats-keywords">
            ${missingKeywords.map(k => `<button class="ats-kw" data-kw="${escapeAttr(k)}">+ ${escapeHtml(k)}</button>`).join('')}
          </div>
        </div>
      ` : ''}
      ${suggestions.length ? `
        <div class="ats-section">
          <div class="ats-label">Suggestions</div>
          <ul class="ats-suggestions">${suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    `;
    root.querySelectorAll('.ats-kw').forEach(b => {
      b.addEventListener('click', () => {
        addSkill(b.dataset.kw);
        b.disabled = true;
        b.textContent = '✓ ' + b.dataset.kw;
      });
    });
  }

  // ── Preview Tabs ──
  function renderPreviewTabs() {
    const root = document.getElementById('preview-tabs');
    if (!root) return;
    if (!cv.coverLetter) {
      root.style.display = 'none';
      previewMode = 'resume';
      return;
    }
    root.style.display = 'flex';
    root.innerHTML = `
      <button data-mode="resume" class="${previewMode === 'resume' ? 'active' : ''}">Resume</button>
      <button data-mode="cover" class="${previewMode === 'cover' ? 'active' : ''}">Cover Letter</button>
    `;
    root.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        previewMode = b.dataset.mode;
        renderPreviewTabs();
        renderPreview();
        document.body.classList.toggle('print-cover', previewMode === 'cover');
      });
    });
  }

  // ── API Key Status ──
  function renderApiKeyStatus() {
    const status = document.getElementById('api-key-status');
    const input = document.getElementById('api-key-input');
    const modelSelect = document.getElementById('model-select');
    const key = window.RBStorage.getApiKey();
    if (input && !input.value) input.value = key;
    if (modelSelect) {
      const settings = window.RBStorage.getSettings();
      if (modelSelect.value !== settings.model) modelSelect.value = settings.model;
    }
    if (status) {
      if (key) {
        status.textContent = '✓ Connected';
        status.className = 'kv-status ok';
      } else {
        status.textContent = 'Not set';
        status.className = 'kv-status warn';
      }
    }
  }

  // ── AI Actions ──
  async function improveSummary() {
    if (!(await checkAi())) return;
    const original = cv.summary;
    if (!original || !original.trim()) {
      await ui.alert('Nothing to improve', 'Write something in the summary first, then click ✨ to improve it.');
      return;
    }
    pushUndo({ type: 'summary', value: original });
    autoSnapshot('ai-improve-summary');
    setBusy('summary', true);
    try {
      const improved = await window.RBAi.improveText(original, 'summary');
      cv.summary = improved;
      saveAndPersist();
      renderForm();
      renderPreview();
      flashUndo('Summary improved');
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('summary', false);
    }
  }

  async function improveBulletByIndex(i) {
    if (!(await checkAi())) return;
    const original = cv.experience[i]?.desc || '';
    if (!original.trim()) {
      await ui.alert('Nothing to improve', 'Write something in the description first, then click ✨ to improve it.');
      return;
    }
    pushUndo({ type: 'bullet', i, value: original });
    autoSnapshot('ai-improve-bullet', `Bullet #${i + 1}`);
    setBusy('bullet-' + i, true);
    try {
      const improved = await window.RBAi.improveText(original, 'bullet');
      cv.experience[i].desc = improved;
      saveAndPersist();
      renderExperienceForms();
      renderPreview();
      flashUndo('Bullet improved');
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('bullet-' + i, false);
    }
  }

  async function tailorToJob() {
    if (!(await checkAi())) return;
    const jd = (cv.targetJob || '').trim();
    if (!jd) {
      await ui.alert('Missing job description', 'Paste the job description in the "Target Job" field first.');
      return;
    }
    const ok = await ui.confirm('Tailor CV to this job?', 'This will rewrite your summary, experience descriptions, and reorder skills to match the job.', { okLabel: 'Tailor' });
    if (!ok) return;
    pushUndo({ type: 'full', value: JSON.parse(JSON.stringify(cv)) });
    autoSnapshot('ai-tailor', 'Tailored to: ' + jd.slice(0, 60).replace(/\s+/g, ' '));
    setBusy('tailor', true);
    try {
      const updated = await window.RBAi.tailorCV(cv, jd);
      Object.assign(cv, updated);
      saveAndPersist();
      renderAll();
      flashUndo('CV tailored to job');
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('tailor', false);
    }
  }

  async function scoreAtsAction() {
    if (!(await checkAi())) return;
    const jd = (cv.targetJob || '').trim();
    if (!jd) {
      await ui.alert('Missing job description', 'Paste the job description in the "Target Job" field first.');
      return;
    }
    setBusy('ats', true);
    try {
      const result = await window.RBAi.scoreATS(cv, jd);
      cv.atsScore = result;
      saveAndPersist();
      renderATSCard();
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('ats', false);
    }
  }

  async function generateFromPromptAction() {
    if (!(await checkAi())) return;
    const text = await ui.prompt(
      '✨ Generate CV from prompt',
      'Senior frontend engineer with 6 years experience at startups, specialized in React and design systems.',
      {
        textarea: true,
        message: 'Describe yourself in 2-3 sentences (role, years of experience, key strengths). AI will draft a full CV you can then edit.',
        placeholder: 'e.g. Senior product designer with 8 years...',
        okLabel: 'Generate'
      }
    );
    if (!text || !text.trim()) return;
    autoSnapshot('ai-generate', 'Prompt: ' + text.slice(0, 60).replace(/\s+/g, ' '));
    setBusy('generate', true);
    try {
      const generated = await window.RBAi.generateFromPrompt(text);
      pushUndo({ type: 'full', value: JSON.parse(JSON.stringify(cv)) });
      if (generated.personal) cv.personal = generated.personal;
      if (generated.summary) cv.summary = generated.summary;
      if (generated.experience) cv.experience = generated.experience;
      if (generated.education) cv.education = generated.education;
      if (generated.skills) cv.skills = generated.skills;
      saveAndPersist();
      renderAll();
      flashUndo('CV generated from prompt');
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('generate', false);
    }
  }

  async function generateCoverLetterAction() {
    if (!(await checkAi())) return;
    const jd = (cv.targetJob || '').trim();
    if (!jd) {
      await ui.alert('Missing job description', 'Paste the job description in the "Target Job" field first.');
      return;
    }
    setBusy('cover', true);
    try {
      const text = await window.RBAi.generateCoverLetter(cv, jd);
      cv.coverLetter = text;
      saveAndPersist();
      renderPreviewTabs();
      previewMode = 'cover';
      renderPreviewTabs();
      renderPreview();
    } catch (e) {
      await ui.alert('AI error', window.RBAi.explainError(e));
    } finally {
      setBusy('cover', false);
    }
  }

  async function uploadCV(file) {
    if (!file) return;
    if (!(await checkAi('Upload-and-parse needs the AI to extract structured data. '))) return;
    setBusy('upload', true);
    try {
      const text = await window.RBParsers.fileToText(file);
      if (!text || text.length < 50) {
        await ui.alert('File too short', 'Could not extract enough text from the file.');
        return;
      }
      autoSnapshot('import', 'Before importing: ' + (file.name || 'file'));
      const parsed = await window.RBAi.parseUploadedCV(text);
      pushUndo({ type: 'full', value: JSON.parse(JSON.stringify(cv)) });
      if (parsed.personal) cv.personal = { ...cv.personal, ...parsed.personal };
      if (parsed.summary) cv.summary = parsed.summary;
      if (parsed.experience?.length) cv.experience = parsed.experience;
      if (parsed.education?.length) cv.education = parsed.education;
      if (parsed.skills?.length) cv.skills = parsed.skills;
      saveAndPersist();
      renderAll();
      flashUndo('CV imported from file');
    } catch (e) {
      await ui.alert('Upload failed', (e.message || String(e)));
    } finally {
      setBusy('upload', false);
    }
  }

  // ── Undo (last AI action) ──
  function pushUndo(snapshot) {
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    document.getElementById('undo-btn')?.removeAttribute('disabled');
  }

  function undoLast() {
    const last = undoStack.pop();
    if (!last) return;
    if (last.type === 'summary') cv.summary = last.value;
    else if (last.type === 'bullet' && cv.experience[last.i]) cv.experience[last.i].desc = last.value;
    else if (last.type === 'full') cv = last.value;
    saveAndPersist();
    renderAll();
    if (undoStack.length === 0) {
      document.getElementById('undo-btn')?.setAttribute('disabled', '');
    }
  }

  function flashUndo(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg + '  ↶ Undo';
    t.classList.add('show');
    clearTimeout(flashUndo._t);
    flashUndo._t = setTimeout(() => t.classList.remove('show'), 4000);
    t.onclick = () => { undoLast(); t.classList.remove('show'); };
  }

  // ── Busy spinner for AI buttons ──
  function setBusy(id, busy) {
    const btn = document.querySelector(`[data-busy="${id}"]`);
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = '… working';
      btn.setAttribute('disabled', '');
    } else {
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
      btn.removeAttribute('disabled');
    }
  }

  async function checkAi(prefix) {
    if (!window.RBAi.isConfigured()) {
      const settings = document.getElementById('settings-section');
      if (settings) settings.classList.remove('hidden');
      await ui.alert(
        'Gemini API key needed',
        (prefix || '') + 'Open the Settings (Gemini API) section in the sidebar and paste your free key from https://aistudio.google.com/apikey — then try again.'
      );
      // Focus the input
      setTimeout(() => document.getElementById('api-key-input')?.focus(), 100);
      return false;
    }
    return true;
  }

  // ── Persist ──
  function saveAndPersist(immediate) {
    window.RBStorage.saveCV(cv, immediate);
  }

  // ── Version History ──
  function autoSnapshot(source, note) {
    if (!cv) return;
    window.RBStorage.maybeSaveAutoVersion(cv.id, cv, source, note || '');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today, ${time}`;
    if (yesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
  }

  function sourceBadgeClass(s) {
    if (s === 'manual') return 'manual';
    if (s === 'import') return 'import';
    if (s && s.startsWith('ai-')) return 'ai';
    return '';
  }

  function sourceLabel(s) {
    const map = {
      'manual': 'Manual',
      'import': 'Import',
      'ai-tailor': 'Before AI tailor',
      'ai-generate': 'Before AI generate',
      'ai-improve-summary': 'Before AI summary',
      'ai-improve-bullet': 'Before AI bullet',
      'ai-cover': 'Before cover letter',
      'restore': 'Before restore'
    };
    return map[s] || s || 'Auto';
  }

  function renderHistoryList() {
    const versions = window.RBStorage.listVersions(cv.id);
    const list = document.getElementById('history-list');
    if (!list) return;
    if (versions.length === 0) {
      list.innerHTML = `<div class="history-empty">No saved versions yet.<br>Versions are auto-saved before AI actions, or use "Save current version" above.</div>`;
      return;
    }
    list.innerHTML = versions.map(v => `
      <div class="history-item" data-vid="${escapeAttr(v.id)}">
        <div>
          <div class="history-meta-row">
            <span class="history-time">${formatTime(v.createdAt)}</span>
            <span class="history-source ${sourceBadgeClass(v.source)}">${escapeHtml(sourceLabel(v.source))}</span>
          </div>
          ${v.note ? `<div class="history-note">${escapeHtml(v.note)}</div>` : ''}
          <div class="history-size">${(v.sizeBytes / 1024).toFixed(1)} KB</div>
        </div>
        <div class="history-row-actions">
          <button class="history-btn" data-act="restore">Restore</button>
          <button class="history-btn" data-act="pdf">PDF</button>
          <button class="history-btn" data-act="json">JSON</button>
          <button class="history-btn danger" data-act="delete">×</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      const vid = item.dataset.vid;
      item.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => historyAction(vid, btn.dataset.act));
      });
    });
  }

  async function historyAction(versionId, action) {
    const v = window.RBStorage.loadVersion(cv.id, versionId);
    if (!v) return;

    if (action === 'restore') {
      const ok = await ui.confirm(
        'Restore this version?',
        `Replace your current CV with the version from ${formatTime(v.createdAt)}.\n\nA snapshot of your current CV will be auto-saved first, so you can undo this.`,
        { okLabel: 'Restore' }
      );
      if (!ok) return;
      // Snapshot current first
      autoSnapshot('restore', 'Auto-saved before restoring earlier version');
      // Restore: keep id, override everything else
      const restoredId = cv.id;
      const restoredName = cv.name;
      Object.assign(cv, v.snapshot);
      cv.id = restoredId;
      cv.name = restoredName; // keep current name to avoid confusion
      cv.updatedAt = Date.now();
      saveAndPersist(true);
      closeCustomModal(null);
      renderAll();
      flashUndo(`Restored version from ${formatTime(v.createdAt)}`);
    } else if (action === 'pdf') {
      // Temporarily render the snapshot, print, then restore current view
      const previewRoot = document.getElementById('preview');
      const before = previewRoot.innerHTML;
      const snap = v.snapshot;
      // Carry-over display pref
      previewRoot.innerHTML = window.RBTemplates.render({ ...snap, template: snap.template || cv.template });
      document.body.classList.remove('print-cover');
      closeCustomModal(null);
      // Brief delay so the modal closes before print preview opens
      setTimeout(() => {
        window.print();
        // Restore the live preview after print dialog returns
        setTimeout(() => { renderPreview(); }, 100);
      }, 300);
    } else if (action === 'json') {
      const filename = `${cv.name.replace(/[^\w\-]+/g, '_')}_${new Date(v.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
      downloadAsFile(JSON.stringify(v.snapshot, null, 2), filename, 'application/json');
    } else if (action === 'delete') {
      const ok = await ui.confirm('Delete this version?', `Remove the version from ${formatTime(v.createdAt)}? This cannot be undone.`, { okLabel: 'Delete', danger: true });
      if (!ok) return;
      window.RBStorage.deleteVersion(cv.id, versionId);
      renderHistoryList();
    }
  }

  function downloadAsFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function openHistoryModal() {
    const html = `
      <h3>🕒 Version history — ${escapeHtml(cv.name)}</h3>
      <p>Versions are auto-saved before AI actions. You can also save manually with a note.</p>
      <div class="history-toolbar">
        <input type="text" id="history-note-input" placeholder="Optional note (e.g. 'Before applying to Stripe')">
        <button id="history-save-btn">+ Save current version</button>
      </div>
      <div class="history-list" id="history-list"></div>
      <div class="rb-modal-actions" style="margin-top:14px">
        <button class="rb-modal-btn rb-modal-btn-ghost" id="history-clear-all">Clear all</button>
        <button class="rb-modal-btn rb-modal-btn-primary" id="history-close">Close</button>
      </div>
    `;
    const promise = openCustomModal(html, { wide: true });

    // Defer wire-up (modal HTML is now in DOM)
    setTimeout(() => {
      renderHistoryList();
      document.getElementById('history-save-btn')?.addEventListener('click', () => {
        const note = (document.getElementById('history-note-input').value || '').trim();
        window.RBStorage.saveVersion(cv.id, cv, 'manual', note);
        document.getElementById('history-note-input').value = '';
        renderHistoryList();
        flashUndo('Version saved');
      });
      document.getElementById('history-close')?.addEventListener('click', () => closeCustomModal(null));
      document.getElementById('history-clear-all')?.addEventListener('click', async () => {
        const versions = window.RBStorage.listVersions(cv.id);
        if (versions.length === 0) return;
        const ok = await ui.confirm('Clear all versions?', `Delete all ${versions.length} saved versions for "${cv.name}"? This cannot be undone.`, { okLabel: 'Clear all', danger: true });
        if (!ok) return;
        window.RBStorage.clearVersions(cv.id);
        renderHistoryList();
      });
      document.getElementById('history-note-input')?.focus();
    }, 50);

    return promise;
  }

  // ── Global event wiring ──
  function bindGlobalActions() {
    bindForm();

    // Section toggles
    document.querySelectorAll('.section-title').forEach(t => {
      t.addEventListener('click', () => {
        t.nextElementSibling?.classList.toggle('hidden');
      });
    });

    // CV select / actions
    document.getElementById('cv-select')?.addEventListener('change', e => switchCV(e.target.value));
    document.getElementById('cv-new')?.addEventListener('click', newCV);
    document.getElementById('cv-rename')?.addEventListener('click', renameActiveCV);
    document.getElementById('cv-duplicate')?.addEventListener('click', duplicateActiveCV);
    document.getElementById('cv-history')?.addEventListener('click', openHistoryModal);
    document.getElementById('cv-delete')?.addEventListener('click', deleteActiveCV);

    // API key
    document.getElementById('api-key-save')?.addEventListener('click', () => {
      const v = (document.getElementById('api-key-input').value || '').trim();
      window.RBStorage.setApiKey(v);
      renderApiKeyStatus();
    });
    document.getElementById('api-key-clear')?.addEventListener('click', () => {
      window.RBStorage.setApiKey('');
      document.getElementById('api-key-input').value = '';
      renderApiKeyStatus();
    });

    // Settings model dropdown
    document.getElementById('model-select')?.addEventListener('change', e => {
      window.RBStorage.setSettings({ model: e.target.value });
    });

    // Photo
    document.getElementById('photo-input')?.addEventListener('change', e => handlePhoto(e.target.files[0]));
    document.getElementById('photo-remove')?.addEventListener('click', removePhoto);

    // Target Job
    document.getElementById('target-job')?.addEventListener('input', e => {
      cv.targetJob = e.target.value;
      saveAndPersist();
    });

    // Skills input
    document.getElementById('skill-add-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSkill(e.target.value);
        e.target.value = '';
      }
    });
    document.getElementById('skill-add-btn')?.addEventListener('click', () => {
      const input = document.getElementById('skill-add-input');
      addSkill(input.value);
      input.value = '';
    });

    // AI buttons
    document.getElementById('btn-improve-summary')?.addEventListener('click', improveSummary);
    document.getElementById('btn-tailor')?.addEventListener('click', tailorToJob);
    document.getElementById('btn-ats')?.addEventListener('click', scoreAtsAction);
    document.getElementById('btn-cover')?.addEventListener('click', generateCoverLetterAction);
    document.getElementById('btn-generate')?.addEventListener('click', generateFromPromptAction);

    // Upload (button is a <label for="cv-upload-input"> so native click works)
    const uploadInput = document.getElementById('cv-upload-input');
    uploadInput?.addEventListener('change', e => {
      uploadCV(e.target.files[0]);
      e.target.value = ''; // reset so same file can be re-selected
    });

    // Print
    document.getElementById('btn-print')?.addEventListener('click', () => {
      document.body.classList.toggle('print-cover', previewMode === 'cover');
      window.print();
    });

    // Reset (only current CV's data, not all CVs)
    document.getElementById('btn-reset')?.addEventListener('click', async () => {
      const ok = await ui.confirm('Reset CV', 'Reset this CV to defaults? Other CVs are unaffected.', { okLabel: 'Reset', danger: true });
      if (!ok) return;
      const fresh = window.RBStorage.defaultCV(cv.name);
      fresh.id = cv.id;
      Object.assign(cv, fresh);
      saveAndPersist(true);
      renderAll();
    });

    // Undo
    document.getElementById('undo-btn')?.addEventListener('click', undoLast);
  }

  // ── Helpers ──
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // Expose for debugging
  window.RBApp = { renderAll, getCv: () => cv };
})();
