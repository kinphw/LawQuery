# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**LawQuery** — 전자금융거래법 등 금융법령, 유권해석, 비조치의견서 검색·조회 웹 애플리케이션.
모브랜드(가칭 Kinphw Query) 아래 동등 서비스로 확장 예정: LawQuery + **AccountingQuery**(회계기준·BC, 예정).

### ★ 유료화·등급 철폐 / 1인 사용 체제 (2026-09-01)
- **유료화 계획 폐기.** free/pro 등급, 결제, 티저·업셀 UI는 코드에서 전부 제거했다. 되살리지 말 것.
- **비로그인은 아무것도 못 본다.** `index.ts` 가 `/api` 전체에 `authGuard` 를 한 번 걸고,
  `auth-gate.js` 가 미로그인 방문자를 `login.html` 로 보낸다. 개별 라우터엔 게이트를 붙이지 않는다
  (붙이면 요청당 회원 조회가 중복된다). 관리자 전용 라우트만 `adminGuard`.
- **로그인은 유지한다** — 접근 기록(`access_log`)과 관리자 화면 보호가 로그인에 매달려 있기 때문.
  방문 기록은 비로그인도 남는다(`POST /api/auth/visit`).
- 기능 구분은 이제 **회원 / 관리자** 둘뿐이다.

### 약어 규칙 (도메인 핵심)
| 용어 | 영어 | 약자 | DB명 |
|------|------|------|------|
| 법 | Act | A | `id_a` |
| 시행령 | Enforcement Decree | E | `id_e` |
| 감독규정 | Supervisory Regulation | S | `id_s` |
| 감독규정시행세칙 | Supervisory Rules | R | `id_r` |
| 유권해석 | Interpretation | I | — |

URL 파라미터 `law`의 값: `j` = 전자금융거래법(ldb_j DB), `y` = 여신전문금융업법(ldb_y DB)

## ★ 형제 프로젝트 (c:\projects\LawQuery*) — 한 가족, 저장소는 분리

이 웹앱은 **5개 프로젝트 가족의 서비스 계층**이다. 각각 **별도 git 저장소**이고 배포 수명주기가
달라 모노레포로 합치지 않는다(웹앱=서버배포 / law·sqlhandler=로컬 도구 / twa=안드로이드 빌드).
**필요하면 이 세션에서 형제 디렉토리를 직접 읽고·고치고·커밋해도 된다**(경로만 절대경로로).
`LawQuery.code-workspace` 는 이 묶음의 VS Code 정의.

| 경로 | 역할 | 저장소 | 비고 |
|---|---|---|---|
| `LawQuery` | **웹앱**(이 저장소) — Express(4000)+webpack, 운영배포 | `kinphw/LawQuery` | dev→main→`deploy.sh` |
| `LawQuery-law` | **법령 적재** 파이프라인 + GUI 편집기 + 허브(`Dashboard.pyw`) | `kinphw/LawQuery-law` | 자체 CLAUDE.md 있음(필독). 해외법령 ETL(`foreign/etl`)·dev→prod 복제(`common/replicate*.py`) 소유 |
| `LawQuery-frc` | **FRCrawler** — 금융법령해석·민원 웹크롤러 | `kinphw/FRCrawler` | 유닛: `late`(최근해석)·`past`(과거해석)·`integ`(금융민원). **MySQL 직접 적재 안 함 → Excel/Pickle 산출** |
| `LawQuery-sqlhandler` | **MySQL Data Handler** — MySQL ↔ Excel/Pickle import/export GUI | `kinphw/sqlHandler` | frc 산출물을 DB로 넣는 손. 자연키(예: `구분+제목+회신일자`) 기적재 검증 |
| `LawQuery-twa` | **안드로이드 TWA 앱**(웹앱 래퍼) | (git 아님) | bubblewrap 빌드·keystore — 메모리 `twa-play` 참조 |

### 데이터 흐름 (누가 뭘 채우나)
```
LawQuery-law  ──(파이프라인 --apply)──→  ldb_j·ldb_y·ldb_g…(국내법령) + fin_law_db(해외법령)
LawQuery-frc  ──(크롤)──→ Excel/Pickle ──(LawQuery-sqlhandler 로 import)──→ ldb_i(유권해석)
                                                    ↓
                                   LawQuery 웹앱(이 저장소)이 조회·서비스
                                                    ↓
                                          LawQuery-twa(안드로이드 래퍼)
```
- **국내법령·해외법령 데이터를 고칠 일 = `LawQuery-law`** (여기서 고치지 말 것). 운영 이관도 그쪽 `replicate*`.
- **유권해석 데이터가 이상하다 = frc(크롤 단계) 또는 sqlhandler(적재 단계)** 를 봐야 한다. 웹앱은 읽기만.
- `ldb_auth` (회원·접근기록·메모·교정·즐겨찾기·해외 카탈로그)만 **웹앱이 직접 쓴다**.

## 개발 명령어

```bash
# ★ 기본 개발환경 — webpack watch(번들→dist/) + 백엔드(ts-node-dev) + scss watch
#   접속: https://codexa.test   ← 로컬 Apache 가 정적 서빙 + /api → 4000 프록시
npm run dev

# 대안 — Apache 없이 webpack-dev-server 로 (정적+프록시를 dev-server 가 대행) + 타입체크
#   접속: http://localhost:3000
npm run dev:full

# 타입체크만
npm run typecheck:watch

# ★ 로컬 상시가동 (pm2) — 개발을 안 할 때도 https://codexa.test 가 늘 살아있게
npm run pm2:start     # 기동 + 부팅복원 목록 저장(pm2 save)
npm run serve         # 코드 수정 반영: 빌드(backend+webpack+scss) → pm2 restart
npm run pm2:logs      # 로그 / pm2:stop, pm2:restart, pm2:status

# 프로덕션 배포 (git pull → tsc → webpack → scss → pm2 restart) — 공개서버 종료로 현재 미사용
./deploy.sh
```

### 로컬(오프라인) 배포본 — 폐쇄망용, 브라우저만으로 동작

```bash
npm run local:zip   # ★전달용: 추출→빌드→유출검사→zip → release/*.zip (약 16MB)
npm run local       # 서버 호스팅용 폴더만 → dist-local/ (47MB, zip 없음)
```
루트의 **`build-offline.bat` 더블클릭**으로도 `local:zip` 과 같은 일을 한다.
만든 배포본은 압축을 풀지 않고 바로 확인한다 — `npm run local:verify`(file:// 자동검증) ·
`npm run local:open`(브라우저로 띄우기) · `npm run local:serve`(http 판 :5100).

호스팅이 메인이고 **로컬판은 필요할 때 뽑는 부산물**이다. 포크가 아니라 **빌드 타깃**이며,
`webpack.local.config.js` 가 `DbContext`→`SqlJsDbContext`(sql.js), `authGuard`→`authStub`(전량 개방)
두 모듈만 치환한다. 백엔드 Model/Controller·프론트 코드는 무수정으로 재사용된다.
자세한 내용·규율은 **[docs/LOCAL.md](docs/LOCAL.md)** 참조.

### 로컬 상시가동 구성 (2026-08-10~, 공개서버 codexa.kro.kr 종료 후)

이 PC 한 대가 곧 서버다. 공개 노출 없이 **로컬 접속 전용**(`https://codexa.test`).

| 조각 | 상시가동 방식 |
|---|---|
| Apache 2.4 (443 정적 + `/api`→4000 프록시) | Windows 서비스, 자동 시작 |
| MariaDB (3306) | Windows 서비스, 자동 시작 |
| Node 백엔드 (4000) | **pm2** — `ecosystem.local.config.js`, 로그온 시 작업 스케줄러 `LawQuery pm2 autostart` → `scripts/pm2-boot.ps1` (`pm2 resurrect`, 실패 시 ecosystem 폴백) |

- pm2 가 실행하는 것은 **컴파일된 `src/backend/js`** (편집 중 깨져도 서비스가 유지되도록 ts watch 를 쓰지 않음)
  → 백엔드 코드를 고쳤으면 **`npm run serve`** 해야 반영된다.
- `npm run dev` 진입 시 `predev`(kill-stale.ps1)가 pm2 백엔드를 **자동 정지**(4000 충돌 회피),
  종료 시 `postdev` 가 **자동 재기동**한다. 수동 복구는 `npm run pm2:start`.
- 부팅 자동복원은 **로그온 트리거** — 로그인해야 뜬다. 로그인 전부터 띄우려면 관리자 권한으로
  pm2 를 Windows 서비스로 등록해야 한다(미적용).

> **⚠️ 백엔드(4000)는 API 전용 — 정적 파일을 서빙하지 않는다.** `express.static` 이 없다.
> 정적(HTML·`dist/`·assets)은 **Apache 가 서빙**하고 `/api/*` 만 4000 으로 프록시한다(동일출처).
> 운영(`codexa.kro.kr`)·개발(`codexa.test`) 모두 이 구조 → `npm run dev` 가 운영과 같은 형상이다.
> `localhost:4000/` 을 직접 열면 404 가 정상. dev-server(3000)만이 예외적으로 정적을 대신 서빙한다.
>
> `predev` 훅이 `scripts/kill-stale.ps1` 로 좀비 watcher 를 먼저 정리한다.
> 개별 조각: `dev:backend`(API만) · `dev:server`(dev-server만) · `watch`(번들만).

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

> **시작화면 = 법령(index.html).** 루트(`/`)·앱 start_url·로그인 후 모두 법령으로 진입. 유권해석은 `interpretation.html`. `index.html`은 `law.bundle.js`, `interpretation.html`은 `interpretation.bundle.js`를 로드.

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

### 기본조회와 연혁비교 — 서로 다른 두 비교 (2026-09-13)

법령 화면 상단 탭 **기본조회 | 연혁비교**(`?view=hist`)로 갈린다. 둘은 데이터도 화면도 따로다 —
섞지 말 것(2026-09-02 에 시행예정 에셋을 재활용해 '버전 바'로 한데 얹었다가 UX 가 흐려져 걷어냈다).

- **기본조회** = 연계표(법→시행령→감독규정→세칙) + **시행예정은 늘 겹쳐 표시**(적재 시 박은
  `content_*_sched` → `LawTable` 인라인 diff). '개정비교' 버튼은 시행예정이 걸린 조만 남기는 필터
  (`LawRevisionEventManager`). 비교 시점을 고르는 UI 는 없다(버전 바의 뒷단 `db_version`·`applyCompare`·`?cmp=` 도 2026-09-14 제거).
- **연혁비교** = 규정마다 **두 시점을 골라** 법제처 신구법비교 모양(좌 종전 | 우 개정)으로 견준다.
  - 데이터: `db_hist_version` · `db_hist_article` · `db_hist_text`(조 본문, 해시로 중복 제거).
    적재는 LawQuery-law `python -m pipeline.history <code> --apply` — **법·시행령·행정규칙 전 단의 law.go.kr 연혁**.
  - API: `GET /api/law/history/versions`(단별 버전 목록) · `GET /api/law/history/compare?origin=&old=&new=`
    (`LawHistoryController` — `<개정 …>`·`[본조신설 …]` 같은 개정 표기를 걷어낸 뒤 달라진 조만 돌려준다).
  - 프론트 `src/frontend/ts/law/history/`: `HistoryController`(선택 · URL `?h=a:종전~개정,e:none`),
    `HistoryView`, `OldNewDiff`(줄=항·호·목 맞춤 → 줄 안 글자 diff, 안 바뀐 줄은 `1. ~ 18. (생 략)`으로 접되
    바뀐 호의 윗 항은 남긴다). 판정(신설·삭제·변경)은 저장하지 않고 매번 문언에서 계산한다.
  - 테이블이 없는 DB 면 '연혁 데이터 없음'. 로컬(오프라인)판은 탭을 숨기고(`lawFeatureStub`)
    `scripts/export-local.py` 가 `db_hist_*` 를 뺀다.

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
