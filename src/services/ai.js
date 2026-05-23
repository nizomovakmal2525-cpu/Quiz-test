import { config } from '../config.js';
import { parseStructuredQuiz } from './quiz-parser.js';

export async function generateQuizFromContent({ content, fileName }) {
  if (content.kind === 'image') {
    return generateQuizFromImage({ content, fileName });
  }

  const parsed = parseStructuredQuiz(content.text, fileName);
  if (parsed.questions.length > 0) {
    const hasAllAnswers = parsed.questions.every((question) => isOption(question.correctOption));
    if (hasAllAnswers) return parsed;
    return completeMissingAnswersWithAi(parsed, fileName);
  }

  return generateQuizFromText({ text: content.text, fileName });
}

export async function generateQuizFromText({ text, fileName }) {
  assertAiConfigured();
  const chunks = splitTextIntoChunks(text, 12000);
  const allQuestions = [];
  let title = createTitle(fileName);

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const chunkQuiz = await generateQuizFromTextChunk({
      text: chunk,
      fileName,
      chunkIndex,
      totalChunks: chunks.length
    });

    if (chunkQuiz.title && chunkIndex === 0) title = chunkQuiz.title;
    allQuestions.push(...chunkQuiz.questions);
  }

  if (allQuestions.length === 0) {
    throw new Error('AI savollarni topa olmadi. Fayl ichida savollar va A/B/C/D variantlar aniq ko‘rinishini tekshiring.');
  }

  return {
    title,
    questions: allQuestions.map((question, index) => ({ ...question, idx: index + 1 }))
  };
}

async function generateQuizFromTextChunk({ text, fileName, chunkIndex, totalChunks }) {
  assertAiConfigured();

  const content = await chatCompletion([
    {
      role: 'system',
      content: [
        'Siz sayt uchun fayl mazmunini mashina o‘qiydigan quiz JSON formatiga aylantiradigan parser/converter yordamchisiz.',
        'Fayldagi savollarni bittalab ajrating va sayt tushunadigan schema bo‘yicha qaytaring.',
        "Agar matnda to'g'ri javob ko'rsatilgan bo'lsa, aynan shuni oling.",
        "Agar javob belgilanmagan bo'lsa, savol va variantlardan eng ehtimoliy javobni aniqlang.",
        'Hech qachon oddiy izoh yozmang; faqat JSON object qaytaring.',
        'Faqat valid JSON qaytaring. Markdown, izoh yoki ortiqcha matn qaytarmang.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Fayl nomi: ${fileName}`,
        `Qism: ${chunkIndex + 1}/${totalChunks}`,
        '',
        'Quyidagi matn qismidan faqat shu qismda to‘liq ko‘rinayotgan quiz savollarini tuzing. JSON sxemasi:',
        '{"title":"qisqa quiz nomi","questions":[{"question":"savol matni","options":{"A":"...","B":"...","C":"...","D":"..."},"correctOption":"A","explanation":"qisqa izoh"}]}',
        '',
        'Talablar:',
        '- Savollar sonini kamaytirmang.',
        "- Variantlar A, B, C, D bo'lishi shart.",
        "- correctOption faqat A, B, C yoki D bo'lsin.",
        "- Matnda savollar tartibi qanday bo'lsa, JSONda ham shu tartibda bering.",
        '',
        'MATN:',
        text
      ].join('\n')
    }
  ]);

  return normalizeQuizJsonWithRepair(content, fileName);
}

async function completeMissingAnswersWithAi(quiz, fileName) {
  assertAiConfigured();

  const answerPayload = quiz.questions.map((question) => ({
    idx: question.idx,
    question: question.question,
    options: {
      A: question.optionA,
      B: question.optionB,
      C: question.optionC,
      D: question.optionD
    },
    knownCorrectOption: isOption(question.correctOption) ? question.correctOption : null
  }));

  const answerMap = new Map();
  const batches = chunkArray(answerPayload, 10);

  for (const batch of batches) {
    const content = await chatCompletion([
      {
        role: 'system',
        content: 'Siz test javoblarini aniqlaysiz. Faqat valid JSON qaytaring.'
      },
      {
        role: 'user',
        content: [
          `Fayl nomi: ${fileName}`,
          'Quyidagi savollar uchun correctOption va qisqa explanation qaytaring.',
          'JSON sxema: {"answers":[{"idx":1,"correctOption":"A","explanation":"qisqa izoh"}]}',
          JSON.stringify(batch)
        ].join('\n')
      }
    ], Math.min(config.ai.maxTokens, 4000));

    const parsed = await parseJsonWithRepair(content, 'answers');
    for (const answer of Array.isArray(parsed.answers) ? parsed.answers : []) {
      answerMap.set(Number(answer.idx), answer);
    }
  }

  const questions = quiz.questions.map((question) => {
    if (isOption(question.correctOption)) return question;
    const answer = answerMap.get(question.idx);
    const correctOption = cleanText(answer?.correctOption).slice(0, 1).toUpperCase();

    if (!isOption(correctOption)) {
      throw new Error(`${question.idx}-savol uchun to‘g‘ri javobni aniqlab bo‘lmadi.`);
    }

    return {
      ...question,
      correctOption,
      explanation: cleanText(answer?.explanation || 'AI javob variantlarini tahlil qildi.')
    };
  });

  return { title: quiz.title, questions };
}

async function generateQuizFromImage({ content, fileName }) {
  assertAiConfigured();

  const aiContent = await chatCompletion([
    {
      role: 'system',
      content: [
        'Siz sayt uchun rasm ichidagi test savollarini JSONga aylantiradigan parser/converter yordamchisiz.',
        'Savol rasm ichida, javob esa rasm tagidagi matn yoki belgi sifatida berilgan bo‘lishi mumkin.',
        'Rasmdagi barcha ko‘rinadigan yozuv, formulalar, variantlar va javob belgilarini birga tahlil qiling.',
        'Har bir savolni alohida JSON item qilib qaytaring.',
        'Faqat valid JSON qaytaring. Savollar A/B/C/D variantli bo‘lsin.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            `Fayl nomi: ${fileName}`,
            'Rasm ichidagi barcha test savollarini ajrating. Agar savol rasmda, javob esa pastida text qilib yozilgan bo‘lsa, javobni ham aniqlang.',
            'JSON sxema: {"title":"qisqa quiz nomi","questions":[{"question":"savol","options":{"A":"...","B":"...","C":"...","D":"..."},"correctOption":"A","explanation":"qisqa izoh"}]}'
          ].join('\n')
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${content.mimeType};base64,${content.base64}`
          }
        }
      ]
    }
  ]);

  return normalizeQuizJsonWithRepair(aiContent, fileName);
}

async function chatCompletion(messages, maxTokens = config.ai.maxTokens) {
  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify({
      model: config.ai.model,
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API xatosi (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI javobida content topilmadi.');
  }

  return content;
}

async function normalizeQuizJsonWithRepair(rawContent, fileName) {
  const parsed = await parseJsonWithRepair(rawContent, 'questions');
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  const normalizedQuestions = questions
    .map((item, index) => normalizeQuestion(item, index))
    .filter(Boolean);

  if (normalizedQuestions.length === 0) {
    throw new Error('AI savollarni JSON formatda qaytarmadi yoki savollar topilmadi.');
  }

  return {
    title: cleanText(parsed.title) || createTitle(fileName),
    questions: normalizedQuestions
  };
}

async function parseJsonWithRepair(rawContent, expectedKey) {
  try {
    return safeParseJson(rawContent);
  } catch (error) {
    try {
      return safeParseJson(await repairJsonWithAi(rawContent, error.message, expectedKey));
    } catch (_repairError) {
      throw new Error(`AI JSON javobi buzilgan. Qayta urinib ko‘ring yoki faylni kichikroq qismlarga bo‘lib yuboring. Asl xato: ${error.message}`);
    }
  }
}

async function repairJsonWithAi(rawContent, parseError, expectedKey) {
  assertAiConfigured();

  return chatCompletion([
    {
      role: 'system',
      content: 'Siz buzilgan JSONni valid JSONga tuzatasiz. Faqat JSON qaytaring.'
    },
    {
      role: 'user',
      content: [
        `JSON parse xatosi: ${parseError}`,
        `Natijada "${expectedKey}" kaliti bo‘lishi shart.`,
        'Buzilgan JSON:',
        String(rawContent).slice(0, 90000)
      ].join('\n')
    }
  ]);
}

function safeParseJson(rawContent) {
  const content = String(rawContent).trim();

  try {
    return JSON.parse(content);
  } catch (_error) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced);

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }

    throw _error;
  }
}

function splitTextIntoChunks(text, maxChars) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + line + '\n').length > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = '';
    }

    current += `${line}\n`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [''];
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeQuestion(item, index) {
  const question = cleanText(item.question || item.savol || item.prompt);
  const options = item.options || item.answers || item.variantlar || {};
  const optionA = cleanText(options.A || options.a || item.option_a || item.a);
  const optionB = cleanText(options.B || options.b || item.option_b || item.b);
  const optionC = cleanText(options.C || options.c || item.option_c || item.c);
  const optionD = cleanText(options.D || options.d || item.option_d || item.d);
  const correctOption = cleanText(item.correctOption || item.correct_option || item.answer || item.javob)
    .slice(0, 1)
    .toUpperCase();

  if (!question || !optionA || !optionB || !optionC || !optionD || !isOption(correctOption)) {
    return null;
  }

  return {
    idx: index + 1,
    question,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    explanation: cleanText(item.explanation || item.izoh || '')
  };
}

function assertAiConfigured() {
  if (!config.ai.apiKey) {
    throw new Error('AI_API_KEY .env faylida sozlanmagan.');
  }
}

function isOption(value) {
  return ['A', 'B', 'C', 'D'].includes(String(value || '').toUpperCase());
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function createTitle(fileName) {
  return String(fileName || 'Yangi quiz')
    .replace(/\.[^.]+$/, '')
    .replaceAll('_', ' ')
    .trim() || 'Yangi quiz';
}
