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
}