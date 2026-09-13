/**
 * appInfo.ts
 * ------------------------
 * ⓘ "LawQuery 정보" 모달의 본문.
 *
 * ★ 별도 모듈로 분리해 둔 이유:
 *   로컬(오프라인) 배포본은 폐쇄망으로 전달되는 사본이라 **서비스 주소·저장소 링크 등
 *   외부 정보가 한 글자도 실려서는 안 된다.** 빌드 시 이 모듈만 통째로 교체하면 되도록
 *   여기 한 곳에 모아 둔다. (교체본: src/local/appInfoStub.ts,
 *   치환: webpack.local.config.js 의 NormalModuleReplacementPlugin)
 *
 *   → 새 링크·주소를 추가할 일이 생기면 반드시 이 파일 안에만 둘 것.
 *     Header 등 다른 컴포넌트에 흩어 놓으면 로컬판으로 새어 나간다.
 */
export function appInfoHtml(): string {
  return `
            <div class="mb-2">
                <strong>LawQuery</strong> <span class="text-secondary">전금법령, 유권해석, 비조치의견서 검색 및 조회</span>
            </div>
            <div class="mb-2 p-2 rounded" style="background:#f1f3f5">
                <i class="fas fa-globe text-primary"></i> 웹에서도 이용하실 수 있어요:
                <a href="https://codexa.kro.kr" target="_blank" rel="noopener"><strong>codexa.kro.kr</strong></a>
            </div>
            <div class="mb-1">
                <a href="https://github.com/kinphw/LawQuery" target="_blank" rel="noopener">
                    <i class="fab fa-github"></i> github.com/kinphw/LawQuery
                </a>
            </div>
            <div class="mb-1">
                <a href="https://github.com/kinphw/LawQuery/releases" target="_blank" rel="noopener">
                    <i class="fas fa-history"></i> 업데이트 내역 (Releases)
                </a>
            </div>
            <div class="text-muted small">Apache license 2.0</div>
        `;
}
