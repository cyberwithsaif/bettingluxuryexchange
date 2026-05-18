// PM2 process manifest — bare-metal deployment fallback when not using Docker.
// pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "exch-api",
      cwd: "../apps/api",
      script: "dist/main.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production", API_PORT: 4000 },
    },
    {
      name: "exch-web",
      cwd: "../apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      max_memory_restart: "512M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "exch-admin",
      cwd: "../apps/admin",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      instances: 1,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production" },
    },
  ],
};
