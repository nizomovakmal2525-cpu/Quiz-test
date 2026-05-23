export function parseStructuredQuiz(text, fileName = 'Yangi quiz') {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const questions = [];
  let current = null;
  let lastOption = '';

  for (const line of lines) {
    const answer = parseAnswerLine(line);
    if (answer && current) {
      current.correctOption = answer;
      continue;
    }

    const option = parseOptionLine(line);
    if (option) {
      if (!current) {
        current = createQuestion('');
      }

      current.options[option.key] = appendText(current.options[option.key], option.text);
      lastOption = option.key;
      continue;
    }

    const question = parseQuestionLine(line);
    if (question) {
      if (isUsableQuestion(current)) {
        questions.push(current);
      }

      current = createQuestion(question);
      lastOption = '';
      continue;
    }

    if (!current) {
      current = createQuestion(line);
      continue;
    }

    if (lastOption && !looksLikeQuestion(line)) {
      current.options[lastOption] = appendText(current.options[lastOption], line);
    } else if (!Object.values(current.options).some(Boolean)) {
      current.question = appendText(current.question, line);
    }
  }

  if (isUsableQuestion(current)) {
    questions.push(current);
  }

  return {
    title: createTitle(fileName),
    questions: questions.map((question, index) => ({
      idx: index + 1,
      question: cleanText(question.question),
      optionA: cleanText(question.options.A),
      optionB: cleanText(question.options.B),
      optionC: cleanText(question.options.C),
      optionD: cleanText(question.options.D),
      correctOption: question.correctOption || '',
      explanation: question.correctOption ? 'Fayldagi javob asosida olindi.' : ''
    }))
  };
}

function createQuestion(question) {
  return {
    question,
    options: { A: '', B: '', C: '', D: '' },
    correctOption: ''
  };
}

function parseQuestionLine(line) {
  const match = line.match(/^(?:savol\s*)?(\d{1,4})\s*[\).:\-]\s*(.+)$/i);
  if (!match) return '';
  const text = match[2].trim();
  return text && !parseOptionLine(text) ? text : '';
}

function parseOptionLine(line) {
  const match = line.match(/^([ABCD])\s*[\).:\-]\s*(.+)$/i);
  if (!match) return null;
  return {
    key: match[1].toUpperCase(),
    text: match[2].trim()
  };
}

function parseAnswerLine(line) {
  const match = line.match(/^(?:javob|to['‘’`]?g['‘’`]?ri\s+javob|answer|correct(?:\s+answer)?)\s*[:\-]?\s*([ABCD])\b/i);
  if (!match) return '';
  return match[1].toUpperCase();
}

function isUsableQuestion(question) {
  if (!question) return false;
  return cleanText(question.question) &&
    cleanText(question.options.A) &&
    cleanText(question.options.B) &&
    cleanText(question.options.C) &&
    cleanText(question.options.D);
}

function looksLikeQuestion(line) {
  return /^(?:savol\s*)?\d{1,4}\s*[\).:\-]/i.test(line);
}

function appendText(previous, next) {
  return [previous, next].filter(Boolean).join(' ').trim();
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
