class LawQuery {
    constructor() {
        this.db = null;
    }

    async init() {
        await this.loadDatabase();
        console.log("✅ LawQuery 초기화 완료!");

        this.setupEventListeners();
        
        // 최초 데이터 로드
        this.loadInitialData();
    }

    async loadDatabase() {
        console.log("⏳ SQLite DB 로드 중...");
        const SQL = await initSqlJs({
            locateFile: file => "data:application/wasm;base64," + window.WASM_BASE64.trim()
        });

        this.db = new SQL.Database(getDatabaseBinary());
        console.log("✅ SQLite DB 로드 완료!");
    }

    executeQuery(query, params = []) {
        if (!this.db) {
            console.error("❌ DB가 아직 로드되지 않았습니다.");
            return [];
        }

        const result = this.db.exec(query, params);
        if (!result.length) return [];

        const columns = result[0].columns;
        return result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => obj[col] = row[i]);
            return obj;
        });
    }

    setupEventListeners() {
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('serialInput').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.performSearch();
            }
        });
        document.getElementById('keywordInput').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.performSearch();
            }
        });
    }

    loadInitialData() {
        let query = "SELECT * FROM db_i";
        const allData = this.executeQuery(query);
        this.renderResults(allData);
    }

    performSearch() {
        const typeValue = document.getElementById('typeSelect').value.trim();
        const serialValue = document.getElementById('serialInput').value.trim();
        const fieldValue = document.getElementById('fieldSelect').value.trim();
        const keywordValue = document.getElementById('keywordInput').value.trim();

        let query = "SELECT * FROM db_i WHERE 1=1";
        let conditions = [];

        if (typeValue !== "전체") {
            conditions.push(`구분 = '${typeValue}'`);
        }

        if (serialValue !== "") {
            conditions.push(`일련번호 LIKE '%${serialValue}%'`);
        }

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

        const filtered = this.executeQuery(query);
        this.renderResults(filtered);
    }

    renderResults(dataArray) {
        const resultsDiv = document.getElementById('results');

        if (!dataArray || dataArray.length === 0) {
            resultsDiv.innerHTML = '<div class="alert alert-warning">검색 결과가 없습니다.</div>';
            return;
        }

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
                  <div><strong>질의요지:</strong><br>${this.formatMultiline(item.질의요지)}</div>
                  <br>
                  <div class="mt-2"><strong>회답:</strong><br>${this.formatMultiline(item.회답)}</div>
                  <br>
                  <div class="mt-2"><strong>이유:</strong><br>${this.formatMultiline(item.이유)}</div>
                </td>
              </tr>
            `;
        });

        html += `</tbody></table>`;
        resultsDiv.innerHTML = html;

        // 상세 정보 표시 토글
        document.querySelectorAll('.search-result-row').forEach(row => {
            row.addEventListener('click', () => {
                const index = row.getAttribute('data-row-index');
                const detailRow = document.getElementById(`detail-${index}`);
                detailRow.classList.toggle('d-none');
            });
        });
    }

    formatMultiline(text) {
        if (!text) return '';
        return text.replace(/\n/g, '<br>');
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const lawQueryInstance = new LawQuery();
    await lawQueryInstance.init();
});
