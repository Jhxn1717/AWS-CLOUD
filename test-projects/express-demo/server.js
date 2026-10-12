const express = require('express');
const app = express();
const port = process.env.PORT || 4000;

app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    message: 'Hello from Node.js Express backend deployed natively on MyCloud PaaS!',
    pid: process.pid,
    port: parseInt(port, 10),
    platform: process.platform,
    timestamp: new Date().toISOString()
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[Express Demo] Server listening on http://0.0.0.0:${port}`);
});
