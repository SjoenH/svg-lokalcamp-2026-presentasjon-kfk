// SLIDES is defined by slides-list.js, loaded before this script in index.html

async function loadSlides() {
  const container = document.querySelector('.slides');

  for (const slide of SLIDES) {
    try {
      const response = await fetch(`slides/${slide}.html`);
      if (!response.ok) {
        console.error(`Failed to load slide: ${slide}.html`);
        continue;
      }
      const html = await response.text();
      container.insertAdjacentHTML('beforeend', html);
    } catch (error) {
      console.error(`Error loading slide ${slide}.html:`, error);
    }
  }
}

// Load slides when DOM is ready, then initialize Reveal
document.addEventListener('DOMContentLoaded', async () => {
  await loadSlides();
  Reveal.initialize(revealConfig);
});
