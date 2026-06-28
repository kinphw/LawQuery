import { ForeignController } from '../foreign/controllers/ForeignController';

console.log('Foreign Law Entry Point Loaded');

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new ForeignController();
  await ctrl.initialize();
});
