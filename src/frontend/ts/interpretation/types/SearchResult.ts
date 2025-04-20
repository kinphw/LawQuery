export interface SearchResult {
  id: number;        // id 필드 추가
  구분: string;
  분야: string;
  제목: string;
  일련번호: string;
  회신일자: string;
  질의요지?: string;  // 세부 정보는 선택적 필드로 변경
  회답?: string;      // 세부 정보는 선택적 필드로 변경
  이유?: string;      // 세부 정보는 선택적 필드로 변경
}