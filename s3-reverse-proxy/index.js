const express = require('express');
const httpProxy = require('http-proxy');
require('dotenv').config();

const app = express();
const port = 8000;
const BASE_PATH = process.env.BASE_PATH;

// Create proxy instance
const proxy = httpProxy.createProxyServer({});

// Middleware for handling proxying
app.use((req, res) => {
    try {
        const hostname = req.hostname;
        const subdomain = hostname.split('.')[0]; // first part of domain

        const resolveTo = `${BASE_PATH}/${subdomain}`;
        console.log(`Proxying request to: ${resolveTo}`);

        proxy.web(req, res, {
            target: resolveTo,
            changeOrigin: true,
            secure: false
        }, (err) => {
            console.error('Proxy error:', err.message);
            res.status(502).send('Bad Gateway');
        });
    } catch (err) {
        console.error('Handler error:', err.message);
        res.status(500).send('Internal Server Error');
    }
});

proxy.on('proxyReq', (proxyReq, req, res) => {
  const url = req.url;
  if (url === '/') {
    proxyReq.path += 'index.html';
  }
  return proxyReq;
});

// Start server
app.listen(port, () => {
    console.log(`S3 Reverse Proxy running on port ${port}`);
});
