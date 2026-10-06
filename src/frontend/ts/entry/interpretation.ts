import '../press/publicPath'; // ⚠️ 첫 줄 — 원문 보기의 pdf.js 워커 주소가 여기서 정해진다
import { SearchController } from '../interpretation/controllers/SearchController';

console.log("Interpretation Entry Point Loaded");

document.addEventListener('DOMContentLoaded', async () => {
  const ctrl = new SearchController();
  await ctrl.initialize();
});
