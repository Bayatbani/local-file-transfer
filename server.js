const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const UPLOADS_DIR = 'uploads';

// ایجاد پوشه آپلود اگر وجود نداشته باشد
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// تنظیمات multer برای آپلود فایل
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// میدلور برای فایل‌های استاتیک
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));

// WebSocket برای ارتباط بلادرنگ
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// روت برای آپلود فایل
app.post('/upload', upload.array('files'), (req, res) => {
  const fileInfos = req.files.map(file => ({
    name: file.originalname,
    size: file.size,
    type: file.mimetype,
    url: `/uploads/${file.filename}`
  }));
  
  // اطلاع رسانی به همه کلاینت‌ها
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'new_files',
        files: fileInfos
      }));
    }
  });
  
  res.json({ success: true, files: fileInfos });
});

// روت برای دریافت لیست فایل‌ها
app.get('/files', (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan files' });
    }
    
    const fileInfos = files.map(file => {
      const stat = fs.statSync(path.join(UPLOADS_DIR, file));
      return {
        name: file,
        size: stat.size,
        url: `/uploads/${file}`,
        uploadedAt: stat.birthtime
      };
    });
    
    res.json(fileInfos);
  });
});

// شروع سرور
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Local network access: http://${getLocalIpAddress()}:${PORT}`);
});

// تابع برای دریافت آدرس IP محلی
function getLocalIpAddress() {
  const interfaces = require('os').networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}