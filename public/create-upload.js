const form = document.getElementById('create-quiz-form');
const input = document.getElementById('quiz-file-input');
const selected = document.getElementById('selected-file');
const selectedName = document.getElementById('selected-file-name');
const selectedMeta = document.getElementById('selected-file-meta');
const uploadFlow = document.getElementById('upload-flow');
const submit = document.getElementById('create-submit');

if (form && input && selected && selectedName && selectedMeta && uploadFlow && submit) {
  input.addEventListener('change', () => {
    const file = input.files?.[0];

    if (!file) {
      selected.classList.add('hidden');
      return;
    }

    selectedName.textContent = file.name;
    selectedMeta.textContent = `${formatBytes(file.size)} | ${file.type || 'unknown type'}`;
    uploadFlow.textContent = 'Fayl tanlandi. Endi “AI orqali quiz yaratish” tugmasini bosing.';
    selected.classList.remove('hidden');
    submit.disabled = false;
  });

  form.addEventListener('submit', () => {
    const file = input.files?.[0];
    if (!file) return;

    submit.disabled = true;
    submit.textContent = 'AI faylni o‘qiyapti...';
    uploadFlow.textContent = 'Fayl serverga yuborildi. AI faylni sayt tushunadigan JSON formatga aylantiryapti, sayt esa shu JSONdan quiz yaratadi.';
    selected.classList.add('is-processing');
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
