import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import P from 'pino'
import http from 'node:http'

const TOKEN   = '9148166015:AAEFLSQC6Dlf6mfj3RmehYZ41lzw97P6r3Q'
const CHAT_ID = '8181943471'
const NUMBER  = '93705893109'

http.createServer((_, res) => res.end('ok')).listen(process.env.PORT || 3000)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

let last = 0
async function send(text) {
  const gap = 1100 - (Date.now() - last)
  if (gap > 0) await sleep(gap)
  last = Date.now()
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID, text: text.slice(0, 4000),
      parse_mode: 'HTML', disable_web_page_preview: true,
    }),
  }).catch(() => {})
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({ version, auth: state, logger: P({ level: 'silent' }) })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', u => {
    if (u.connection === 'open') { console.log('LINKED'); send('WhatsApp linked.') }
    if (u.connection === 'close') {
      const c = u.lastDisconnect?.error?.output?.statusCode
      if (c === DisconnectReason.loggedOut) { console.log('LOGGED OUT'); send('Unlinked. Re-pair needed.') }
      else start()
    }
  })

  setTimeout(async () => {
    try {
      const code = await sock.requestPairingCode(NUMBER)
      console.log('\n==== PAIRING CODE:', code, '====\n')
    } catch (e) { console.error(e.message) }
  }, 4000)

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      const jid = m.key.remoteJid || ''
      const who = m.key.fromMe ? 'ME' : (m.pushName || jid.split('@')[0])
      const msg = m.message || {}
      const text = msg.conversation || msg.extendedTextMessage?.text
                || msg.imageMessage?.caption || msg.videoMessage?.caption || ''
      send(`<b>${esc(who)}</b>\n<pre>${esc(text || '[' + Object.keys(msg)[0] + ']')}</pre>`)
    }
  })
}

start()