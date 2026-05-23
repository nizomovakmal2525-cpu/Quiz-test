# Quiz Test AI

Foydalanuvchi `.txt`, `.md`, `.csv`, `.docx` yoki `.pdf` fayl yuklaydi. Sayt fayldagi A/B/C/D savollarni AI APIga yuboradi, javoblari bilan quiz yaratadi va barcha ma'lumotlarni PostgreSQLda saqlaydi.

## Ishga tushirish

1. PostgreSQLni ko‘taring:

```powershell
docker compose up -d
```

Docker Postgres tashqi porti `5433`, ichki porti `5432`. Bu Windowsda ishlayotgan boshqa PostgreSQL bilan to‘qnashmasligi uchun shunday qilingan.

2. `.env` faylida AI API kalitni yozing:

```env
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

OpenAI-compatible boshqa provider ishlatsa ham bo‘ladi, faqat `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` qiymatlarini almashtiring.

3. Dependencylar allaqachon o‘rnatilgan. Qayta o‘rnatish kerak bo‘lsa:

```powershell
npm install
```

4. DB schema yaratish:

```powershell
npm run db:setup
```

5. Saytni ishga tushirish:

```powershell
npm run dev
```

Sayt: `http://localhost:3000`

## Render Deploy

Render web service sozlamalari:

```text
Build Command: npm install
Start Command: npm start
```

Environment variables:

```env
DATABASE_URL=postgresql_connection_url
JWT_SECRET=long_random_secret
AI_API_KEY=your_gemini_api_key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.5-flash
AI_MAX_TOKENS=12000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

`docker-compose.yml` faqat local PostgreSQL uchun. Renderda `DATABASE_URL` tashqi PostgreSQL ulanish manziliga teng bo‘lishi kerak.

## Sahifalar

- `/rules` - fayl yuborish qoidalari.
- `/create` - AI orqali fayldan quiz yaratish.
- `/quizzes` - yaratilgan quizlar, Telegram poll uslubidagi test ishlash va urinishlar tarixi.
- `/admin/login` - admin panel.

## Test Ishlash Tartibi

- Quiz ochilganda “Boshlash” ekrani chiqadi.
- Boshlash bosilgach 5 dan 1 gacha teskari sanoq bo‘ladi va “Ketdik” yozuvi chiqadi.
- Har savol uchun 30 sekund beriladi.
- Javob belgilanmasa, to‘g‘ri javob ko‘rsatiladi va keyingi savolga o‘tadi.
- Har urinishda savollar ham, A/B/C/D variantlar joyi ham random aralashtiriladi.
- Test tugaganda natija PostgreSQLga alohida attempt sifatida saqlanadi.

## Admin

Default admin:

```text
login: admin
password: admin123
```

Admin panelda umumiy statistika, foydalanuvchilar, quizlar va o‘chirish amallari bor. Parolni productionda `.env` orqali almashtiring.

## Test fayl

Sinab ko‘rish uchun:

```text
samples/mta-example.txt
```
