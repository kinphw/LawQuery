// ecosystem.config.js
module.exports = {
    apps: [
      {
        name: "lawquery-backend",
        script: "src/backend/ts/index.ts",
        interpreter: "cmd.exe",
        interpreter_args: "/c node_modules\\.bin\\ts-node.cmd",
        watch: ["src/backend/ts"],
        ignore_watch: ["node_modules"],
        env: {
          NODE_ENV: "development"
        }
      }
    ]
  }
  