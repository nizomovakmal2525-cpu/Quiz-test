CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id UUID REFERENCES uploaded_files(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  question_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quiz_id, idx)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  displayed_idx INTEGER,
  selected_option CHAR(1),
  selected_display_option CHAR(1),
  correct_display_option CHAR(1),
  option_order TEXT,
  timed_out BOOLEAN NOT NULL DEFAULT FALSE,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS displayed_idx INTEGER;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS selected_display_option CHAR(1);
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS correct_display_option CHAR(1);
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS option_order TEXT;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS timed_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quiz_attempt_answers ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz ON quiz_attempts(user_id, quiz_id);
