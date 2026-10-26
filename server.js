const express = require('express');
const path = require('path');
const app = express();

const fs = require('fs');
const PORT = process.env.PORT || 8080;
const DIST_FOLDER = fs.existsSync(path.join(__dirname, 'dist/cloudflare/browser'))
  ? path.join(__dirname, 'dist/cloudflare/browser')
  : (fs.existsSync(path.join(__dirname, 'dist/cloudflare'))
    ? path.join(__dirname, 'dist/cloudflare')
    : path.join(__dirname, 'dist/coreui-free-angular-admin-template/browser'));

// Serve static files from the Angular dist directory
app.use(express.static(DIST_FOLDER));

// SPA fallback for HTML5 client-side routing
app.use((req, res) => {
  res.sendFile(path.join(DIST_FOLDER, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Node Express production server running on port ${PORT}`);
});
