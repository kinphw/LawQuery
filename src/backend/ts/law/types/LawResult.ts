import type { RowDataPacket } from "mysql2";

// 250430 수정
export interface LawResult extends RowDataPacket {
    id_aa: string;                // 조문별 그룹 식별자
    id_a: string;                 // 세부 조문 식별자
    law_content: string | null;
    law_content_sched: string | null;
    id_e: string | null;
    decree_content: string | null;
    decree_content_sched: string | null;
    id_s: string | null;
    regulation_content: string | null;
    regulation_content_sched: string | null;
    id_r: string | null;
    rule_content: string | null;
    rule_content_sched: string | null;

    id_b?: string | null;
    book_content?: string | null;
    book_content_sched?: string | null;

    // Scheduled dates
    law_sched_date?: string | null;
    decree_sched_date?: string | null;
    regulation_sched_date?: string | null;
    rule_sched_date?: string | null;
    book_sched_date?: string | null;

    // Sorting fields
    ide?: number;
    ids?: number;
    idr?: number;
    idb?: number;
}