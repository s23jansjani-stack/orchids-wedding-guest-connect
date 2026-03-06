function makeSwipeCarousel(root, dotsRoot) {
  const track = root.querySelector('.track');
  const slides = [...root.querySelectorAll('.slide')];
  let index = 0;
  let startX = null;

  if (!slides.length) return;

  slides.forEach((_slide, i) => {
    const dot = document.createElement('span');
    dot.className = i === 0 ? 'dot active' : 'dot';
    dotsRoot.appendChild(dot);
  });

  const dots = [...dotsRoot.querySelectorAll('.dot')];

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  }

  function goNext() {
    index = (index + 1) % slides.length;
    render();
  }

  root.addEventListener('touchstart', (e) => {
    startX = e.changedTouches[0].clientX;
  });

  root.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        index = (index + 1) % slides.length;
      } else {
        index = (index - 1 + slides.length) % slides.length;
      }
      render();
    }
    startX = null;
  });

  setInterval(goNext, 5000);
}

const landingCarousel = document.querySelector('#landing-carousel');
const landingDots = document.querySelector('#landing-dots');
if (landingCarousel && landingDots) {
  makeSwipeCarousel(landingCarousel, landingDots);
}
