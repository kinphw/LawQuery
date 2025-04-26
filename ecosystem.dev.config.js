module.exports = {
  apps: [
    {
      name: "lawquery-backend-dev",
      script: "node_modules/ts-node/dist/bin.js",
      args: "src/backend/ts/index.ts",
      watch: ["src/backend/ts"],
      ignore_watch: ["node_modules", "logs"],
      env: {
        NODE_ENV: "development"
      }
    }
  ]
}
