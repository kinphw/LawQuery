import { SearchController } from '../interpretation/controllers/SearchController';

console.log("Interpretation Entry Point Loaded");

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new SearchController();
  await ctrl.initialize();
});
