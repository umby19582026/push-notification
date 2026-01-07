# 📱 Push Notification PWA

Una Progressive Web App (PWA) che permette di inviare notifiche push da un PC a N dispositivi mobili installati.

## 🚀 Funzionalità

- **PWA Installabile**: L'app può essere installata su qualsiasi dispositivo mobile (Android/iOS)
- **Notifiche Push**: Ricevi notifiche push in tempo reale
- **Interfaccia Admin**: Dashboard web per inviare messaggi a tutti i dispositivi registrati
- **Multi-dispositivo**: Supporta N dispositivi simultaneamente

## 📋 Requisiti

- Node.js 14+ 
- npm o yarn

## 🛠️ Installazione

1. **Installa le dipendenze**:
```bash
npm install
```

2. **Avvia il server**:
```bash
npm start
```

Il server si avvierà su `http://localhost:3000`

## 📱 Configurazione Dispositivi

### Passo 1: Apri la PWA sul dispositivo mobile

1. Apri il browser sul tuo dispositivo mobile (Chrome consigliato)
2. Vai all'indirizzo: `http://[IP-DEL-TUO-PC]:3000`
   - Esempio: `http://192.168.1.100:3000`
   - Per trovare l'IP del tuo PC:
     - Windows: `ipconfig` nel terminale
     - Mac/Linux: `ifconfig` nel terminale

### Passo 2: Installa la PWA

1. Clicca su "Abilita Notifiche"
2. Accetta i permessi per le notifiche
3. Se disponibile, clicca su "Installa App" per installare la PWA sul dispositivo
4. Verifica che lo stato mostri "Notifiche abilitate!"

### Passo 3: Ripeti per ogni dispositivo

Ripeti i passi 1-2 per ogni dispositivo su cui vuoi ricevere notifiche.

## 💻 Invio Notifiche dal PC

1. Apri il browser sul tuo PC
2. Vai su: `http://localhost:3000/admin`
3. Compila il form:
   - **Titolo**: Il titolo della notifica
   - **Messaggio**: Il messaggio da inviare
   - **URL** (opzionale): Link da aprire quando si clicca sulla notifica
4. Clicca su "Invia a tutti i dispositivi"

La notifica verrà inviata istantaneamente a tutti i dispositivi registrati!

## 🔧 Configurazione Avanzata

### Chiavi VAPID Permanenti

Per uso in produzione, genera chiavi VAPID permanenti:

```bash
npx web-push generate-vapid-keys
```

Poi modifica `server.js` e sostituisci:
```javascript
const vapidKeys = webpush.generateVAPIDKeys();
```

Con:
```javascript
const vapidKeys = {
  publicKey: 'LA_TUA_PUBLIC_KEY',
  privateKey: 'LA_TUA_PRIVATE_KEY'
};
```

### Porta Personalizzata

Per cambiare la porta, usa la variabile d'ambiente:
```bash
PORT=8080 npm start
```

## 📂 Struttura Progetto

```
push/
├── server.js          # Server Node.js/Express
├── package.json       # Dipendenze
├── public/
│   ├── index.html     # Interfaccia PWA
│   ├── admin.html     # Interfaccia admin
│   ├── sw.js          # Service Worker
│   ├── manifest.json  # Manifest PWA
│   ├── icon-192.png   # Icona 192x192
│   └── icon-512.png   # Icona 512x512
└── README.md
```

## 🔒 Sicurezza

**⚠️ IMPORTANTE**: Questa è una versione demo per uso locale/development.

Per produzione:
- Usa HTTPS (necessario per Web Push API in produzione)
- Implementa autenticazione per l'interfaccia admin
- Usa un database persistente invece della memoria
- Configura chiavi VAPID permanenti

## 🌐 Accesso da Rete Locale

Per permettere ai dispositivi mobili di accedere:

1. **Trova il tuo IP locale**:
   - Windows: `ipconfig` → cerca "IPv4 Address"
   - Mac/Linux: `ifconfig` o `ip addr`

2. **Assicurati che il firewall permetta connessioni sulla porta 3000**

3. **Accedi da mobile**: `http://[TUO-IP]:3000`

## 📝 Note

- Le notifiche funzionano solo su dispositivi che hanno accettato i permessi
- Se un dispositivo non riceve notifiche, potrebbe essere necessario ri-registrarlo
- Le subscription vengono salvate in memoria: al riavvio del server, i dispositivi dovranno ri-registrarsi

## 🐛 Risoluzione Problemi

**Notifiche non arrivano?**
- Verifica che i permessi siano concessi sul dispositivo
- Controlla che il service worker sia registrato
- Verifica che il dispositivo sia connesso alla stessa rete del server

**Impossibile accedere da mobile?**
- Verifica che PC e dispositivo siano sulla stessa rete WiFi
- Controlla le impostazioni firewall del PC
- Usa l'IP locale invece di localhost

## 📄 Licenza

MIT


