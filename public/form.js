const form = document.querySelector('#guest-form');
const imageInput = document.querySelector('#image');
const preview = document.querySelector('#preview');
const statusEl = document.querySelector('#status');

if (imageInput && preview) {
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) {
      preview.style.display = 'none';
      preview.removeAttribute('src');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      preview.src = event.target?.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    statusEl.textContent = 'Saglabājam...';
    statusEl.className = 'message';

    const data = new FormData(form);

    try {
      const response = await fetch('/api/guests', {
        method: 'POST',
        body: data,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Neizdevās iesniegt formu.');
      }

      form.reset();
      preview.style.display = 'none';
      preview.removeAttribute('src');
      statusEl.textContent = 'Paldies! Tava informācija ir saglabāta.';
      statusEl.className = 'message success';
      setTimeout(() => {
        window.location.href = '/guest';
      }, 650);
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.className = 'message error';
    }
  });
}
