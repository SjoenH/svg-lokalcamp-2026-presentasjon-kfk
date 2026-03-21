// Array of slide files in presentation order
const slides = [
  '00-title',
  '01a-om-oss',
  '01-customer-intro',
  '01c-fjor-vs-naa',
  '02a-storkunde',
  '02b-landbruk',
  '03a-container-debate',
  '03b-architecture',
  '04-framework',
  '05a-philosophy',
  '05b-forbidden',
  '05c-refactor-claude',
  '05d-henry-scripts',
  '05e-kfk-start',
  '05f-ahmed-pr-queue',
  '05g-setup-script',
  '05h-ahmed-manual',
  '05i-aurelie',
  '06a-pappaperm',
  '06b-frontend-better',
  '06c-fastest-fingers',
  '06d-growth',
  '07-meaning',
  '08-closing'
];

/**
 * Loads all slides dynamically from the /slides/ directory
 * and inserts them into the .slides container
 */
async function loadSlides() {
  const container = document.querySelector('.slides');

  for (const slide of slides) {
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
