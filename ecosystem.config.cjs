module.exports = {
  apps: [
    {
      name: 'citizen-0-web',
      cwd: '/home/ubuntu/citizen-0/packages/web',
      script: '/home/ubuntu/citizen-0/node_modules/next/dist/bin/next',
      args: 'start -p 3010',
      env: {
        NODE_ENV: 'production',
        PORT: '3010',
        NEXT_BASE_PATH: '/sites/citizen-0',
        NEXT_PUBLIC_BASE_PATH: '/sites/citizen-0',
        DATA_DIR: '/home/ubuntu/citizen-0/data',
      },
    },
  ],
};
