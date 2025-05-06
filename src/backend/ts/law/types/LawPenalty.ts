export interface LawPenalty {
    category: string;
    item_a_log: string;
    content_pa: string;
    content_pe: string | null;
    id_a: string;
    title_a: string; // 250506
    content_a: string;
    penalty_a_log: string;
    penalty_e_log: string | null;
}