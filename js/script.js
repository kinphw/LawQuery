let db = null;

/**
 * SQLite DB 로딩
 */
async function initDatabase() {
  // const wasmBinary = Uint8Array.from(atob(wasmBinaryBase64), c => c.charCodeAt(0));
  // const SQL = await initSqlJs({ wasmBinary });

  // 1) initSqlJs() 호출 시, WASM 파일 경로 대신 data URL로
  const SQL = await initSqlJs({
    locateFile: file => {
      // file: "sql-wasm.wasm" (sql.js가 기본적으로 요구)
      // data URL로 반환
      return "data:application/wasm;base64," + window.WASM_BASE64.trim();
    }
  });

  // const response = await fetch('data/dataset.db');
  // const arrayBuffer = await response.arrayBuffer();
  // db = new SQL.Database(new Uint8Array(arrayBuffer));

  db = new SQL.Database(getDatabaseBinary()); // use Local Binary
}

window.addEventListener('DOMContentLoaded', async () => {
  await initDatabase();
  // 페이지 로드 시 전체 데이터 표시
  let tableName = "db_i"; // 테이블명
  let query = `SELECT * FROM ${tableName}`;
  // const allData = executeQuery("SELECT * FROM dataset");
  const allData = executeQuery(query);
  renderResults(allData);
  
  // 검색 버튼 이벤트
  document.getElementById('searchBtn').addEventListener('click', performSearch);
});

function executeQuery(query, params = []) {
  const result = db.exec(query, params);
  if (!result.length) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function performSearch() {
  const typeValue = document.getElementById('typeSelect').value.trim();
  const serialValue = document.getElementById('serialInput').value.trim();
  const fieldValue = document.getElementById('fieldSelect').value.trim();
  const keywordValue = document.getElementById('keywordInput').value.trim();

  let query = "SELECT * FROM dataset WHERE 1=1";
  let conditions = [];

  // 구분 필터
  if (typeValue !== "전체") {
    conditions.push(`구분 = '${typeValue}'`);
  }

  // 일련번호 필터
  if (serialValue !== "") {
    conditions.push(`일련번호 LIKE '%${serialValue}%'`);
  }

  // 내용 검색
  if (keywordValue !== "") {
    if (fieldValue === "전체") {
      conditions.push(`(제목 LIKE '%${keywordValue}%' OR 
                      질의요지 LIKE '%${keywordValue}%' OR 
                      회답 LIKE '%${keywordValue}%' OR 
                      이유 LIKE '%${keywordValue}%')`);
    } else {
      conditions.push(`${fieldValue} LIKE '%${keywordValue}%'`);
    }
  }

  if (conditions.length > 0) {
    query += " AND " + conditions.join(" AND ");
  }

  const filtered = executeQuery(query);
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

