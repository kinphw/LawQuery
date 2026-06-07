/**
 * 앱/PWA 아이콘 생성: 가로 펭귄 사진을 정사각형으로 중앙 크롭(cover)해 꽉 채운다.
 * (레터박스 여백 제거 + 좌우 워터마크 일부 크롭)
 *
 * 실행: npm i --no-save sharp && node tools/gen-icons.cjs
 * 원본 교체 시 SRC만 바꾸면 됨.
 */
const sharp = require('sharp');
const SRC = 'assets/img/penguin.PNG';
const OUT = 'assets/icons';

(async () => {
  const cover = (size) =>
    sharp(SRC).resize(size, size, { fit: 'cover', position: 'centre' }).png();

  await cover(512).toFile(`${OUT}/icon-512.png`);
  await cover(192).toFile(`${OUT}/icon-192.png`);
  // maskable: 런처가 가장자리를 마스킹하므로 펭귄 얼굴이 중앙에 오도록 동일 cover
  await cover(512).toFile(`${OUT}/icon-maskable-512.png`);
  console.log('icons generated (cover, centre):', `${OUT}/icon-{192,512,maskable-512}.png`);
})().catch((e) => { console.error(e); process.exit(1); });
