import { LawController } from '../law/controllers/LawController.js';

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new LawController();
  await ctrl.initialize();
});
