import express from 'express';
import { config } from '../config.js';
import { requireUser } from '../middleware/auth.js';
import { escapeHtml, layout } from '../utils/html.js';

export const pagesRouter = express.Router();

pagesRouter.get('/', (_req, res) => {
  res.redirect('/rules');
});

pagesRouter.get('/rules', (req, res) => {
  res.send(layout({
    title: 'Qoidalar',
    user: req.user,
    admin: req.isAdmin,
    active: 'rules',
    body: `
      <section class="hero rules-hero">
        <div>
          <p class="eyebrow">Qoidalar</p>
          <h1>Faylni toza yuboring, sayt esa undan quiz test tuzadi.</h1>
          <p class="muted">AI fayl ichidagi savollarni o‘qiydi, A/B/C/D variantlarini ajratadi, to‘g‘ri javobni aniqlaydi va quizni sizning profilingizga saqlaydi.</p>
          <div class="hero-actions">
            <a class="button" href="${req.user && !req.isAdmin ? '/create' : '/register'}">Create Quiz Test</a>
            <a class="button secondary" href="/quizzes">Quiz tests</a>
          </div>
        </div>
        <div class="file-preview">
          <div class="preview-bar">
            <span></span><span></span><span></span>
          </div>
          <pre>1. Kompyuter xotirasi nima?
A) Ma'lumotni vaqtincha saqlash joyi
B) Internet brauzeri
C) Printer drayveri
D) Monitor turi
Javob: A

2. HTML nimaga ishlatiladi?
A) Dizayn ranglari uchun
B) Web sahifa tuzilmasi uchun
C) Server bazasi uchun
D) Antivirus uchun
Javob: B</pre>
        </div>
      </section>

      <section class="rule-grid">
        <article class="rule-item">
          <span class="rule-number">01</span>
          <h2>Fayl formati</h2>
          <p>.txt, .md, .csv, .docx yoki .pdf yuboring. Eng yaxshi natija uchun Word yoki oddiy text fayl ishlating.</p>
        </article>
        <article class="rule-item">
          <span class="rule-number">02</span>
          <h2>Savol tartibi</h2>
          <p>Har bir savoldan keyin A), B), C), D) variantlari alohida qatorda bo‘lsin. Savollar raqamlangan bo‘lsa yanada yaxshi.</p>
        </article>
        <article class="rule-item">
          <span class="rule-number">03</span>
          <h2>To‘g‘ri javob</h2>
          <p>Faylda “Javob: A” yoki “Correct: B” yozilsa AI shuni oladi. Yozilmagan bo‘lsa AI variantlardan eng mos javobni tanlaydi.</p>
        </article>
        <article class="rule-item">
          <span class="rule-number">04</span>
          <h2>Limit</h2>
          <p>Bitta fayl 10 MB gacha. Juda katta PDF yuborsangiz AI token limitiga tushmasligi uchun savollarni bo‘lib yuboring.</p>
        </article>
      </section>

      <section class="guide-panel">
        <div>
          <p class="eyebrow">Namunaviy ko‘rinish</p>
          <h2>Faylingiz ichida ma'lumot shunday joylashsa, quiz aniqroq chiqadi.</h2>
        </div>
        <div class="mock-shot">
          <div class="shot-line strong"></div>
          <div class="shot-line"></div>
          <div class="shot-line"></div>
          <div class="shot-line"></div>
          <div class="shot-line"></div>
          <div class="answer-badge">Javob: C</div>
        </div>
      </section>

      ${!req.user ? `
        <section class="cta-band">
          <h2>Boshlash uchun register qiling.</h2>
          <a class="button" href="/register">Register</a>
        </section>
      ` : ''}
    `
  }));
});

pagesRouter.get('/create', requireUser, (req, res) => {
  res.send(renderCreate(req));
});

export function renderCreate(req, error = '') {
  const aiReady = Boolean(config.ai.apiKey);

  return layout({
    title: 'Create Quiz Test',
    user: req.user,
    active: 'create',
    body: `
      <section class="page-head">
        <div>
          <p class="eyebrow">Create</p>
          <h1>Fayldan quiz test yaratish.</h1>
          <p class="muted">Fayl yuklang, AI savollarni tahlil qiladi va tayyor quiz “Quiz tests” bo‘limida paydo bo‘ladi.</p>
        </div>
        <span class="status-pill ${aiReady ? 'ok' : 'warn'}">${aiReady ? 'AI ulangan' : 'AI key kerak'}</span>
      </section>

      <section class="create-layout">
        <form class="upload-panel" method="post" action="/create" enctype="multipart/form-data">
          <label>
            <span>Quiz nomi</span>
            <input name="title" placeholder="Masalan: MTA 1-kurs testlari">
          </label>
          <label class="dropzone">
            <input type="file" name="quizFile" accept=".txt,.md,.csv,.docx,.pdf" required>
            <span class="drop-icon">+</span>
            <strong>Faylni tanlang</strong>
            <small>.txt, .md, .csv, .docx, .pdf | 10 MB gacha</small>
          </label>
          ${error ? `<p class="field-error">${escapeHtml(error)}</p>` : ''}
          <button class="button full" type="submit">AI orqali quiz yaratish</button>
        </form>

        <aside class="tips">
          <h2>Yaxshi natija uchun</h2>
          <ul>
            <li>Savollarni raqam bilan boshlang.</li>
            <li>Variantlarni A), B), C), D) ko‘rinishida yozing.</li>
            <li>Javoblar bor bo‘lsa “Javob: A” tarzida qoldiring.</li>
            <li>Skanerlangan rasmli PDF emas, text o‘qiladigan PDF ishlating.</li>
          </ul>
        </aside>
      </section>
    `
  });
}
