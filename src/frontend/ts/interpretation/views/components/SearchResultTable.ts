import { SearchResult } from '../../types/SearchResult';
import { DateUtil } from '../../../common/util/DateUtil';

export class SearchResultTable {
  private currentTextSize: string = 'small';

// 시작 인덱스 속성 추가
  private startIndex = 0;


  setTextSize(size: string): void {
    this.currentTextSize = size;
  }

  // render(results: SearchResult[]): string {
  //   this.startIndex = 0; // 페이지 처음부터 시작      
  //   if (!results.length) {
  //     return '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
  //   }

  //   let html = `
  //     <table class="table table-bordered table-hover" style="table-layout: fixed; width: 100%;">
  //       <thead class="table-light">
  //         <tr>
  //           <th class="text-center align-middle text-nowrap w-10">구분</th>
  //           <th class="text-center align-middle w-10">분야</th>
  //           <th class="text-center align-middle text-nowrap w-50">제목</th>
  //           <th class="text-center align-middle text-nowrap w-10">일련번호</th>
  //           <th class="text-center align-middle text-nowrap w-10">회신일자</th>
  //         </tr>
  //       </thead>
  //       <tbody>`;

  //   results.forEach((item, index) => {

  //     // // 회신일자 포맷팅
  //     // let displayDate = '';
  //     // if (item.회신일자) {
  //     //   // ISO 형식이나 다른 형식의 날짜 문자열 모두 처리
  //     //   displayDate = new Date(item.회신일자).toISOString().split('T')[0];
  //     // }

  //     html += `
  //       <tr class="search-result-row ${this.currentTextSize}" data-row-index="${index}" data-id="${item.id}">
  //         <td class="text-center align-middle text-nowrap w-10">${item.구분 || ''}</td>
  //         <td class="text-center align-middle w-10" style="word-break: break-word">${item.분야 || ''}</td>
  //         <td class="align-middle w-50">${item.제목 || ''}</td>
  //         <td class="align-middle text-center w-10">${item.일련번호 || ''}</td>
  //         <td class="align-middle text-center w-10">${DateUtil.formatDate(item.회신일자)}</td>
  //       </tr>
  //       <tr class="detail-row d-none ${this.currentTextSize}" id="detail-${index}">
  //         <!-- 상세 정보가 동적으로 로드됩니다 -->
  //       </tr>`;
  //   });

  //   html += `</tbody></table>`;
  //   return html;
  // }

  formatMultiline(text: string): string {
    return text ? text.replace(/\n/g, '<br>') : '';
  }

  setRowClickHandler(): void {
    // 이 함수는 SearchController.bindRowClickEvents에서 직접 구현
  }

// ResultTable 클래스에서 generateRows 메소드 추출
  generateRows(results: SearchResult[], startIndex: number): string {

    let html:string = '';

    results.forEach((item, i) => {

      const rowIndex = startIndex + i; // Calculate absolute index based on startIndex

      html += `
      <tr class="search-result-row ${this.currentTextSize}" data-row-index="${rowIndex}" data-id="${item.id}">
        <td class="text-center align-middle text-nowrap w-10">${item.구분 || ''}</td>
        <td class="text-center align-middle w-10" style="word-break: break-word">${item.분야 || ''}</td>
        <td class="align-middle w-50">${item.제목 || ''}</td>
        <td class="align-middle text-center w-10">${item.일련번호 || ''}</td>
        <td class="align-middle text-center w-10">${DateUtil.formatDate(item.회신일자)}</td>
      </tr>
      <tr class="detail-row d-none ${this.currentTextSize}" id="detail-${rowIndex}">
        <!-- 상세 정보가 동적으로 로드됩니다 -->
      </tr>`;
    });

    return html;
  }  

// 시작 인덱스 설정 메소드
  setStartIndex(index: number): void {
    this.startIndex = index;
  }

  // 현재 시작 인덱스 반환
  getStartIndex(): number {
    return this.startIndex;
  }  
}