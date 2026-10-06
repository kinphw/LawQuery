import { PrecController } from '../prec/PrecController';

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new PrecController();
  await ctrl.initialize();
});
