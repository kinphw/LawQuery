import { PsdTransitionController } from '../foreign-transition/controllers/PsdTransitionController';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.addEventListener('DOMContentLoaded', async () => {
  await new PsdTransitionController().initialize();
});
