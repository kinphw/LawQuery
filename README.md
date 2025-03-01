# LawQuery

금융법령, 유권해석, 비조치의견서 검색 및 조회를 위한 웹 어플리케이션입니다.

## 버전

0.0.1

## 제작

박형원 

## 구현언어

HTML+CSS+JS (JS MVC) 
 
## Last updated

2025-03-02

## 사용 약자 설명

한글 용어	영어 번역	약자
법	Act	A
시행령	Enforcement Decree	E
감독규정	Supervisory Regulation	S
감독규정시행세칙	Supervisory Rules (or Supervisory Enforcement Rules)	R
유권해석	Interpretation	I

## 프로젝트 구조

law-query/
├── index.html
├── law.html 
├── assets/
│   ├── css/
│   │   └── style.css
│   └── vendor/
│       ├── bootstrap.min.css
│       ├── bootstrap.min.js
│       ├── sql-wasm.js
│       └── sql-wasm-b64.js
├── data/
│   └── dataset.js             # 데이터베이스
└── tools/                     # DB 변환 도구들

src/
├── ts/
│   ├── models/
│   │   ├── Database.ts
│   │   └── SearchModel.ts
│   ├── views/
│   │   ├── components/
│   │   │   ├── Header.ts
│   │   │   ├── SearchForm.ts
│   │   │   └── ResultTable.ts
│   │   └── MainView.ts
│   ├── controllers/
│   │   └── SearchController.ts
│   ├── types/
│   │   └── types.ts
│   └── app.ts
└── js/ (컴파일된 JavaScript)