import '../press/publicPath'; // ⚠️ 첫 줄 — pdf.js 워커 주소가 여기서 정해진다
import { PressController } from '../press/PressController';

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new PressController();
  await ctrl.initialize();
});
