export interface LawResult {
    [key: string]: string | null;  // Allow string indexing
    id_a: string | null;    // Add id_a field
    law_content: string;
    decree_content: string;
    regulation_content: string;
    rule_content: string;
}