/**
 * Header.ts
 * ------------------------
 * 페이지 공통사용할 헤더 컴포넌트 (렌더링대상)
 * 
 * 작성자: kinphw
 * 작성일: 2025-03-02
 * 버전: 0.0.1
 */
class Header {

  render(currentPage: 'law' | 'interpretation'): string {
      const html = `
      <header class="text-center p-3 border bg-light">
          <div class="d-flex justify-content-between align-items-center mb-2">
              <img src="assets/img/penguin.PNG" alt="Penguin" style="height: 40px;">
              <h2 class="mb-0">Law Query</h2>
              <button class="btn btn-link" id="infoButton">
                  <i class="fas fa-question-circle fs-4"></i>
              </button>
          </div>          
          <div>
              <button class="btn ${currentPage === 'law' ? 'btn-primary' : 'btn-secondary'} me-2" 
                  onclick="location.href='law.html'">법률조회</button>
              <button class="btn ${currentPage === 'interpretation' ? 'btn-primary' : 'btn-secondary'}" 
                  onclick="location.href='index.html'">유권해석조회</button>
          </div>
      </header>`;

      // 렌더링 후 이벤트 바인딩
      // document.getElementById('infoButton')?.addEventListener('click', 
      //     () => this.showInfo());

      return html;
  }

  setInfoButtonHandler(): void {
    document.getElementById('infoButton')?.addEventListener('click', 
        () => this.showInfo());
  }    

  private showInfo(): void {
      alert(`
LawQuery_금융법령, 유권해석, 비조치의견서 검색 및 조회를 위한 로컬 웹 어플리케이션입니다.        
kinphw (github.com/kinphw/LawQuery)
v0.1.0 (250304)
Apache license 2.0
`);
  }
}

// Initialize header instance for global access
window.Header = Header;