module.exports = {
  apps: [
    {
      name: "websec-stand-dev",
      cwd: "/var/www/websec-stand",
      script: "yarn",
      args: "dev",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
