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

