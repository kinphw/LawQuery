/**
 * 로컬(오프라인) 배포본의 ⓘ 정보 모달 — `common/components/appInfo` 를 대체한다(webpack 치환).
 *
 * ★ 이 사본은 폐쇄망으로 전달된다. 서비스 주소·저장소 링크·연락처 등
 *   **바깥을 가리키는 정보는 한 글자도 넣지 않는다.** 외부 링크 0개를 유지할 것.
 *   (호스팅판 문구는 src/frontend/ts/common/components/appInfo.ts 에 있다)
 */
export function appInfoHtml(): string {
  const stamp = (window as any).LQ_OFFLINE_STAMP as string | undefined;
  const dataLine = stamp
    ? `<div class="mb-1">데이터 기준: <strong>${stamp}</strong></div>`
    : '';

  return `
            <div class="mb-2">
                <strong>LawQuery</strong> <span class="text-secondary">금융법령·유권해석·비조치의견서 조회</span>
            </div>
            <div class="mb-2 p-2 rounded" style="background:#f1f3f5">
                <i class="fas fa-hdd text-secondary"></i> <strong>오프라인 사본</strong>
                <div class="text-muted small mt-1">
                    인터넷 연결 없이 동작합니다. 모든 기능이 열려 있습니다.
                </div>
            </div>
            ${dataLine}
            <div class="text-muted small">
                최신 개정을 반영하려면 새 사본을 받으세요.
            </div>
            <div class="text-muted small mt-2">Apache license 2.0</div>
        `;
}
