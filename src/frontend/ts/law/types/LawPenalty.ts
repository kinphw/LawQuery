export interface LawPenalty {
    category: string;             // 벌칙/과태료
    item_a_log: string;           // 조문(예: 법 제49조제1항제1호) : 논리명
    content_pa: string;            // 위반행위 요약 _ 법(a)
    content_pe: string | null;     // 위반행위 요약 _ 시행령(e)
    id_a: string;                 // 조문 id (ex: 'A21_4')
    title_a: string;             // 조문 제목 (ex: '법 제49조제1항제1호') // 250506
    content_a: string;        // 원 조문 전체 내용 (a.content_a)
    penalty_a_log: string;        // 벌칙(예: 10년 이하의 징역 또는 1억원 이하의 벌금)
    penalty_e_log: string | null; // 벌칙 _ 시행령(과태료의 구현)
}