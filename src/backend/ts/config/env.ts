import dotenv from 'dotenv';
import path from 'path';

/**
 * 환경변수를 "다른 어떤 모듈보다 먼저" 로드한다.
 * index.ts 최상단에서 이 모듈을 가장 먼저 import 해야 한다.
 *
 * 왜 전용 모듈인가:
 *   ES/CommonJS 는 import(require)를 파일 상단부터 순서대로 평가한다. 예전엔 index.ts 본문에서
 *   dotenv.config() 를 호출했는데, 그 시점엔 이미 상단의 handler→…→jwt.ts import 가 모두
 *   평가된 뒤였다. jwt.ts 는 로드 시점에 `process.env.JWT_SECRET` 을 읽어 상수에 담았으므로,
 *   .env 가 아직 로드되지 않아 'dev-secret'(약한 기본값)이 서명키로 쓰였다(누구나 admin 토큰 위조 가능).
 *   → 이 모듈을 최우선 import 하여 그런 "로드 시점 env 읽기" 코드가 실제 .env 값을 보게 한다.
 */
dotenv.config({ path: path.join(process.cwd(), '.env') });

// 운영(production)에서는 JWT_SECRET 이 없거나 약하면 "부팅 자체를 막는다"(안전한 기본값 없음, fail-closed).
// 개발에서는 편의상 jwt.ts 가 'dev-secret' 으로 폴백한다.
if (process.env.NODE_ENV === 'production') {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16 || s === 'dev-secret') {
    throw new Error(
      '[보안] 운영 환경에서 JWT_SECRET(16자 이상, dev-secret 금지)이 필요합니다. .env를 확인하세요.'
    );
  }
}
