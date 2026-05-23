import { config } from '../config.js';

export async function generateQuizFromText({ text, fileName }) {
  if (!config.ai.apiKey) {
    throw new Error('AI_API_KEY .env faylida sozlanmagan.');
  }

  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`
    },
    body: JSON.stringify({
      model: config.ai.model,
      temperature: 0.1,
      max_tokens: config.ai.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Siz test savollarini aniq JSON formatga aylantiradigan yordamchisiz.',
            'Matnda mavjud barcha A/B/C/D variantli savollarni ajrating.',
            "Agar matnda to'g'ri javob ko'rsatilgan bo'lsa, aynan shuni oling.",
            "Agar javob belgilanmagan bo'lsa, savol va variantlardan eng ehtimoliy javobni aniqlang.",
            'Faqat JSON qaytaring. Markdown, izoh yoki ortiqcha matn qaytarmang.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Fayl nomi: ${fileName}`,
            '',
            'Quyidagi matndan quiz tuzing. JSON sxemasi:',
            '{',
            '  "title": "qisqa quiz nomi",',
            '  "questions": [',
            '    {',
            '      "question": "savol matni",',
            '      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},',
            '      "correctOption": "A",',
            '      "explanation": "1-2 gapli qisqa izoh"',
            '    }',
            '  ]',
            '}',
            '',
            'Talablar:',
            '- Savollar sonini kamaytirmang.',
            "- Variantlar A, B, C, D bo'lishi shart.",
            "- correctOption faqat A, B, C yoki D bo'lsin.",
            "- Matnda savollar tartibi qanday bo'lsa, JSONda ham shu tartibda bering.",
            '',
            'MATN:',
            text.slice(0, 110000)
          ].join('\n')
        }
      ]
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

  return normalizeQuizJson(content, fileName);
}

function normalizeQuizJson(rawContent, fileName) {
  const parsed = safeParseJson(rawContent);
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

function safeParseJson(rawContent) {
  const content = String(rawContent).trim();

  try {
    return JSON.parse(content);
  } catch (_error) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced);
    }

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }

    throw _error;
  }
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

  if (!question || !optionA || !optionB || !optionC || !optionD || !['A', 'B', 'C', 'D'].includes(correctOption)) {
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function createTitle(fileName) {
  return String(fileName || 'Yangi quiz')
    .replace(/\.[^.]+$/, '')
    .replaceAll('_', ' ')
    .trim() || 'Yangi quiz';
}
