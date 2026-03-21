// Single source of truth for slide order.
// Add, remove, or rename entries here — both dev (browser) and build (Node) pick this up.
const SLIDES = [
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
  '08-closing',
  '10-audience-stats',
];

// Allow require() in Node (build.js)
if (typeof module !== 'undefined') module.exports = SLIDES;
