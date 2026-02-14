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

      // 1. Law Level (Always present)
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

      // 2. Decree Level
      let decreeNode = null;
      if (row.id_e) {
        // Real Decree exists
        decreeNode = law.children.find((d: any) => d.id === row.id_e);
        if (!decreeNode) {
          decreeNode = {
            id: row.id_e,
            title: row.decree_content,
            children: []
          };
          law.children.push(decreeNode);
        }
      } else if (row.id_s || row.id_r || row.id_b) {
        // Skipped Level: Create Virtual Decree
        const vId = `V_E_${row.id_a}`;
        decreeNode = law.children.find((d: any) => d.id === vId);
        if (!decreeNode) {
          decreeNode = {
            id: vId,
            title: '(..)', // Shell node title
            children: []
          };
          law.children.push(decreeNode);
        }
      }

      // If no Decree (real or virtual), we stop here for this row
      if (!decreeNode) return;


      // 3. Regulation Level
      let regulationNode = null;
      if (row.id_s) {
        // Real Regulation
        regulationNode = decreeNode.children.find((s: any) => s.id === row.id_s);
        if (!regulationNode) {
          regulationNode = {
            id: row.id_s,
            title: row.regulation_content,
            children: []
          };
          decreeNode.children.push(regulationNode);
        }
      } else if (row.id_r || row.id_b) {
        // Skipped Level: Create Virtual Regulation
        const vId = `V_S_${decreeNode.id}`;
        regulationNode = decreeNode.children.find((s: any) => s.id === vId);
        if (!regulationNode) {
          regulationNode = {
            id: vId,
            title: '(..)',
            children: []
          };
          decreeNode.children.push(regulationNode);
        }
      }

      // If no Regulation, stop
      if (!regulationNode) return;


      // 4. Rule Level
      let ruleNode = null;
      if (row.id_r) {
        // Real Rule
        ruleNode = regulationNode.children.find((r: any) => r.id === row.id_r);
        if (!ruleNode) {
          ruleNode = {
            id: row.id_r,
            title: row.rule_content,
            children: []
          };
          regulationNode.children.push(ruleNode);
        }
      } else if (row.id_b) {
        // Skipped Level: Create Virtual Rule
        const vId = `V_R_${regulationNode.id}`;
        ruleNode = regulationNode.children.find((r: any) => r.id === vId);
        if (!ruleNode) {
          ruleNode = {
            id: vId,
            title: '(..)',
            children: []
          };
          regulationNode.children.push(ruleNode);
        }
      }

      // If no Rule, stop
      if (!ruleNode) return;


      // 5. Book Level
      if (row.id_b && row.book_content) {
        if (!ruleNode.children.find((b: any) => b.id === row.id_b)) {
          ruleNode.children.push({
            id: row.id_b,
            title: row.book_content,
            children: []
          });
        }
      }
    });

    return result;
  }
}