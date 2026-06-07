# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**LawQuery** — 전자금융거래법 등 금융법령, 유권해석, 비조치의견서 검색·조회 웹 애플리케이션.
모브랜드(가칭 Kinphw Query) 아래 동등 서비스로 확장 예정: LawQuery + **AccountingQuery**(회계기준·BC, 예정).

### ★ 제품·수익 전략 → [docs/STRATEGY.md](docs/STRATEGY.md) 필독
- **본질은 "검색"이 아니라 "전문가 큐레이션 + 연계뷰"** (검색은 무료여야 함)
- **킬 기능(pro)**: 법령 **5단 연계표**·별표팝업·법령해석검색 / 회계 **기준서↔BC 2단뷰**
- **미끼(free)**: 법령 본문·기준서 본문 조회만
- **게이팅(free/pro)은 지금 구현, 결제(웹 PG)는 활성 100명 검증 후.** plan은 우선 관리자 수동 부여
- 가격: 월 4,900 → 7,900~9,900 (1,000원은 폐기). 미래 핵심 수익 = **팀 라이선스(B2B)**
- 결제는 넷플릭스식(앱=뷰어, 웹에서 PG). member.plan ENUM(free/pro) 이미 추가됨

### 약어 규칙 (도메인 핵심)
| 용어 | 영어 | 약자 | DB명 |
|------|------|------|------|
| 법 | Act | A | `id_a` |
| 시행령 | Enforcement Decree | E | `id_e` |
| 감독규정 | Supervisory Regulation | S | `id_s` |
| 감독규정시행세칙 | Supervisory Rules | R | `id_r` |
| 유권해석 | Interpretation | I | — |

URL 파라미터 `law`의 값: `j` = 전자금융거래법(ldb_j DB), `y` = 여신전문금융업법(ldb_y DB)

## 개발 명령어

```bash
# 개발 (프론트 webpack-dev-server + 백엔드 ts-node-dev + 타입체크 동시 실행)
npm run dev:full

# 프론트엔드만 webpack watch + 백엔드 (빠른 개발)
npm run dev:fast

# 타입체크만
npm run typecheck:watch

# 프로덕션 배포 (git pull → tsc → webpack → scss → pm2 restart)
./deploy.sh
```

**포트**: 프론트엔드 webpack-dev-server → 3000, 백엔드 Express → 4000
`/api/*` 요청은 webpack-dev-server가 4000번으로 프록시함.

**DB**: MySQL, `.env`에서 자격증명 관리 (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_PORT)

## 아키텍처

### 전체 구조

```
프론트엔드 (브라우저)               백엔드 (Node.js/Express)       DB
index.html(법령=시작화면)    ──→   /api/law/*     ──→   ldb_j / ldb_y (MySQL)
interpretation.html(유권해석) ──→   /api/interpretation/*  ──→   ldb_i (MySQL)
```

> **시작화면 = 법령(index.html).** 무료 본문이 미끼이므로 루트(`/`)·앱 start_url·로그인 후 모두 법령으로 진입. 유권해석은 `interpretation.html`(PRO 전용). `index.html`은 `law.bundle.js`, `interpretation.html`은 `interpretation.bundle.js`를 로드.

빌드 결과물: `dist/law.bundle.js`, `dist/interpretation.bundle.js`
프론트엔드 진입점: `src/frontend/ts/entry/law.ts`, `src/frontend/ts/entry/interpretation.ts`

### 백엔드 레이어 (src/backend/ts/)

```
index.ts                  Express 앱, 포트 4000
handlers/LawHandler.ts    라우터 등록 (/api/law/*)
handlers/InterpretationHandler.ts

law/controllers/BaseLawController.ts  URL 파라미터 'law' → DB명 매핑 (j→ldb_j, y→ldb_y)
law/controllers/LawController.ts      GET /all, /get, /getTitles, /article
law/controllers/PenaltyController.ts  GET /penalty, /penaltyIds
law/controllers/ReferenceController.ts GET /reference, /referenceIds
law/controllers/AnnexController.ts    GET /annex, /annexIds

law/models/LawBaseModel.ts           DB 기본값 ldb_j 설정
common/DbContext.ts                  MySQL 연결 풀, 싱글톤 패턴 (DB명 별 인스턴스)
law/utils/TreeConverter.ts           flat DB rows → 5단계 LawTreeNode 트리 변환
```

**트리 구조**: DB의 flat row를 `toLawTree()`로 변환. 중간 단계가 없으면 `isVirtual: true` 가상 노드 생성.
5단계: 법(A) → 시행령(E) → 감독규정(S) → 시행세칙(R) → 별표(B)

### 프론트엔드 레이어 (src/frontend/ts/)

MVC 패턴 적용:

```
law/
  controllers/LawController.ts       메인 컨트롤러, 모델/뷰/이벤트매니저 조합
  controllers/data/LawDataManager.ts 현재 조회결과·법령목록·벌칙/참조/별표 ID 저장
  controllers/event/               이벤트매니저 (ILawEventManager 인터페이스 구현)
    LawHeaderEventManager.ts
    LawSearchEventManager.ts
    LawTextSearchEventManager.ts
    LawTextSizeEventManager.ts
    penalty/LawPenaltyEventManager.ts
    reference/LawReferenceEventManager.ts
    annex/LawAnnexEventManager.ts
  models/LawFetch*.ts               각 API 엔드포인트별 fetch 모델
  views/LawView.ts                  Header + LawTable + LawCheckbox 조합
  util/ApiUrlBuilder.ts             URL 파라미터(law, step) 자동 첨부

interpretation/
  controllers/SearchController.ts
  controllers/data/SearchDataManager.ts
  controllers/event/SearchEventManager.ts
  models/SearchModel.ts
  views/SearchView.ts
```

**ApiUrlBuilder**: 모든 API fetch 호출 시 현재 URL의 `law`, `step` 파라미터를 자동으로 붙여 보냄.
**이벤트매니저 패턴**: `bindEvents()` (초기화 시 1회) + `bindArticleEvents()` / `bindPostRenderEvents()` (동적 렌더링 후)

### 타입 공유

백엔드와 프론트엔드에 동일한 타입 파일이 각각 존재:
- `src/backend/ts/law/types/` ↔ `src/frontend/ts/law/types/`
(LawTreeNode, LawResult, LawAnnex, LawPenalty, LawTitle)

### 프로덕션 배포

```bash
npx tsc -p tsconfig.backend.json  # 백엔드: src/backend/js/ 로 컴파일
npm run build                      # 프론트: dist/ 로 번들링
npx pm2 restart lawquery-backend-prod  # PM2로 관리
```
