/**
 * LifeHub Resume Builder — File Parsers
 * Loads PDF.js and Mammoth.js on-demand from CDN.
 */
(function () {
  'use strict';

  const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
  const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  const MAMMOTH_URL = 'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js';

  // ── Lazy script loader ──
  function loadScript(src, isModule) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.dataset.src = src;
      if (isModule) s.type = 'module';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  let pdfLib = null;
  async function ensurePdfJs() {
    if (pdfLib) return pdfLib;
    // PDF.js v4 is ESM. Use dynamic import so we can grab the namespace.
    pdfLib = await import(PDF_JS_URL);
    if (pdfLib.GlobalWorkerOptions) {
      pdfLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    }
    return pdfLib;
  }

  async function ensureMammoth() {
    if (window.mammoth) return window.mammoth;
    await loadScript(MAMMOTH_URL);
    return window.mammoth;
  }

  // ── PDF → text ──
  async function pdfToText(file) {
    const pdfjs = await ensurePdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str).join(' ');
      parts.push(text);
    }
    return parts.join('\n\n');
  }

  // ── DOCX → text ──
  async function docxToText(file) {
    const mammoth = await ensureMammoth();
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value || '';
  }

  // ── Plain text ──
  async function txtToText(file) {
    return await file.text();
  }

  // ── Dispatcher ──
  async function fileToText(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return await pdfToText(file);
    if (name.endsWith('.docx')) return await docxToText(file);
    if (name.endsWith('.doc')) {
      throw new Error('Old .doc format not supported. Please save as .docx or .pdf and try again.');
    }
    if (name.endsWith('.txt') || name.endsWith('.md')) return await txtToText(file);
    // Try as text
    return await txtToText(file);
  }

  // ── Export ──
  window.RBParsers = { fileToText, pdfToText, docxToText };
})();
