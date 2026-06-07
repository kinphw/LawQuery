# 작업 핸드오프 — free/pro 게이팅 (2026-06-06 시점)

> 다음 세션에서 이 문서부터 읽고 이어가기. 전략 배경은 [STRATEGY.md](STRATEGY.md).

## 지금 무엇을 하는 중인가

**무료 베타 출시를 위한 free/pro 기능 게이팅** 구현 중. 2개 커밋으로 분할:
- ✅ **커밋1 (완료, dev, 미배포)**: 백엔드 게이팅 인프라 — 검증 끝남
- ✅ **커밋2 (완료, dev, 미배포)**: 프론트 (단일뷰 + PRO 잠금 UI + auth-gate 비로그인 + 가입폼 + admin plan 토글)

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

## ✅ 커밋2에서 완료된 것 (프론트 + 일부 백엔드)

1. **auth-gate.js 전면 개편** ([auth-gate.js](../auth-gate.js)):
   - 비로그인도 통과(콘텐츠 표시). 미로그인 강제 이동 제거.
   - me 결과를 `window.__lqMePromise`로 노출 → 번들이 plan 분기에 재사용(중복 fetch 방지).
   - 상태바 분기: 로그인(PRO/FREE 뱃지) / 게스트("둘러보는 중" + 가입 CTA).
   - fetch 인터셉터는 **앱(lq_app_token) 401 자동 재진입만** 담당. 웹은 401/403에 강제 이동 안 함(화면별 잠금 UI가 처리).
   - account.html은 자체 me 체크로 보호(기존대로).

2. **법령 프론트**:
   - 공통 [AuthState.ts](../src/frontend/ts/common/AuthState.ts) — `getMe()`/`isPro()`.
   - [LawController](../src/frontend/ts/law/controllers/LawController.ts) `initialize()`에서 me 분기: 비PRO면 [LawUnitView](../src/frontend/ts/law/views/LawUnitView.ts).start()로 단일뷰, PRO면 기존 연계표.
   - [LawUnitView](../src/frontend/ts/law/views/LawUnitView.ts): 단위 선택바(법/시행령/감독규정/세칙, meta 기준 a/e/s/r) → [LawFetchUnitModel](../src/frontend/ts/law/models/LawFetchUnitModel.ts) `/api/law/unit` → 1컬럼 렌더(텍스트검색 필터·하이라이트). 벌칙/별표 버튼·조문별선택조회는 잠금 + 업셀.

3. **유권해석 프론트**: [SearchController](../src/frontend/ts/interpretation/controllers/SearchController.ts) me 분기 → 비PRO면 [SearchView](../src/frontend/ts/interpretation/views/SearchView.ts).renderLock()(폼 비활성화 + PRO 잠금 화면).

4. **SW 캐싱** ([service-worker.js](../service-worker.js)): v3→v4, PROTECTED_PAGES 제거, index/law도 network-first(비로그인 개방).

5. **가입폼** ([login.html](../login.html)): 직군 드롭다운(회계사/세무사/금융회사/회계팀/법무팀/학생/기타) + occupation 전송 + "PRO 베타 무료, 추후 유료" 공지.

6. **관리자 plan 토글**: [admin.html](../admin.html) "등급" 컬럼·버튼(prompt로 free/pro_beta/pro) + 백엔드 [AdminController.setPlan](../src/backend/ts/auth/controllers/AdminController.ts) + [MemberModel.updatePlan](../src/backend/ts/auth/models/MemberModel.ts) + 라우트 `PATCH /api/admin/members/:id/plan`. (Member.plan 타입도 `MemberPlan`으로 정정)

### 커밋2 검증 (백엔드 런타임 + 빌드)
- `tsc -p tsconfig.json`(프론트)·`tsconfig.backend.json` 통과, `npm run build` 번들 성공.
- 런타임: `/law/unit` 200 / 잘못된 origin 400 / `/law/all`·`/interpretation/initial` 비인증 401 / `setPlan` 라우트 401(존재).
- ⚠️ 프론트 **브라우저 시각 검증은 미실시**(빌드/타입만 확인). 배포 전 비회원·PRO 화면 눈으로 확인 권장.

## 추가 작업 (커밋3: PRO 인지 레이어 + 트라이얼 인프라)

- **PRO 인지 레이어**: 연계표 토글 PRO 뱃지 + linked 모드 "베타무료/추후유료" 노트, 유권해석 PRO 노트([SearchView.showProBetaNote](../src/frontend/ts/interpretation/views/SearchView.ts)), 가입 직후 1회 온보딩 모달([auth-gate.js](../auth-gate.js) `maybeShowOnboarding`, login.html이 `lq_onboard_pro` 플래그), 내 계정 등급 표시([account.html](../account.html)). **가격은 비노출(앱 승인 안전선).**
- **관리자 등급 토글**: prompt → 인라인 `<select>`(FREE/PRO베타/PRO 즉시 변경). 관리자 부여는 `plan_expires_at=NULL`로 영구.
- **30일 트라이얼 인프라(지금은 비활성, 출시 때 켬)**: `member.plan_expires_at DATETIME NULL` 추가. `findById`가 `plan_expired` 계산 컬럼(NOW() 비교, TZ안전) 반환 → [effectivePlan](../src/backend/ts/auth/models/MemberModel.ts)이 만료 시 free 취급. proGuard·me 모두 실효 등급 사용. **베타엔 가입 시 expires=NULL(무기한)이라 동작 변화 없음.**
  - ▶ **정식 출시 전환**: [AuthController.register](../src/backend/ts/auth/controllers/AuthController.ts)의 `createWebMember` 8번째 인자로 `now()+30일` 만료시각 전달 한 줄이면 30일 트라이얼 가동.

## 이메일 인증(가입 2단계) — 추가됨

- 가입 = 이메일 기반. register는 `status='pending'` 생성 + 6자리 인증번호 메일 발송 → `/api/auth/verify`(코드 확인) 성공 시 `approved`+자동로그인. `/api/auth/resend`(60초 쿨다운).
- 발송: **Gmail SMTP**([mailer.ts](../src/backend/ts/auth/utils/mailer.ts), nodemailer). `.env`에 `GMAIL_USER`/`GMAIL_APP_PASSWORD`(구글 앱비밀번호) 설정 필요. **미설정 시 dev는 콘솔/응답 `devCode`로 코드 노출**(운영·메일설정 시 미노출).
- 코드: bcrypt 해시 저장, 10분 만료, 시도 5회 제한, 재전송 60초 쿨다운(전부 DB NOW() 기준 → TZ 안전).
- 검증(dev e2e): 잘못된 이메일 400 / 정상 register→pending+devCode / 틀린코드 "남은시도" / 올바른코드→approved+Set-Cookie 확인.

## ⚠️ 운영 배포 시 필요 (다 끝나고)

- 운영 DB ALTER (root/genius):
  - `member.plan` ENUM(`free`,`pro_beta`,`pro`) 확장 + `occupation VARCHAR(30)` 추가
  - `ALTER TABLE member ADD COLUMN plan_expires_at DATETIME NULL AFTER plan;` (로컬 dev 적용 완료)
  - ★ 인증 컬럼: `ALTER TABLE member ADD COLUMN verify_code_hash VARCHAR(255) NULL, ADD COLUMN verify_expires_at DATETIME NULL, ADD COLUMN verify_attempts INT NOT NULL DEFAULT 0, ADD COLUMN verify_sent_at DATETIME NULL;` (로컬 dev 적용 완료)
- **`.env`에 `GMAIL_USER`/`GMAIL_APP_PASSWORD` 설정** (안 하면 인증메일이 안 가서 신규가입 불가) + 운영 `NODE_ENV=production`(devCode 노출 차단)
- deploy 시 **`npm install`**(nodemailer 신규 의존성) 필요 — deploy.sh가 install 안 하면 추가
- main 머지 → deploy.sh
- 기존 운영 회원 plan을 pro_beta로 UPDATE (베타라 다 열어줌). 기존 회원은 이미 approved라 인증 불필요

## 기술 메모

- 법령 테이블: db_a/e/s/r 모두 `seq`(순서)·`id_*`·`content_*`·`content_*_sched`·`sched_date` 구조. db_a만 title_a(제목행) 있음.
- `getAllLaws`는 step 4/5만 쿼리 존재(step 1~3은 빈 쿼리 → 에러). 그래서 무료 단일은 별도 `/unit` API로 처리(연계표 /all은 PRO 전용이라 step 그대로).
- 환경: 로컬 MariaDB 11.6 (root/genius), 운영 192.168.0.7 (db root/genius). dev→main 머지 후 deploy.sh.
- 앱(TWA)은 결제 없는 뷰어. Play 신원확인 완료됨. 출시(.aab 업로드~14일 테스트)는 게이팅 끝나고.
