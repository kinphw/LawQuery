module.exports = {
    apps: [
      {
        name: "lawquery-backend-prod",
        script: "src/backend/js/index.js", // 컴파일된 js 실행
        watch: false,
        env: {
          NODE_ENV: "production"
        }
      }
    ]
  };
  