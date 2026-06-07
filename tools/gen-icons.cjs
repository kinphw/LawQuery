/**
 * 앱/PWA 아이콘 생성 (LawQuery 배지 소스 기준).
 *  - 소스: 투명 배경 + 중앙에 파란 라운드 배지(법봉/저울/LawQuery/책)
 *  - any(192/512): 투명 여백 트림 후 정사각 꽉 채움(라운드 코너는 투명 유지)
 *  - maskable(512): 파랑 풀블리드 배경 + 콘텐츠 중앙 ~82%(런처 마스킹 안전영역)
 *
 * 실행: npm i --no-save sharp && node tools/gen-icons.cjs
 */
const sharp = require('sharp');
const SRC = 'assets/img/app-icon-src.png';
const OUT = 'assets/icons';
const BLUE = { r: 0, g: 52, b: 136 }; // 배지 파랑(center 샘플)

(async () => {
  // 1) 투명 여백 제거 → 배지만
  const trimmed = await sharp(SRC).trim().png().toBuffer();

  // 2) any: 배지를 정사각에 꽉(아주 약간의 투명 레터박스만, 코너 투명)
  const anyIcon = (size) =>
    sharp(trimmed).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();
  await anyIcon(512).toFile(`${OUT}/icon-512.png`);
  await anyIcon(192).toFile(`${OUT}/icon-192.png`);

  // 3) maskable: 파랑 풀블리드 + 콘텐츠 82% 중앙
  const inner = Math.round(512 * 0.82);
  const fg = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BLUE } })
    .composite([{ input: fg, gravity: 'centre' }])
    .png().toFile(`${OUT}/icon-maskable-512.png`);

  console.log('icons generated from', SRC);
})().catch((e) => { console.error(e); process.exit(1); });
