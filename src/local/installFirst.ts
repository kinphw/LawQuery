/**
 * 로컬 API 를 "번들의 다른 어떤 코드보다 먼저" 설치한다.
 *
 * ES 모듈은 import 된 순서대로 평가되므로, 진입점에서 이 모듈을 프론트 엔트리보다
 * 위에 두면 fetch 가로채기가 반드시 먼저 걸린다.
 */
import { installLocalApi } from './localApi';

installLocalApi();
