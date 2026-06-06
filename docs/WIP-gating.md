# 작업 핸드오프 — free/pro 게이팅 (2026-06-06 시점)

> 다음 세션에서 이 문서부터 읽고 이어가기. 전략 배경은 [STRATEGY.md](STRATEGY.md).

## 지금 무엇을 하는 중인가

**무료 베타 출시를 위한 free/pro 기능 게이팅** 구현 중. 2개 커밋으로 분할:
- ✅ **커밋1 (완료, dev, 미배포)**: 백엔드 게이팅 인프라 — 검증 끝남
- 🔜 **커밋2 (다음 작업)**: 프론트 (단일뷰 + PRO 잠금 UI + auth-gate 비로그인 + 가입폼)

## 핵심 정책 (확정)

"본문은 비로그인 개방(SEO·입소문), 킬 기능에서 가입 유도" (3 AI 만장일치).

| 등급 | 접근 | 기능 |
|---|---|---|
| 비회원 | 로그인 불필요 | **단일 단위 전체 조회**(법/시행령/감독규정/세칙 각각 1단), 메타 |
| 회원 FREE | 가입(자동승인) | 위 + 즐겨찾기(미구현) |
| PRO(베타 무료) | 가입 = plan `pro_beta` 자동 | ★킬: 4/5단 연계표, 벌칙·참조·별표, 유권해석 전체 |

- **베타라 가입자는 전부 `pro_beta`** → 가입하면 다 보임("중독"). 무료 단일뷰는 비회원만 실제로 보게 됨.
- 유료화 시: pro_beta → free/pro 갈라서 잠금 켜기 (구조는 이미 완성).

## ✅ 커밋1에서 완료된 것 (백엔드, 검증됨)

- DB: `member.plan ENUM('free','pro_beta','pro')` + `member.occupation VARCHAR(30)` 칼럼 추가 (로컬 적용됨)
- 가입 시 plan=pro_beta 자동, occupation(직군) 화이트리스트 수집: 회계사/세무사/금융회사/회계팀/법무팀/학생/기타
- 게이트 미들웨어 [authGuard.ts](../src/backend/ts/auth/middleware/authGuard.ts):
  - `optionalAuth` (비회원 통과, 로그인 시 req.member 부착)
  - `proGuard` (pro_beta/pro만, 아니면 403 code=PRO_REQUIRED / 비로그인 401)
  - `isPro(plan)` 헬퍼
  - req.member에 plan 포함
- 엔드포인트 분류 [LawHandler.ts](../src/backend/ts/handlers/LawHandler.ts):
  - **무료(optionalAuth)**: `/law/unit`(신규), `/law/article`, `/law/meta`, `/law/getTitles`, `/law/*Ids`
  - **PRO(proGuard)**: `/law/all`·`/law/get`(연계표), `/law/penalty`·`/reference`·`/annex`, `/interpretation/*`(통째)
- 신규 API: `GET /api/law/unit?law=j&origin=s` → 단일 단위(a/e/s/r) 전체 조문 seq 순. [LawModel.getSingleUnit](../src/backend/ts/law/models/LawModel.ts), [LawController.getUnit](../src/backend/ts/law/controllers/LawController.ts)
- index.ts: 전역 authGuard 제거(핸들러 내부 게이트로 이동)
- me 응답에 plan 포함, admin 회원목록에 plan 포함
- **검증 통과**: 비회원 /unit 200(감독규정 123조), 비회원 /all 401차단, pro_beta /all·유권해석 200, occupation 저장 확인

## 🔜 커밋2에서 할 일 (프론트 — 미착수)

1. **auth-gate.js 전면 개편** ([auth-gate.js](../auth-gate.js)):
   - 현재: 미로그인 즉시 login.html로 강제(전체 로그인 벽)
   - 변경: **비로그인도 통과**(콘텐츠 표시), 보호 API가 401/403(PRO_REQUIRED) 줄 때만 처리
   - PRO_REQUIRED(403) → 로그인으로 보내지 말고 "PRO 안내/잠금" 처리(비회원은 가입 유도)
   - ⚠️ account.html·admin.html은 여전히 로그인 필요 — 이들은 자체 me 체크함

2. **법령 프론트** (src/frontend/ts/law/):
   - 무료/비회원: "단위 선택"(법/시행령/감독규정/세칙) → `/api/law/unit` 호출 → 1컬럼 단일뷰
   - PRO: 기존 연계표(`/all`,`/get`) 그대로
   - me.plan 보고 분기. 비PRO에겐 5단표·벌칙·참조·별표 버튼에 **PRO 뱃지 + 잠금**
   - 현재 LawController([src/frontend/ts/law/controllers/LawController.ts](../src/frontend/ts/law/controllers/LawController.ts))는 처음부터 /all?step=4 호출 → 비PRO면 이게 401 남. 분기 필요.

3. **유권해석 프론트**: 비PRO면 "PRO 전용" 잠금 화면.

4. **SW 캐싱** ([service-worker.js](../service-worker.js)): 지금 index/law를 "미로그인 차단" 전제로 둠 → 비로그인 허용에 맞게 재조정.

5. **가입폼** ([login.html](../login.html)): 직군 드롭다운(회계사/세무사/금융회사/회계팀/법무팀/학생/기타) 추가, register에 occupation 전송. "PRO 기능 베타 무료, 추후 유료화 예정" 공지.

6. **관리자**: 회원 plan free↔pro_beta↔pro 토글 버튼(수동 부여용) — admin.html.

7. 통합 테스트 + 커밋2.

## ⚠️ 운영 배포 시 필요 (커밋1+2 다 끝나고)

- 운영 DB ALTER (root/genius): `member.plan ENUM` 확장 + `occupation` 칼럼 추가
- main 머지 → deploy.sh
- 기존 운영 회원 plan을 pro_beta로 UPDATE (베타라 다 열어줌)

## 기술 메모

- 법령 테이블: db_a/e/s/r 모두 `seq`(순서)·`id_*`·`content_*`·`content_*_sched`·`sched_date` 구조. db_a만 title_a(제목행) 있음.
- `getAllLaws`는 step 4/5만 쿼리 존재(step 1~3은 빈 쿼리 → 에러). 그래서 무료 단일은 별도 `/unit` API로 처리(연계표 /all은 PRO 전용이라 step 그대로).
- 환경: 로컬 MariaDB 11.6 (root/genius), 운영 192.168.0.7 (db root/genius). dev→main 머지 후 deploy.sh.
- 앱(TWA)은 결제 없는 뷰어. Play 신원확인 완료됨. 출시(.aab 업로드~14일 테스트)는 게이팅 끝나고.
