/**
 * dataset: data.js에서 전역변수로 선언된 상태
 *   ex) var dataset = [ { id:..., 구분:..., 분야:..., ... }, ... ];
 */

/**
 * DOMContentLoaded 시점:
 *  - data.js 로드가 끝났다고 가정
 *  - 검색 버튼 이벤트 설정
 *  - 전체 목록 초기 렌더
 */
window.addEventListener('DOMContentLoaded', () => {
    // 페이지 로드 시 전체 데이터 표시
    renderResults(dataset);
  
    // 검색 버튼 이벤트
    document.getElementById('searchBtn').addEventListener('click', performSearch);
  });
  
  /**
   * 검색을 수행하여 필터링
   *  - 구분(typeSelect): "전체", "비조치의견서", "유권해석"
   *  - 일련번호(serialInput): 빈 값이면 전체
   *  - 검색항목(fieldSelect): "전체", "질의요지", "회답", "이유"
   *  - 검색어(keywordInput): 빈 값이면 전체
   */
  function performSearch() {
    const typeValue   = document.getElementById('typeSelect').value.trim();    // 구분
    const serialValue = document.getElementById('serialInput').value.trim();   // 일련번호
    const fieldValue  = document.getElementById('fieldSelect').value.trim();   // 검색항목
    const keywordValue = document.getElementById('keywordInput').value.trim(); // 검색어
  
    let filtered = dataset;
  
    // 1) 구분 필터
    if (typeValue !== "전체") {
      filtered = filtered.filter(item => item.구분 === typeValue);
    }
  
    // 2) 일련번호 필터
    if (serialValue !== "") {
      filtered = filtered.filter(item => {
        return (item.일련번호 || '').includes(serialValue);
      });
    }
  
    // 3) 내용 검색 (fieldSelect에 따라 다른 필드를 검색)
    if (keywordValue !== "") {
      filtered = filtered.filter(item => {
        if (fieldValue === "전체") {
          // 제목, 질의요지, 회답, 이유를 합쳐서 검색
          const combined = [
            item.제목 || '',
            item.질의요지 || '',
            item.회답 || '',
            item.이유 || ''
          ].join(' ');
          return combined.includes(keywordValue);
  
        } else {
          // fieldValue가 "제목", "질의요지", "회답", "이유" 중 하나
          switch (fieldValue) {
            case "제목":
              return (item.제목 || '').includes(keywordValue);
            case "질의요지":
              return (item.질의요지 || '').includes(keywordValue);
            case "회답":
              return (item.회답 || '').includes(keywordValue);
            case "이유":
              return (item.이유 || '').includes(keywordValue);
            default:
              return false; // 혹시 모를 예외
          }
        }
      });
    }
  
    renderResults(filtered);
  }
  
  /**
   * 검색/필터 결과를 테이블 형태로 렌더링
   *  - 목록 행(row)을 클릭하면 상세정보가 아래에 토글로 표시되도록 구성
   */
  function renderResults(dataArray) {
    const resultsDiv = document.getElementById('results');
  
    if (!dataArray || dataArray.length === 0) {
      resultsDiv.innerHTML = '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
      return;
    }
  
    // 테이블 헤더
    let html = `
      <table class="table table-bordered table-hover" style="table-layout: fixed; width: 100%;">
        <thead class="table-light">
          <tr>
            <th class="text-center align-middle text-nowrap w-10">구분</th>
            <th class="text-center align-middle text-nowrap w-10">분야</th>
            <th class="text-center align-middle text-nowrap w-50">제목</th>
            <th class="text-center align-middle text-nowrap w-10">일련번호</th>
            <th class="text-center align-middle text-nowrap w-10">회신일자</th>
          </tr>
        </thead>
        <tbody>
    `;
  
    dataArray.forEach((item, index) => {
      // 메인 행 (기본 정보 5개)
      html += `
        <tr class="search-result-row" data-row-index="${index}">
          <td class="text-center align-middle text-nowrap w-10">${item.구분 || ''}</td>
          <td class="text-center align-middle text-nowrap w-10">${item.분야 || ''}</td>
          <td class="align-middle w-50">${item.제목 || ''}</td>
          <td class="align-middle text-center w-10">${item.일련번호 || ''}</td>
          <td class="align-middle text-center w-10">${(item.회신일자 || '').split(' ')[0]}</td>
        </tr>
        <!-- 상세 행 (기본 숨김) -->
        <tr class="detail-row d-none" id="detail-${index}">
          <td colspan="5" class="bg-light">
            <div><strong>질의요지:</strong><br>${formatMultiline(item.질의요지)}</div>
            <br>
            <div class="mt-2"><strong>회답:</strong><br>${formatMultiline(item.회답)}</div>
            <br>
            <div class="mt-2"><strong>이유:</strong><br>${formatMultiline(item.이유)}</div>
          </td>
        </tr>
      `;
    });
  
    // 테이블 끝
    html += `
        </tbody>
      </table>
    `;
  
    // 결과 영역에 삽입
    resultsDiv.innerHTML = html;
  
    // 각 메인 행에 클릭 이벤트 등록 → 상세행 토글
    const rows = document.querySelectorAll('.search-result-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const index = row.getAttribute('data-row-index');
        const detailRow = document.getElementById(`detail-${index}`);
        // 부트스트랩의 d-none 클래스로 보여주기/감추기
        detailRow.classList.toggle('d-none');
      });
    });
  }
  
  /**
   * 개행(\n)을 <br>로 치환하여 표시
   *  - JSON에 여러 줄이 들어있는 경우 가독성 개선
   */
  function formatMultiline(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }

  document.getElementById('serialInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      performSearch();
    }
  });

  document.getElementById('keywordInput').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      performSearch();
    }
  });

  