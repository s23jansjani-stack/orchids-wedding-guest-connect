function renderEmpty(container) {
  container.innerHTML = '<div class="empty">Vēl nav neviena pieteikuma.</div>';
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderGuests(container, guests) {
  let index = 0;
  let startX = null;

  container.innerHTML = `
    <section class="carousel guest-carousel" id="guest-carousel" aria-label="Viesu profils">
      <div class="track" id="guest-track"></div>
    </section>
    <div class="dots" id="guest-dots" aria-hidden="true"></div>
  `;

  const track = container.querySelector('#guest-track');
  const dotsRoot = container.querySelector('#guest-dots');

  guests.forEach((guest, i) => {
    const safeName = escapeHtml(guest.name);
    const safeBio = escapeHtml(guest.bio);
    const safeAnswer = escapeHtml(guest.questionnaire_answers);
    const slide = document.createElement('article');
    slide.className = 'slide';
    slide.innerHTML = `
      <div class="guest-card">
        <img class="guest-photo" src="${guest.image_url}" alt="${safeName}" loading="lazy" />
        <div class="guest-content">
          <h2 class="guest-name">${safeName}</h2>
          <p class="guest-text">${safeBio}</p>
          <p class="guest-text"><strong>Visvairāk gaida:</strong> ${safeAnswer}</p>
        </div>
      </div>
    `;
    track.appendChild(slide);

    const dot = document.createElement('span');
    dot.className = i === 0 ? 'dot active' : 'dot';
    dotsRoot.appendChild(dot);
  });

  const carousel = container.querySelector('#guest-carousel');
  const dots = [...dotsRoot.querySelectorAll('.dot')];

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  carousel.addEventListener('touchstart', (e) => {
    startX = e.changedTouches[0].clientX;
  });

  carousel.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        index = (index + 1) % guests.length;
      } else {
        index = (index - 1 + guests.length) % guests.length;
      }
      render();
    }
    startX = null;
  });
}

async function init() {
  const container = document.querySelector('#guest-content');
  if (!container) return;

  try {
    const response = await fetch('/api/guests');
    if (!response.ok) throw new Error('Failed to load guests');
    const guests = await response.json();

    if (!Array.isArray(guests) || guests.length === 0) {
      renderEmpty(container);
      return;
    }

    renderGuests(container, guests);
  } catch {
    container.innerHTML = '<div class="empty">Neizdevās ielādēt viesu datus.</div>';
  }
}

init();
