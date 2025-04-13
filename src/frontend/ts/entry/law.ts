import { LawController } from '../law/controllers/LawController';

console.log("Law Entry Point Loaded");

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new LawController();
  await ctrl.initialize();
});
