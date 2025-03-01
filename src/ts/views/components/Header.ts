class Header {
    render(currentPage: 'law' | 'interpretation'): string {
      return `
        <header class="text-center p-3 border mb-4 bg-light">
          <h1>전자금융 법률, 유권해석, 비조치의견서 검색/조회</h1>
          <div>
            <button class="btn ${currentPage === 'law' ? 'btn-primary' : 'btn-secondary'} me-2" 
              onclick="location.href='law.html'">법률조회</button>
            <button class="btn ${currentPage === 'interpretation' ? 'btn-primary' : 'btn-secondary'}" 
              onclick="location.href='index.html'">유권해석조회</button>
          </div>
        </header>`;
    }
}
window.Header = Header;