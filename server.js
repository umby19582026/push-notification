const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Trova IP automaticamente
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = process.env.PORT || 3000;

// Per Railway/produzione, usa l'host corretto
const HOST = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '0.0.0.0';

// Genera chiavi VAPID (solo per demo - in produzione usa chiavi permanenti)
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Chiavi VAPID generate:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Database in-memory per le subscription (in produzione usa un database reale)
const subscriptions = [];

// Endpoint per registrare una subscription
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  // Evita duplicati
  const exists = subscriptions.find(sub => 
    sub.endpoint === subscription.endpoint
  );
  
  if (!exists) {
    subscriptions.push(subscription);
    console.log('Nuova subscription registrata:', subscription.endpoint);
  }
  
  res.status(201).json({ success: true, count: subscriptions.length });
});

// Endpoint per rimuovere una subscription
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  const index = subscriptions.findIndex(sub => sub.endpoint === endpoint);
  
  if (index > -1) {
    subscriptions.splice(index, 1);
    console.log('Subscription rimossa:', endpoint);
  }
  
  res.json({ success: true, count: subscriptions.length });
});

// Endpoint per ottenere tutte le subscription
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// Endpoint per inviare notifica a tutti i dispositivi
app.post('/api/push', async (req, res) => {
  const { title, message, icon, url } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: 'Title e message sono obbligatori' });
  }
  
  const payload = JSON.stringify({
    title,
    message,
    url: url || '/',
    timestamp: Date.now()
  });
  
  const promises = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload);
      return { success: true, endpoint: subscription.endpoint };
    } catch (error) {
      console.error('Errore invio push:', error);
      // Rimuovi subscription non valide
      if (error.statusCode === 410 || error.statusCode === 404) {
        const index = subscriptions.findIndex(sub => sub.endpoint === subscription.endpoint);
        if (index > -1) subscriptions.splice(index, 1);
      }
      return { success: false, endpoint: subscription.endpoint, error: error.message };
    }
  });
  
  const results = await Promise.allSettled(promises);
  const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  
  res.json({
    success: true,
    sent,
    total: subscriptions.length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
  });
});

// Endpoint per ottenere la chiave pubblica VAPID
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Endpoint per ottenere URL mobile
app.get('/api/mobile-url', (req, res) => {
  res.json({ 
    url: `http://${LOCAL_IP}:${PORT}`,
    ip: LOCAL_IP,
    port: PORT
  });
});

// Test route - pagina semplice
app.get('/test', (req, res) => {
  console.log('TEST: Richiesta ricevuta da:', req.ip);
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// Servi l'interfaccia principale
app.get('/', (req, res) => {
  console.log('\n=== RICHIESTA RICEVUTA ===');
  console.log('IP:', req.ip);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Host:', req.headers['host']);
  console.log('========================\n');
  
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Push</title><style>body{font-family:Arial;padding:40px;text-align:center;background:#f5f5f5;}h1{color:#212121;}</style></head><body><h1>FUNZIONA!</h1><p>Se vedi questo, il server funziona.</p><p>IP richiesta: ' + req.ip + '</p></body></html>';
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  console.log('Risposta inviata');
});

// Servi l'interfaccia admin
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'admin.html');
  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('Errore caricamento admin.html:', err);
      // Fallback: ritorna admin inline
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin</title><style>body{font-family:Arial;padding:20px;background:#f5f5f5}.container{max-width:800px;margin:0 auto;background:white;padding:40px;border-radius:8px}h1{color:#212121}input,textarea{width:100%;padding:10px;margin:10px 0;border:1px solid #e0e0e0;border-radius:6px}button{background:#212121;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer}.qr{margin:20px 0;padding:20px;background:#fafafa;border-radius:8px;text-align:center}</style></head><body><div class="container"><h1>Admin Control Panel</h1><div class="qr"><p>QR Code URL:</p><input type="text" id="url" placeholder="https://push-notification-f2on.onrender.com" style="font-size:14px"><button onclick="genQR()">Genera QR</button><div id="qrcode"></div></div><form id="form" onsubmit="sendPush(event)"><h2>Invia Notifica</h2><input type="text" id="title" placeholder="Titolo" required><textarea id="msg" placeholder="Messaggio" required></textarea><button type="submit">Invia</button></form><div id="result"></div></div><script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script><script>function genQR(){const url=document.getElementById("url").value;if(!url)return;document.getElementById("qrcode").innerHTML="";const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(url);document.getElementById("qrcode").innerHTML=\'<img src="\'+qrUrl+\'" style="margin:10px auto;display:block">\'}async function sendPush(e){e.preventDefault();const res=await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:document.getElementById("title").value,message:document.getElementById("msg").value})});const data=await res.json();document.getElementById("result").innerHTML="<p>Inviato a "+data.sent+" di "+data.total+" dispositivi</p>"}</script></body></html>');
        <!DOCTYPE html>
        <html>
        <head>
          <title>Admin - Push Notifications</title>
          <style>
            body { font-family: Arial; padding: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #212121; }
            input, textarea { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #e0e0e0; border-radius: 6px; }
            button { background: #212121; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; }
            .qr { margin: 20px 0; padding: 20px; background: #fafafa; border-radius: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Admin Control Panel</h1>
            <div class="qr">
              <p>QR Code URL:</p>
              <input type="text" id="url" placeholder="https://push-notification-f2on.onrender.com" style="font-size: 14px;">
              <button onclick="genQR()">Genera QR</button>
              <div id="qrcode"></div>
            </div>
            <form id="form" onsubmit="sendPush(event)">
              <h2>Invia Notifica</h2>
              <input type="text" id="title" placeholder="Titolo" required>
              <textarea id="msg" placeholder="Messaggio" required></textarea>
              <button type="submit">Invia</button>
            </form>
            <div id="result"></div>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
          <script>
            function genQR() {
              const url = document.getElementById('url').value;
              if (!url) return;
              document.getElementById('qrcode').innerHTML = '';
              const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
              document.getElementById('qrcode').innerHTML = '<img src="' + qrUrl + '" style="margin: 10px auto; display: block;">';
            }
            async function sendPush(e) {
              e.preventDefault();
              const res = await fetch('/api/push', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  title: document.getElementById('title').value,
                  message: document.getElementById('msg').value
                })
              });
              const data = await res.json();
              document.getElementById('result').innerHTML = '<p>Inviato a ' + data.sent + ' di ' + data.total + ' dispositivi</p>';
            }
          </script>
        </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`\n✓ Server avviato`);
  console.log(`✓ Admin: http://localhost:${PORT}/admin`);
  console.log(`✓ Mobile: http://${LOCAL_IP}:${PORT}`);
  console.log(`\n📱 PER CONNETTERE IL TELEFONO:`);
  console.log(`   1. PC e telefono sulla stessa WiFi`);
  console.log(`   2. Apri sul PC: http://${LOCAL_IP}:${PORT}/admin`);
  console.log(`   3. Nel campo QR code incolla: http://${LOCAL_IP}:${PORT}`);
  console.log(`   4. Scansiona QR code dal telefono`);
  console.log(`\n⚠️  Se non funziona: esegui setup-firewall.bat\n`);
});

const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Trova IP automaticamente
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = process.env.PORT || 3000;

// Per Railway/produzione, usa l'host corretto
const HOST = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '0.0.0.0';

// Genera chiavi VAPID (solo per demo - in produzione usa chiavi permanenti)
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Chiavi VAPID generate:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Database in-memory per le subscription (in produzione usa un database reale)
const subscriptions = [];

// Endpoint per registrare una subscription
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  // Evita duplicati
  const exists = subscriptions.find(sub => 
    sub.endpoint === subscription.endpoint
  );
  
  if (!exists) {
    subscriptions.push(subscription);
    console.log('Nuova subscription registrata:', subscription.endpoint);
  }
  
  res.status(201).json({ success: true, count: subscriptions.length });
});

// Endpoint per rimuovere una subscription
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  const index = subscriptions.findIndex(sub => sub.endpoint === endpoint);
  
  if (index > -1) {
    subscriptions.splice(index, 1);
    console.log('Subscription rimossa:', endpoint);
  }
  
  res.json({ success: true, count: subscriptions.length });
});

// Endpoint per ottenere tutte le subscription
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// Endpoint per inviare notifica a tutti i dispositivi
app.post('/api/push', async (req, res) => {
  const { title, message, icon, url } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: 'Title e message sono obbligatori' });
  }
  
  const payload = JSON.stringify({
    title,
    message,
    url: url || '/',
    timestamp: Date.now()
  });
  
  const promises = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload);
      return { success: true, endpoint: subscription.endpoint };
    } catch (error) {
      console.error('Errore invio push:', error);
      // Rimuovi subscription non valide
      if (error.statusCode === 410 || error.statusCode === 404) {
        const index = subscriptions.findIndex(sub => sub.endpoint === subscription.endpoint);
        if (index > -1) subscriptions.splice(index, 1);
      }
      return { success: false, endpoint: subscription.endpoint, error: error.message };
    }
  });
  
  const results = await Promise.allSettled(promises);
  const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  
  res.json({
    success: true,
    sent,
    total: subscriptions.length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
  });
});

// Endpoint per ottenere la chiave pubblica VAPID
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Endpoint per ottenere URL mobile
app.get('/api/mobile-url', (req, res) => {
  res.json({ 
    url: `http://${LOCAL_IP}:${PORT}`,
    ip: LOCAL_IP,
    port: PORT
  });
});

// Test route - pagina semplice
app.get('/test', (req, res) => {
  console.log('TEST: Richiesta ricevuta da:', req.ip);
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// Servi l'interfaccia principale
app.get('/', (req, res) => {
  console.log('\n=== RICHIESTA RICEVUTA ===');
  console.log('IP:', req.ip);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Host:', req.headers['host']);
  console.log('========================\n');
  
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Push</title><style>body{font-family:Arial;padding:40px;text-align:center;background:#f5f5f5;}h1{color:#212121;}</style></head><body><h1>FUNZIONA!</h1><p>Se vedi questo, il server funziona.</p><p>IP richiesta: ' + req.ip + '</p></body></html>';
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  console.log('Risposta inviata');
});

// Servi l'interfaccia admin
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'admin.html');
  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('Errore caricamento admin.html:', err);
      // Fallback: ritorna admin inline
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Admin - Push Notifications</title>
          <style>
            body { font-family: Arial; padding: 20px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; }
            h1 { color: #212121; }
            input, textarea { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #e0e0e0; border-radius: 6px; }
            button { background: #212121; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; }
            .qr { margin: 20px 0; padding: 20px; background: #fafafa; border-radius: 8px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Admin Control Panel</h1>
            <div class="qr">
              <p>QR Code URL:</p>
              <input type="text" id="url" placeholder="https://push-notification-f2on.onrender.com" style="font-size: 14px;">
              <button onclick="genQR()">Genera QR</button>
              <div id="qrcode"></div>
            </div>
            <form id="form" onsubmit="sendPush(event)">
              <h2>Invia Notifica</h2>
              <input type="text" id="title" placeholder="Titolo" required>
              <textarea id="msg" placeholder="Messaggio" required></textarea>
              <button type="submit">Invia</button>
            </form>
            <div id="result"></div>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
          <script>
            function genQR() {
              const url = document.getElementById('url').value;
              if (!url) return;
              document.getElementById('qrcode').innerHTML = '';
              const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
              document.getElementById('qrcode').innerHTML = '<img src="' + qrUrl + '" style="margin: 10px auto; display: block;">';
            }
            async function sendPush(e) {
              e.preventDefault();
              const res = await fetch('/api/push', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  title: document.getElementById('title').value,
                  message: document.getElementById('msg').value
                })
              });
              const data = await res.json();
              document.getElementById('result').innerHTML = '<p>Inviato a ' + data.sent + ' di ' + data.total + ' dispositivi</p>';
            }
          </script>
        </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`\n✓ Server avviato`);
  console.log(`✓ Admin: http://localhost:${PORT}/admin`);
  console.log(`✓ Mobile: http://${LOCAL_IP}:${PORT}`);
  console.log(`\n📱 PER CONNETTERE IL TELEFONO:`);
  console.log(`   1. PC e telefono sulla stessa WiFi`);
  console.log(`   2. Apri sul PC: http://${LOCAL_IP}:${PORT}/admin`);
  console.log(`   3. Nel campo QR code incolla: http://${LOCAL_IP}:${PORT}`);
  console.log(`   4. Scansiona QR code dal telefono`);
  console.log(`\n⚠️  Se non funziona: esegui setup-firewall.bat\n`);
});


  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = process.env.PORT || 3000;

// Per Railway/produzione, usa l'host corretto
const HOST = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '0.0.0.0';

// Genera chiavi VAPID (solo per demo - in produzione usa chiavi permanenti)
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Chiavi VAPID generate:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Database in-memory per le subscription (in produzione usa un database reale)
const subscriptions = [];

// Endpoint per registrare una subscription
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  // Evita duplicati
  const exists = subscriptions.find(sub => 
    sub.endpoint === subscription.endpoint
  );
  
  if (!exists) {
    subscriptions.push(subscription);
    console.log('Nuova subscription registrata:', subscription.endpoint);
  }
  
  res.status(201).json({ success: true, count: subscriptions.length });
});

// Endpoint per rimuovere una subscription
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  const index = subscriptions.findIndex(sub => sub.endpoint === endpoint);
  
  if (index > -1) {
    subscriptions.splice(index, 1);
    console.log('Subscription rimossa:', endpoint);
  }
  
  res.json({ success: true, count: subscriptions.length });
});

// Endpoint per ottenere tutte le subscription
app.get('/api/subscriptions', (req, res) => {
  res.json({ count: subscriptions.length, subscriptions });
});

// Endpoint per inviare notifica a tutti i dispositivi
app.post('/api/push', async (req, res) => {
  const { title, message, icon, url } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: 'Title e message sono obbligatori' });
  }
  
  const payload = JSON.stringify({
    title,
    message,
    url: url || '/',
    timestamp: Date.now()
  });
  
  const promises = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, payload);
      return { success: true, endpoint: subscription.endpoint };
    } catch (error) {
      console.error('Errore invio push:', error);
      // Rimuovi subscription non valide
      if (error.statusCode === 410 || error.statusCode === 404) {
        const index = subscriptions.findIndex(sub => sub.endpoint === subscription.endpoint);
        if (index > -1) subscriptions.splice(index, 1);
      }
      return { success: false, endpoint: subscription.endpoint, error: error.message };
    }
  });
  
  const results = await Promise.allSettled(promises);
  const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  
  res.json({
    success: true,
    sent,
    total: subscriptions.length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
  });
});

// Endpoint per ottenere la chiave pubblica VAPID
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Endpoint per ottenere URL mobile
app.get('/api/mobile-url', (req, res) => {
  res.json({ 
    url: `http://${LOCAL_IP}:${PORT}`,
    ip: LOCAL_IP,
    port: PORT
  });
});

// Test route - pagina semplice
app.get('/test', (req, res) => {
  console.log('TEST: Richiesta ricevuta da:', req.ip);
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// Servi l'interfaccia principale
app.get('/', (req, res) => {
  console.log('\n=== RICHIESTA RICEVUTA ===');
  console.log('IP:', req.ip);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('Host:', req.headers['host']);
  console.log('========================\n');
  
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Push</title><style>body{font-family:Arial;padding:40px;text-align:center;background:#f5f5f5;}h1{color:#212121;}</style></head><body><h1>FUNZIONA!</h1><p>Se vedi questo, il server funziona.</p><p>IP richiesta: ' + req.ip + '</p></body></html>';
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
  console.log('Risposta inviata');
});

// Servi l'interfaccia admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`\n✓ Server avviato`);
  console.log(`✓ Admin: http://localhost:${PORT}/admin`);
  console.log(`✓ Mobile: http://${LOCAL_IP}:${PORT}`);
  console.log(`\n📱 PER CONNETTERE IL TELEFONO:`);
  console.log(`   1. PC e telefono sulla stessa WiFi`);
  console.log(`   2. Apri sul PC: http://${LOCAL_IP}:${PORT}/admin`);
  console.log(`   3. Nel campo QR code incolla: http://${LOCAL_IP}:${PORT}`);
  console.log(`   4. Scansiona QR code dal telefono`);
  console.log(`\n⚠️  Se non funziona: esegui setup-firewall.bat\n`);
});

