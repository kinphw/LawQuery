/**
 * 로컬(오프라인)판 — 법령해석 원문 보기 없음.
 * 원문 파일(HWP)·변환기(한/글)·pdf.js 를 사본에 싣지 않으므로 상세 줄에 아무것도 달지 않는다.
 * webpack.local.config.js 가 interpretation/original/OriginalPanel 을 이 파일로 갈아끼운다.
 */
export interface OriginalMeta { kind: string; serial: string; title: string; }

export async function attachOriginals(_cell: HTMLElement, _id: number, _meta: OriginalMeta): Promise<void> {
  /* 로컬판에는 원문이 없다 */
}
