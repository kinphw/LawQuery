/**
 * OldNewDiff
 * ------------------------------------------------------------------
 * 한 조문의 종전·개정 문언 → 신구대비표 행(법제처 신구법비교 모양).
 *
 *   제2조(정의) 이 법에서 …          │ 제2조(정의) 이 법에서 …        ← 조 머리는 늘 보인다
 *   1. ~ 18. (생 략)                 │ 1. ~ 18. (종전과 같음)         ← 안 바뀐 줄은 접는다
 *   19. "전자지급결제대행"이란 …     │ 19. "전자지급결제대행"이란 …   ← 바뀐 줄은 문구 단위로 강조
 *   <신 설>                          │ 가. …
 *
 * 줄(항·호·목) 단위로 먼저 맞춘 뒤, 짝지어진 줄 안에서 다시 글자 단위 diff 를 돈다.
 * 줄 짝짓기는 번호(①·1.·가.)를 우선한다 — 호 하나가 끼어들면 뒤 번호가 밀리는데
 * 위치로만 짝지으면 전혀 다른 호끼리 붙기 때문이다.
 * 판정(신설·삭제·변경)은 데이터에 두지 않고 매번 문언에서 계산한다.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { diff_match_patch, DIFF_DELETE, DIFF_EQUAL } = require('diff-match-patch');

export type RowKind = 'head' | 'same' | 'change' | 'added' | 'removed';

/** left/right 는 이미 이스케이프·강조가 끝난 HTML. */
export interface OldNewRow {
    kind: RowKind;
    left: string;
    right: string;
}

const CIRCLED = '①-⑳㉑-㉟';                 // ①~⑳, ㉑~㉟
const LABEL = new RegExp(`^(제\\d+조(?:의\\d+)?|[${CIRCLED}]|\\d+(?:의\\d+)*\\.|[가-힣]\\.|\\(\\d+\\)|\\d+\\))`);

function label(line: string): string | null {
    const m = line.match(LABEL);
    return m ? m[1] : null;
}

/** 번호 모양으로 들여쓰기 단계: 조·항 0, 호 1, 목 2, 그 아래 3. 번호 없는 줄(단서·표 등)은 앞 줄을 따른다. */
function levelOf(lab: string | null): number | null {
    if (!lab) return null;
    if (lab.startsWith('제') || new RegExp(`^[${CIRCLED}]`).test(lab)) return 0;
    if (/^\d/.test(lab) && lab.endsWith('.')) return 1;
    if (/^[가-힣]\.$/.test(lab)) return 2;
    return 3;
}

function levels(lines: string[]): number[] {
    let prev = 0;
    return lines.map(l => (prev = levelOf(label(l)) ?? prev));
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const line = (level: number, html: string, extra = ''): string =>
    `<div class="lq-h-line lq-h-ind-${level}${extra}">${html}</div>`;

function splitLines(text: string | null): string[] {
    return (text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
}

// ── 줄 단위 정렬 ─────────────────────────────────────────────

interface LineOp { op: number; text: string; }

function lineOps(a: string[], b: string[]): LineOp[] {
    const dmp = new diff_match_patch();
    const enc = dmp.diff_linesToChars_(a.join('\n') + '\n', b.join('\n') + '\n');
    const diffs = dmp.diff_main(enc.chars1, enc.chars2, false);
    dmp.diff_charsToLines_(diffs, enc.lineArray);
    const out: LineOp[] = [];
    for (const [op, chunk] of diffs as [number, string][]) {
        for (const t of chunk.split('\n')) if (t) out.push({ op, text: t });
    }
    return out;
}

// ── 행 만들기 ────────────────────────────────────────────────

/** 접힌 한 행: 같은 단계 번호의 처음~끝("1. ~ 18.")만 적는다. */
function omitRow(lines: string[], lv: number[], base: number): OldNewRow {
    const siblings = lines.filter((_, k) => lv[k] === base).map(label).filter(Boolean) as string[];
    const first = siblings[0], last = siblings[siblings.length - 1];
    const range = first ? (last && last !== first ? `${first} ~ ${last} ` : `${first} `) : '';
    return {
        kind: 'same',
        left: line(base, `${esc(range)}(생 략)`, ' lq-h-omit'),
        right: line(base, `${esc(range)}(종전과 같음)`, ' lq-h-omit'),
    };
}

/**
 * 안 바뀐 줄 묶음 → "1. ~ 18. (생 략)" 행들. 단계가 얕아지는 곳(호 → 항)에서 끊는다.
 * 바로 뒤에 바뀐 줄이 오면 그 줄의 윗단(항 등)은 따로 한 행씩 남긴다 —
 * 한데 접으면 "① ~ ③ (생 략)" 뒤에 "2. 삭제"가 떠서 몇 항의 호인지 알 수 없다.
 *   ① ~ ② (생 략) / ③ (생 략) / 1. (생 략) / 2. 삭제
 * @param nextLevel 바로 뒤 바뀐 줄의 단계(뒤가 없으면 null)
 */
function omitted(lines: string[], lv: number[], nextLevel: number | null): OldNewRow[] {
    const anchors = new Set<number>();
    if (nextLevel !== null) {
        let need = nextLevel;
        for (let i = lines.length - 1; i >= 0 && need > 0; i--) {
            if (lv[i] < need) { anchors.add(i); need = lv[i]; }
        }
    }
    const rows: OldNewRow[] = [];
    let i = 0;
    while (i < lines.length) {
        if (anchors.has(i)) { rows.push(omitRow([lines[i]], [lv[i]], lv[i])); i++; continue; }
        const base = lv[i];
        let j = i + 1;
        while (j < lines.length && lv[j] >= base && !anchors.has(j)) j++;
        rows.push(omitRow(lines.slice(i, j), lv.slice(i, j), base));
        i = j;
    }
    return rows;
}

function changed(o: string, n: string, level: number): OldNewRow {
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(o, n);
    dmp.diff_cleanupSemantic(diffs);
    let l = '', r = '';
    for (const [op, t] of diffs as [number, string][]) {
        const s = esc(t);
        if (op === DIFF_EQUAL) { l += s; r += s; }
        else if (op === DIFF_DELETE) l += `<span class="lq-h-del">${s}</span>`;
        else r += `<span class="lq-h-ins">${s}</span>`;
    }
    return { kind: 'change', left: line(level, l), right: line(level, r) };
}

const added = (n: string, level: number): OldNewRow => ({
    kind: 'added',
    left: line(level, '&lt;신 설&gt;', ' lq-h-mark'),
    right: line(level, `<span class="lq-h-ins">${esc(n)}</span>`),
});

const removed = (o: string, level: number): OldNewRow => ({
    kind: 'removed',
    left: line(level, `<span class="lq-h-del">${esc(o)}</span>`),
    right: line(level, '&lt;삭 제&gt;', ' lq-h-mark'),
});

/** 바뀐 줄 묶음(종전 del · 개정 ins) → 짝지은 행들. 번호가 같으면 짝, 한쪽 번호가 뒤에 다시 나오면 끼어든 줄로 본다. */
function paired(del: string[], ins: string[], delLv: number[], insLv: number[]): OldNewRow[] {
    const rows: OldNewRow[] = [];
    const later = (arr: string[], from: number, lab: string | null) =>
        lab !== null && arr.slice(from).some(x => label(x) === lab);
    let i = 0, j = 0;
    while (i < del.length || j < ins.length) {
        if (i < del.length && j < ins.length) {
            const ld = label(del[i]), ln = label(ins[j]);
            if (ld === ln) { rows.push(changed(del[i], ins[j], insLv[j])); i++; j++; }
            else if (later(ins, j + 1, ld)) { rows.push(added(ins[j], insLv[j])); j++; }
            else if (later(del, i + 1, ln)) { rows.push(removed(del[i], delLv[i])); i++; }
            else { rows.push(changed(del[i], ins[j], insLv[j])); i++; j++; }
        } else if (i < del.length) {
            rows.push(removed(del[i], delLv[i])); i++;
        } else {
            rows.push(added(ins[j], insLv[j])); j++;
        }
    }
    return rows;
}

/**
 * 조 하나의 신구대비 행.
 * @param oldText 종전 문언(그 버전에 조가 없으면 null)
 * @param newText 개정 문언(그 버전에 조가 없으면 null)
 */
export function buildRows(oldText: string | null, newText: string | null): OldNewRow[] {
    const a = splitLines(oldText), b = splitLines(newText);
    if (!a.length && !b.length) return [];
    if (!a.length) {
        const lv = levels(b);
        return [{
            kind: 'added',
            left: line(0, '&lt;신 설&gt;', ' lq-h-mark'),
            right: b.map((t, k) => line(lv[k], `<span class="lq-h-ins">${esc(t)}</span>`)).join(''),
        }];
    }
    if (!b.length) {
        const lv = levels(a);
        return [{
            kind: 'removed',
            left: a.map((t, k) => line(lv[k], `<span class="lq-h-del">${esc(t)}</span>`)).join(''),
            right: line(0, '&lt;삭 제&gt;', ' lq-h-mark'),
        }];
    }

    // 줄 단위 정렬 결과에 종전/개정 각자의 들여쓰기 단계를 붙여 둔다(번호 없는 줄은 앞 줄을 따르므로 원래 줄 순서로 계산).
    const ops = lineOps(a, b);
    const aLv = levels(a), bLv = levels(b);
    let ai = 0, bi = 0;
    const tagged = ops.map(o => {
        const la = o.op <= 0 ? aLv[ai] : 0, lb = o.op >= 0 ? bLv[bi] : 0;
        if (o.op <= 0) ai++;
        if (o.op >= 0) bi++;
        return { ...o, la, lb };
    });

    const rows: OldNewRow[] = [];
    let k = 0;
    while (k < tagged.length) {
        if (tagged[k].op === DIFF_EQUAL) {
            const run: string[] = [], runLv: number[] = [];
            const start = k;
            while (k < tagged.length && tagged[k].op === DIFF_EQUAL) { run.push(tagged[k].text); runLv.push(tagged[k].la); k++; }
            let rest = run, restLv = runLv;
            if (start === 0) {                                     // 조 머리(첫 줄)는 접지 않는다 — 몇 조인지가 사라지므로
                rows.push({ kind: 'head', left: line(0, esc(run[0])), right: line(0, esc(run[0])) });
                rest = run.slice(1);
                restLv = runLv.slice(1);
            }
            const next = k < tagged.length ? (tagged[k].op < 0 ? tagged[k].la : tagged[k].lb) : null;
            if (rest.length) rows.push(...omitted(rest, restLv, next));
        } else {
            const del: string[] = [], ins: string[] = [], dl: number[] = [], il: number[] = [];
            while (k < tagged.length && tagged[k].op !== DIFF_EQUAL) {
                const t = tagged[k++];
                if (t.op === DIFF_DELETE) { del.push(t.text); dl.push(t.la); }
                else { ins.push(t.text); il.push(t.lb); }
            }
            rows.push(...paired(del, ins, dl, il));
        }
    }
    return rows;
}
