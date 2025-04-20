import type { RowDataPacket } from 'mysql2';

export interface SearchResult extends RowDataPacket {
  id: number;
  구분: string;
  분야: string;
  제목: string;
  일련번호: string;
  회신일자: string;
}