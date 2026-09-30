const appRoot = process.env.ALIYUN_APP_ROOT || `${__dirname}/../..`;

module.exports = {
  apps: [
    {
      name: "xueli-admin",
      cwd: __dirname,
      script: "server.js",
      interpreter: process.execPath,
      node_args: [`--env-file=${appRoot}/shared/.env.production`],
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 5000,
      time: true,
      out_file: `${appRoot}/logs/output.log`,
      error_file: `${appRoot}/logs/error.log`,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3001",
      },
    },
  ],
};
