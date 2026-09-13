/**
 * 로컬판 법령 진입점 — 호스팅판 엔트리(frontend/ts/entry/law.ts)를 그대로 쓰되,
 * 그보다 먼저 로컬 API(fetch 가로채기)를 설치한다. import 순서가 곧 실행 순서다.
 */
import '../installFirst';
import '../../frontend/ts/entry/law';
