import { LawResult } from '../types/LawResult';
import { LawTreeNode } from '../types/LawTreeNode';

export class TreeConverter {
  public static toLawTree(rows: LawResult[]): LawTreeNode[] {
    const lawMap = new Map<string, any>();
    const result: LawTreeNode[] = [];
  
    rows.forEach(row => {
      // 타이틀(장, 절 등)
      if (!row.id_a) {
        result.push({
          id: null,
          id_aa: row.id_aa,
          title: row.law_content,
          isTitle: true,
          children: []
        });
        return;
      }
  
      // 본문(트리)
      if (!lawMap.has(row.id_a)) {
        const node = {
          id: row.id_a,
          id_aa: row.id_aa,
          title: row.law_content,
          children: []
        };
        lawMap.set(row.id_a, node);
        result.push(node);
      }
      const law = lawMap.get(row.id_a);
  
      // 이하 기존 트리 변환 로직 (decree, regulation, rule ...)
      let decree = row.id_e && law.children.find((d: any) => d.id === row.id_e);
      if (!decree && row.id_e) {
        decree = {
          id: row.id_e,
          title: row.decree_content,
          children: []
        };
        law.children.push(decree);
      }
  
      let regulation = decree && row.id_s && decree.children.find((s: any) => s.id === row.id_s);
      if (!regulation && decree && row.id_s) {
        regulation = {
          id: row.id_s,
          title: row.regulation_content,
          children: []
        };
        decree.children.push(regulation);
      }
  
      if (regulation && row.id_r) {
        if (!regulation.children.find((r: any) => r.id === row.id_r)) {
          regulation.children.push({
            id: row.id_r,
            title: row.rule_content
          });
        }
      }
    });
  
    return result;
  }  

}