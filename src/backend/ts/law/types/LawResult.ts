import type { RowDataPacket } from "mysql2";

export interface LawResult extends RowDataPacket {
    id_a: string | null;    // Add id_a field
    law_content: string;
    decree_content: string;
    regulation_content: string;
    rule_content: string;
}