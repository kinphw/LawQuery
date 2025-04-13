import { SearchController } from '../interpretation/controllers/SearchController.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new SearchController();
  await ctrl.initialize();
});
