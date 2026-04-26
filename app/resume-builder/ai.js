/**
 * LifeHub Resume Builder — Gemini AI Client
 *
 * Uses Google Gemini API (free tier).
 * User provides their own API key (BYOK) via Settings.
 * Get a free key at: https://aistudio.google.com/apikey
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

  function getKey() {
    const k = window.RBStorage && window.RBStorage.getApiKey();
    return k || '';
  }

  function getModel() {
    const s = window.RBStorage && window.RBStorage.getSettings();
    return (s && s.model) || 'gemini-2.0-flash';
  }

  // Optional hook to show retry countdown in UI
  let progressHook = null;
  function setProgressHook(fn) { progressHook = fn; }

  // Parse retryDelay ("30s", "1.5s") from Gemini's 429 response
  function parseRetryDelay(text) {
    try {
      const data = JSON.parse(text);
      const details = data?.error?.details || [];
      for (const d of details) {
        if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
          const m = String(d.retryDelay).match(/^([\d.]+)s$/);
          if (m) return Math.ceil(parseFloat(m[1]));
        }
      }
    } catch {}
    return null;
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── Core call ──
  async function callGemini(prompt, opts = {}) {
    const key = getKey();
    if (!key) {
      const err = new Error('NO_API_KEY');
      err.code = 'NO_API_KEY';
      throw err;
    }

    const model = opts.model || getModel();
    const url = `${ENDPOINT}/${model}:generateContent`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 2048
      }
    };

    if (opts.json) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const maxRetries = opts.maxRetries ?? 2;
    let lastErrDetail = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': key
          },
          body: JSON.stringify(body)
        });
      } catch (e) {
        const err = new Error('NETWORK_ERROR');
        err.code = 'NETWORK_ERROR';
        err.detail = e.message;
        throw err;
      }

      if (res.ok) {
        const data = await res.json();
        const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!out) {
          const err = new Error('EMPTY_RESPONSE');
          err.code = 'EMPTY_RESPONSE';
          err.detail = JSON.stringify(data).slice(0, 300);
          throw err;
        }
        return out.trim();
      }

      const text = await res.text().catch(() => '');
      lastErrDetail = text;

      // Retry on 429 (quota) and 503 (overloaded) with server-suggested delay
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const suggested = parseRetryDelay(text);
        // Fallback: exponential backoff (5s, 15s) if server didn't say
        const waitSec = suggested ?? (attempt === 0 ? 5 : 15);
        if (progressHook) {
          for (let left = waitSec; left > 0; left--) {
            progressHook({ retrying: true, secondsLeft: left, attempt: attempt + 1, reason: res.status === 429 ? 'rate-limit' : 'overloaded' });
            await sleep(1000);
          }
          progressHook({ retrying: false });
        } else {
          await sleep(waitSec * 1000);
        }
        continue;
      }

      const err = new Error('API_ERROR');
      err.code = res.status === 429 ? 'QUOTA_EXCEEDED'
              : res.status === 400 ? 'BAD_REQUEST'
              : res.status === 403 ? 'INVALID_KEY'
              : res.status === 503 ? 'OVERLOADED'
              : 'API_ERROR';
      err.status = res.status;
      err.detail = text;
      throw err;
    }

    // Shouldn't hit — but satisfy the linter
    const err = new Error('API_ERROR');
    err.code = 'QUOTA_EXCEEDED';
    err.detail = lastErrDetail;
    throw err;
  }

  async function callJSON(prompt, opts = {}) {
    const raw = await callGemini(prompt, { ...opts, json: true });
    try {
      return JSON.parse(raw);
    } catch {
      // Sometimes the model wraps in ```json ... ``` even with JSON mode
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    }
  }

  // ── Feature: Improve text (summary or bullet) ──
  async function improveText(text, type) {
    const isBullet = type === 'bullet';
    const wordLimit = isBullet ? 40 : 80;
    const guidance = isBullet
      ? 'a single experience bullet point — start with a strong action verb (Led, Designed, Shipped, Reduced…), include quantifiable results when possible, no first-person pronouns'
      : 'a professional CV summary — confident tone, third-person implied, highlight years of experience and 1-2 standout achievements';

    const prompt = `You are an expert CV writer. Rewrite the following ${guidance}. Keep under ${wordLimit} words. Preserve any factual details (companies, numbers, dates) — do NOT invent.

Return ONLY the rewritten text, no quotes, no explanation, no prefix like "Here is".

Original:
"""
${text}
"""`;

    return await callGemini(prompt, { temperature: 0.7 });
  }

  // ── Feature: Tailor whole CV to a job description ──
  async function tailorCV(cv, jobDescription) {
    const compact = {
      summary: cv.summary,
      experience: cv.experience.map(e => ({ title: e.title, company: e.company, desc: e.desc })),
      skills: cv.skills
    };

    const prompt = `You are an expert CV tailor and ATS optimization specialist.

Given a CV and a job description, rewrite the CV to better match the job. Rules:
1. Rewrite the summary to highlight skills/experience relevant to the JD.
2. Rewrite each experience description to emphasize JD-relevant achievements (preserve company names, titles, and factual numbers).
3. Reorder skills so JD-relevant skills come first. Add missing skills from the JD that the candidate likely has based on their experience (be conservative — don't invent skills they couldn't have).
4. NEVER fabricate experience, companies, dates, or qualifications.
5. Keep the same number of experience entries — only rewrite descriptions.

JOB DESCRIPTION:
"""
${jobDescription}
"""

CURRENT CV (JSON):
${JSON.stringify(compact, null, 2)}

Return ONLY a JSON object with this exact shape:
{
  "summary": "...",
  "experience": [{"desc": "..."}, ...],
  "skills": ["...", "..."]
}

The "experience" array must have the same length and order as the input. Each entry needs only the new "desc".`;

    const result = await callJSON(prompt, { temperature: 0.5, maxTokens: 3000 });

    // Apply to full CV (preserve titles/companies/periods)
    const updated = JSON.parse(JSON.stringify(cv));
    if (result.summary) updated.summary = result.summary;
    if (Array.isArray(result.experience)) {
      result.experience.forEach((e, i) => {
        if (updated.experience[i] && e.desc) {
          updated.experience[i].desc = e.desc;
        }
      });
    }
    if (Array.isArray(result.skills) && result.skills.length > 0) {
      updated.skills = result.skills;
    }
    return updated;
  }

  // ── Feature: ATS Score ──
  async function scoreATS(cv, jobDescription) {
    const cvText = `
SUMMARY: ${cv.summary}

EXPERIENCE:
${cv.experience.map(e => `- ${e.title} at ${e.company}: ${e.desc}`).join('\n')}

SKILLS: ${cv.skills.join(', ')}

EDUCATION:
${cv.education.map(e => `- ${e.title} from ${e.company}`).join('\n')}
`.trim();

    const prompt = `You are an ATS (Applicant Tracking System) analyzer.

Compare the CV below against the job description. Return a JSON analysis:
- "score" (integer 0-100): how well the CV matches the JD
- "missingKeywords" (array of strings, max 12): important keywords/skills/tools from the JD that are MISSING from the CV
- "suggestions" (array of strings, max 5): concrete actionable improvements (1 sentence each)

JOB DESCRIPTION:
"""
${jobDescription}
"""

CV:
"""
${cvText}
"""

Return ONLY valid JSON: {"score": N, "missingKeywords": [...], "suggestions": [...]}`;

    return await callJSON(prompt, { temperature: 0.3, maxTokens: 1000 });
  }

  // ── Feature: Generate full CV from prompt ──
  async function generateFromPrompt(userPrompt) {
    const prompt = `You are an expert CV writer. The user describes themselves briefly. Generate a complete, realistic, professional CV in JSON.

Use this exact JSON shape:
{
  "personal": {
    "name": "...",
    "title": "...",
    "email": "...",
    "phone": "...",
    "location": "...",
    "website": "..."
  },
  "summary": "...",
  "experience": [
    {"title": "...", "company": "...", "period": "YYYY - YYYY", "desc": "..."}
  ],
  "education": [
    {"title": "...", "company": "...", "period": "YYYY - YYYY", "desc": ""}
  ],
  "skills": ["...", "..."]
}

Rules:
- 2-4 experience entries (most recent first)
- 1-2 education entries
- 8-12 skills
- Each "desc" is 1-2 sentences with strong action verbs and specific outcomes
- Use plausible-sounding but generic email/phone/location if user didn't specify
- Match the seniority level the user describes

USER DESCRIPTION:
"""
${userPrompt}
"""

Return ONLY the JSON.`;

    return await callJSON(prompt, { temperature: 0.8, maxTokens: 3000 });
  }

  // ── Feature: Parse uploaded CV (raw text) ──
  async function parseUploadedCV(rawText) {
    // Truncate if huge
    const text = rawText.length > 8000 ? rawText.slice(0, 8000) : rawText;

    const prompt = `You are a CV parser. Extract the following CV text into structured JSON.

Use this exact JSON shape (same as the generator):
{
  "personal": {"name":"","title":"","email":"","phone":"","location":"","website":""},
  "summary": "",
  "experience": [{"title":"","company":"","period":"","desc":""}],
  "education": [{"title":"","company":"","period":"","desc":""}],
  "skills": []
}

Rules:
- Extract all experience and education entries
- "period" should be in format like "2020 - Present" or "2018 - 2021"
- "desc" should be the bullet points / description text combined
- "skills" is a flat array of skill names
- If a field is not found, use empty string ""
- Preserve all factual content — do not rewrite or improve

CV TEXT:
"""
${text}
"""

Return ONLY the JSON.`;

    return await callJSON(prompt, { temperature: 0.2, maxTokens: 3500 });
  }

  // ── Feature: Cover Letter ──
  async function generateCoverLetter(cv, jobDescription) {
    const compact = {
      name: cv.personal?.name,
      title: cv.personal?.title,
      summary: cv.summary,
      topExperience: cv.experience.slice(0, 2).map(e => ({ title: e.title, company: e.company, desc: e.desc })),
      skills: cv.skills.slice(0, 10)
    };

    const prompt = `You are an expert cover letter writer. Write a compelling, personalized cover letter for this candidate applying to the job below.

Rules:
- 3-4 paragraphs, ~250-350 words total
- Opening: hook + which role they're applying to (infer from JD)
- Middle: 2-3 specific achievements from their CV that match the JD's needs
- Closing: enthusiasm + call to action
- Tone: confident but not arrogant, warm, professional
- Do NOT use clichés like "I am writing to apply for..." or "Hard worker, team player"
- Address it as "Dear Hiring Manager," if no name is given
- Sign as the candidate's name

CANDIDATE:
${JSON.stringify(compact, null, 2)}

JOB DESCRIPTION:
"""
${jobDescription}
"""

Return ONLY the cover letter text (no JSON, no extra commentary).`;

    return await callGemini(prompt, { temperature: 0.7, maxTokens: 1200 });
  }

  // ── Helpers ──
  function isConfigured() {
    return !!getKey();
  }

  function explainError(err) {
    if (!err) return 'Unknown error';
    switch (err.code) {
      case 'NO_API_KEY':
        return 'No Gemini API key set. Open Settings and paste your key from https://aistudio.google.com/apikey';
      case 'INVALID_KEY':
        return 'API key rejected. Check that your key is valid and has Gemini API access enabled.';
      case 'QUOTA_EXCEEDED':
        return 'Gemini rate limit hit even after auto-retry. Options: (1) wait a couple minutes, (2) in Settings switch the model to gemini-2.0-flash or gemini-2.5-flash — those have higher limits than the preview models, (3) upgrade to a paid tier at https://aistudio.google.com/apikey';
      case 'OVERLOADED':
        return 'Gemini is temporarily overloaded. Try again in a minute.';
      case 'NETWORK_ERROR':
        return 'Network error reaching Gemini. Check your internet connection.';
      case 'BAD_REQUEST':
        return 'Bad request — the model may have rejected the prompt. ' + (err.detail || '').slice(0, 200);
      case 'EMPTY_RESPONSE':
        return 'Gemini returned no text (possibly safety-filtered). Try rephrasing.';
      default:
        return (err.message || 'Error') + (err.detail ? ': ' + err.detail.slice(0, 200) : '');
    }
  }

  // ── Export ──
  window.RBAi = {
    improveText,
    tailorCV,
    scoreATS,
    generateFromPrompt,
    parseUploadedCV,
    generateCoverLetter,
    isConfigured,
    explainError,
    setProgressHook
  };
})();
