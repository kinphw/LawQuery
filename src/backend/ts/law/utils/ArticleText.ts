/**
 * 조문 문언 유틸 — 연혁(조 단위 문언)을 연계표 노드(조·항·호 행)에 맞춰 자른다.
 *
 * 자르는 규칙은 적재 파이프라인(LawQuery-law lawparse/splitter._split_article · article_split)과
 * 같아야 한다. 표의 항·호 행 ID 가 그 규칙으로 매겨졌기 때문이다.
 *   A28          제28조 — 항·호로 나뉜 조면 머리(조 제목)만, 아니면 조 전체
 *   A28_3h       제28조 ③항(항이 없는 조면 3호)
 *   A31_1h_2ho   제31조 ①항의 2호
 *   Rfi.1-2_2    트랙 fi 의 제1-2조의2(편-조) — 연혁 art_key 는 '1-2-2'
 */

/**
 * 개정 표기 — 문언이 아니라 '언제 고쳤나'의 꼬리표라, 개정될 때마다 날짜만 붙어 가짜 변경을 만든다.
 *   <개정 2011.5.19, 2020.2.4>  <신설 2020. 8. 4.>  <종전의 제3호에서 이동, 2020. 8. 4.>  <2011.8.18>
 *   [본조신설 2013.5.22]  [전문개정 2008.12.31]  [종전 제5조는 제6조로 이동 <2020.1.1>]
 * <별표 1>·[별표 1의2]·<별지 제1호 서식> 같은 참조 표기는 문언이므로 남긴다.
 */
const ANNOTATIONS: RegExp[] = [
  /\[\s*(?:본조\s*신설|전문\s*개정|제목\s*개정|종전|시행일)[^[\]]*\]/g,
  /<\s*(?:개정|신설|전문개정|제목개정|본조신설|타법개정|종전)[^<>]*>/g,
  /<\s*\d{2,4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?\s*>/g,
];

export function normalizeArticle(text: string): string {
  let t = text || '';
  for (const re of ANNOTATIONS) t = t.replace(re, '');
  return t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

const HANG = /^[①-⑮]/;
const HO = /^\d+(?:의\d+)*\./;
const HO_KEY = /^(\d+)(?:의(\d+))?\./;

/** 항·호 번호. ①→1, '3.'→3, '6의2.'→6(가지호는 번호가 겹친다 — 적재기와 같은 규칙). */
function unitNum(line: string): number | null {
  const t = line.trim();
  const c = t.codePointAt(0) ?? 0;
  if (c >= 0x2460 && c <= 0x246e) return c - 0x2460 + 1;
  const m = t.match(HO_KEY);
  return m ? Number(m[1]) : null;
}

/** 조 → 머리(stem) + 항(항이 없으면 호) 번호별 덩어리. 첫 줄은 늘 머리다. */
export function splitArticle(text: string): { stem: string; items: Map<number, string> } {
  const lines = text.split('\n');
  const body = lines.slice(1);
  const items = new Map<number, string>();
  const trig = body.some(l => HANG.test(l.trim())) ? HANG : HO;
  if (!body.some(l => trig.test(l.trim()))) return { stem: text.trim(), items };

  const stem = [lines[0]];
  let cur: string[] | null = null;
  const flush = (): void => {
    if (!cur) return;
    const k = unitNum(cur[0]);
    if (k !== null && !items.has(k)) items.set(k, cur.join('\n').trim());
  };
  for (const l of body) {
    if (trig.test(l.trim())) { flush(); cur = [l.trim()]; }
    else if (cur) cur.push(l);
    else stem.push(l);
  }
  flush();
  return { stem: stem.join('\n').trim(), items };
}

/** 항 → 항 머리 + 호 키('6'·'6_2')별 덩어리. */
export function splitHang(item: string): { stem: string; hos: Map<string, string> } {
  const lines = item.split('\n');
  const stem = [lines[0]];
  const hos = new Map<string, string>();
  let cur: string[] | null = null;
  let key = '';
  const flush = (): void => {
    if (cur && !hos.has(key)) hos.set(key, cur.join('\n').trim());
  };
  for (const l of lines.slice(1)) {
    const m = l.trim().match(HO_KEY);
    if (m) { flush(); cur = [l.trim()]; key = m[2] ? `${m[1]}_${m[2]}` : m[1]; }
    else if (cur) cur.push(l);
    else stem.push(l);
  }
  flush();
  return { stem: stem.join('\n').trim(), hos };
}

export interface NodeRef {
  tier: string;          // a|e|s|r|b
  key: string;           // 연혁 art_key — '28' · '6-2' · '1-2-2'
  stemId: string;        // 조 노드 ID
  itemId: string | null; // 항(호) 노드 ID
  item: number | null;
  ho: string | null;
}

const NODE_RE = /^([AESRB])((?:[a-z]+\.)?)(\d+(?:-\d+)?)(?:_(\d+)(?=_|$))?(?:_(\d+)h)?(?:_(\d+(?:_\d+)?)ho)?$/;

export function parseNodeId(id: string): NodeRef | null {
  const m = NODE_RE.exec(id);
  if (!m) return null;
  const [, T, trk, jo, ga, item, ho] = m;
  if (ho && !item) return null;
  const stemId = `${T}${trk}${jo}${ga ? `_${ga}` : ''}`;
  return {
    tier: T.toLowerCase(),
    key: ga ? `${jo}-${ga}` : jo,
    stemId,
    itemId: item ? `${stemId}_${item}h` : null,
    item: item ? Number(item) : null,
    ho: ho ?? null,
  };
}

/**
 * 한 시점의 조 문언에서 노드 몫만 잘라 낸다. 그 시점에 그 조·항·호가 없었으면 null.
 * @param stemSplit 현행 표에서 이 조가 항·호 행으로 나뉘어 있는가
 * @param itemSplit 현행 표에서 이 항이 호 행으로 다시 나뉘어 있는가
 */
export function nodeText(ref: NodeRef, article: string | null | undefined, stemSplit: boolean, itemSplit: boolean): string | null {
  if (article == null) return null;
  if (ref.item === null) return stemSplit ? splitArticle(article).stem : article;
  const it = splitArticle(article).items.get(ref.item);
  if (it == null) return null;
  if (ref.ho === null) return itemSplit ? splitHang(it).stem : it;
  return splitHang(it).hos.get(ref.ho) ?? null;
}
