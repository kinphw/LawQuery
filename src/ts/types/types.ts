// 사용자정의 타입을 정의하는 파일
interface SearchCriteria {
    type: string;
    serial: string;
    field: string;
    keyword: string;
  }
  
interface SearchResult {
  구분: string;
  분야: string;
  제목: string;
  일련번호: string;
  회신일자: string;
  질의요지: string;
  회답: string;
  이유: string;
}

interface LawTitle {
  id_a: string | null;
  title_a: string;
  isTitle: boolean;
}