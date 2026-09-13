/**
 * 로컬판 인증 스텁 — auth/middleware/authGuard 를 대체한다(webpack 치환).
 *
 * 로컬 추출본은 폐쇄망에 통째로 전달되는 오프라인 사본이므로 회원 개념이 없다 — 전량 개방.
 * 원본 authGuard 는 jsonwebtoken·bcrypt 등 Node 전용 모듈에 의존하므로,
 * 그것이 브라우저 번들에 끌려오지 않게 막는 역할도 겸한다.
 */

/** 로컬판에서 항상 부여되는 가상 회원. */
export const LOCAL_MEMBER = {
  id: 0,
  email: 'local@offline',
  name: '로컬 사용자',
  role: 'admin' as const,
  status: 'approved' as const,
};

type AnyReq = { member?: typeof LOCAL_MEMBER };
type Next = () => void;

// 로컬 라우터는 미들웨어 체인을 쓰지 않지만, 원본과 export 형태를 맞춰 둔다
// (혹시 import 되더라도 무해하게 통과시킨다).
export async function authGuard(req: AnyReq, _res: unknown, next: Next): Promise<void> {
  req.member = LOCAL_MEMBER;
  next();
}

export async function adminGuard(req: AnyReq, _res: unknown, next: Next): Promise<void> {
  req.member = LOCAL_MEMBER;
  next();
}
