export class DateUtil {
  // 1. 날짜 포맷팅
  // static formatDate(date: Date, format: string): string {
  //   const options: Intl.DateTimeFormatOptions = {};
  //   if (format.includes('YYYY')) options.year = 'numeric';
  //   if (format.includes('MM')) options.month = '2-digit';
  //   if (format.includes('DD')) options.day = '2-digit';
  //   if (format.includes('HH')) options.hour = '2-digit';
  //   if (format.includes('mm')) options.minute = '2-digit';
  //   if (format.includes('ss')) options.second = '2-digit';

  //   return new Intl.DateTimeFormat('ko-KR', options).format(date);
  // }
  static formatDate(item:string) :string {
    // "2025-06-09 00:00:00" 형식의 문자열에서 날짜 부분만 추출
    if (!item) return '';
    return item.split(' ')[0]; // YYYY-MM-DD 부분만 반환
  }

  // 좁은 화면 표시용 축약 포맷: yy.m.d (앞자리 0 제거) — 예) "2026-04-16 00:00:00" → "26.4.16"
  // formatDate와 동일하게 문자열을 직접 파싱한다(new Date 사용 시 UTC 파싱으로 KST 하루 밀림 방지).
  static formatDateShort(item: string): string {
    if (!item) return '';
    const datePart = item.split(' ')[0]; // YYYY-MM-DD
    const [y, m, d] = datePart.split('-');
    if (!y || !m || !d) return datePart; // 형식이 다르면 원본 날짜부 반환
    return `${y.slice(2)}.${parseInt(m, 10)}.${parseInt(d, 10)}`;
  }
}