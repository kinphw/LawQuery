import type { RowDataPacket } from 'mysql2';

export interface DetailResult extends RowDataPacket {
  id: number;
  질의요지: string;
  회답: string;
  이유: string;
}