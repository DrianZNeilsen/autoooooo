const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

const token = '7093728416:AAE2HK-4Kmh-pWg1zYNYCnOKBkoZmpdkbMM';
const ADMIN_ID = '6553564125';
const bot = new TelegramBot(token, { polling: true });

const memberId = 'OK991701';
const apikey_orkut = '58632671730114162991701OKCT6B3AEF79F3A94937D9C2D4D7711D7E0C';
const pin = '6969';
const pw = '12345678';

const sessions = {};
let productCache = [];

function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .toString()
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/`/g, '\\`');
}
function toRupiah(number) {
  return number.toLocaleString('id-ID');
}
function hargaSetelahProfit(basePrice, role = 'user', kategori = '') {
  let margin = role === 'reseller' ? 1000 : 1500;
  return parseInt(basePrice) + margin;
}
function generateRandomFee() {
  return Math.floor(Math.random() * 90 + 10);
}
function ensureUser(user) {
  let users = [];
  if (fs.existsSync('user.json')) {
    try { users = JSON.parse(fs.readFileSync('user.json')); } catch (e) {}
  }
  if (!users.find(u => u.id === user.id)) {
    users.push({ id: user.id, username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '' });
    fs.writeFileSync('user.json', JSON.stringify(users, null, 2));
  }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function getNickname(product, userId, zoneId) {
  if (/mobile legends/i.test(product.produk || product.nama)) return `[ML] ${userId} (${zoneId})`;
  if (/pubg/i.test(product.produk || product.nama)) return `[PUBG] ${userId}`;
  if (/free fire/i.test(product.produk || product.nama)) return `[FF] ${userId}`;
  if (/genshin/i.test(product.produk || product.nama)) return `[GI] ${userId}`;
  if (/honor of king/i.test(product.produk || product.nama)) return `[HOK] ${userId}`;
  if (/call of duty/i.test(product.produk || product.nama)) return `[COD] ${userId}`;
  if (/eggy/i.test(product.produk || product.nama)) return `[Eggy] ${userId}`;
  if (/lord mobile/i.test(product.produk || product.nama)) return `[LordMobile] ${userId}`;
  return userId;
}

// === PRODUK .json DENGAN KEYBOARD PAGINATION ===
function sendProdukKeyboard(chatId, page = 0) {
  const produkList = JSON.parse(fs.readFileSync('produk.json'));
  const perPage = 10;
  const totalPages = Math.ceil(produkList.length / perPage);
  const currentProducts = produkList.slice(page * perPage, (page + 1) * perPage);

  let keyboard = [];
  for (let i = 0; i < currentProducts.length; i += 5) {
    keyboard.push(
      currentProducts.slice(i, i + 5).map(p => ({
        text: `${p.nama} (${p.stok})`
      }))
    );
  }
  let nav = [];
  if (page > 0) nav.push({ text: '⬅️ Prev' });
  if (page < totalPages - 1) nav.push({ text: 'Next ➡️' });
  if (nav.length) keyboard.push(nav);

  bot.sendMessage(chatId, 'Pilih produk:', {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });

  sessions[chatId] = { ...sessions[chatId], produkKeyboard: currentProducts, produkPage: page };
}

function sendProductPage(chatId, page, game = 'ml') {
  const perPage = 5;
  const totalPages = Math.ceil(productCache.length / perPage);
  const currentProducts = productCache.slice(page * perPage, (page + 1) * perPage);

  const buttons = currentProducts.map(p => [{
    text: `${p.keterangan || p.nama} - Rp${toRupiah(hargaSetelahProfit(p.harga))}`,
    callback_data: `${game}order_${p.kode}`
  }]);

  if (page > 0) buttons.push([{ text: '⬅️ Sebelumnya', callback_data: `${game}page_${page - 1}` }]);
  if (page < totalPages - 1) buttons.push([{ text: '➡️ Selanjutnya', callback_data: `${game}page_${page + 1}` }]);

  let title = '🛒 *Produk* ';
  if (game === 'ml') title += 'Mobile Legends';
  else if (game === 'pubg') title += 'PUBG';
  else if (game === 'ff') title += 'Free Fire';
  else if (game === 'hok') title += 'Honor of King';
  else if (game === 'genshin') title += 'Genshin Impact';
  else if (game === 'lordmobile') title += 'Lord Mobile';
  else if (game === 'cod') title += 'Call of Duty';
  else if (game === 'eggy') title += 'Eggy Party';

  bot.sendMessage(chatId, `${title}\nHalaman ${page + 1} dari ${totalPages}`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

// === TRANSAKSI OTOMATIS SEMUA ORDER (GAME/PULSA) ===
async function handleOrderGame(chatId, userId, produk, session, game) {
  let tujuan = '';
  let detailUser = '', userIdGame = '', zoneId = '';
  if (game === 'pulsa') {
    userIdGame = session.nomor;
    detailUser = `*Nomor HP:* ${escapeMarkdown(session.nomor)}`;
    tujuan = userIdGame;
  } else if (game === 'ml') {
    userIdGame = session.userId;
    zoneId = session.zoneId;
    tujuan = `${userIdGame}${zoneId}`;
    detailUser = `*User ID:* ${escapeMarkdown(userIdGame)}\n*Zone ID:* ${escapeMarkdown(zoneId)}`;
  } else {
    userIdGame = session.userId;
    tujuan = userIdGame;
    detailUser = `*User ID:* ${escapeMarkdown(userIdGame)}`;
  }
  const nickname = await getNickname(produk, userIdGame, zoneId);

  const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
  const harga = hargaSetelahProfit(produk.harga, 'user', produk.kategori);
  const fee = generateRandomFee();
  const total = harga + fee;

  const qrisImage = 'img/qris.jpg';
  const expireAt = Date.now() + 5 * 60000;
  const formattedTime = new Date(expireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

  let caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk:* ${escapeMarkdown(produk.keterangan || produk.nama)}\n${detailUser}\n*Nickname:* ${escapeMarkdown(nickname)}\n\nKategori: ${escapeMarkdown(produk.kategori || "-")}\nHarga: Rp${toRupiah(harga)} + 2 digit acak\nTotal: Rp${toRupiah(total)}\n\nBayar sebelum *${formattedTime}* untuk memproses pesanan ini.`;

  await bot.sendPhoto(chatId, fs.createReadStream(qrisImage), {
    caption,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '❌ Batalkan Pesanan', callback_data: `cancel_${userId}` }]]
    }
  });

  const interval = setInterval(async () => {
    if (Date.now() >= expireAt) {
      clearInterval(interval);
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Waktu pembayaran habis. Pesanan dibatalkan.');
    }
    try {
      const check = await axios.get(`https://gateway.okeconnect.com/api/mutasi/qris/${memberId}/${apikey_orkut}`);
      const found = check.data.data.find(i => i.type === 'CR' && i.qris === 'static' && parseInt(i.amount) === total);
      if (found) {
        clearInterval(interval);
        bot.sendMessage(chatId, '✅ Pembayaran diterima! Memproses pesanan...');
        let orderRes = await axios.get(`https://b2b.okeconnect.com/trx-v2?product=${produk.kode}&dest=${tujuan}&refID=${reffId}&memberID=${memberId}&pin=${pin}&password=${pw}`);
        let status = orderRes.data.status;
        let sn = orderRes.data.sn || "-";
        if (status === "GAGAL") {
          bot.sendMessage(chatId, `❌ Gagal: ${orderRes.data.message}`);
          delete sessions[userId];
          return;
        } else {
          bot.sendMessage(chatId, `⏳ *TRANSAKSI PENDING*\nProduk: ${escapeMarkdown(produk.keterangan || produk.nama)}\nReffID: ${reffId}\n${detailUser}\nNickname: ${nickname}\nHarga: Rp${toRupiah(harga)}\n\nTunggu proses...`, { parse_mode: 'Markdown' });
        }
        while (status !== "SUKSES") {
          await sleep(5000);
          let cek = await axios.get(`https://b2b.okeconnect.com/trx-v2?product=${produk.kode}&dest=${tujuan}&refID=${reffId}&memberID=${memberId}&pin=${pin}&password=${pw}`);
          status = cek.data.status;
          sn = cek.data.sn || "-";
          if (status === "GAGAL") {
            bot.sendMessage(chatId, `❌ Pesanan dibatalkan!\nAlasan: ${cek.data.message}`);
            delete sessions[userId];
            return;
          }
          if (status === "SUKSES") {
            bot.sendMessage(chatId, `✅ *TRANSAKSI SUKSES*\n\nProduk: ${escapeMarkdown(produk.keterangan || produk.nama)}\nReffID: ${reffId}\n${detailUser}\nNickname: ${nickname}\nSN: ${sn}\n\nTerima kasih sudah order!`, { parse_mode: 'Markdown' });
            delete sessions[userId];
            return;
          }
        }
      }
    } catch (err) {
      console.log('ERROR:', err.message);
    }
  }, 10000);

  sessions[userId] = { ...sessions[userId], interval };
  session.step = null;
}

// ==== HANDLER START ====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  ensureUser(msg.from);

  let menu = [
    { text: '🛍 Produk' },
    { text: '🎮 Order ML' },
    { text: '🔫 Order PUBG' },
    { text: '🔥 Order Free Fire' },
    { text: '👑 Order HOK' },
    { text: '🌌 Order Genshin' },
    { text: '⚔️ Order Lord Mobile' },
    { text: '🎯 Order COD' },
    { text: '🥚 Order Eggy Party' },
    { text: '📱 Order Pulsa' }
  ];
  if (userId === ADMIN_ID) {
    menu.push({ text: '🛠 Manager' });
    menu.push({ text: '📢 Broadcast' });
  }
  let keyboard = [];
  for (let i = 0; i < menu.length; i += 3) {
    keyboard.push(menu.slice(i, i + 3));
  }
  bot.sendMessage(chatId, `Selamat datang di Auto Order Bot!\n\nSilakan pilih menu di bawah ini:`, {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

// ==== HANDLER MESSAGE ====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text?.toLowerCase() || '';
  const session = sessions[userId];
  ensureUser(msg.from);

  // === Broadcast
  if (msg.text === '📢 Broadcast' && userId === ADMIN_ID) {
    sessions[userId] = { mode: 'awaiting_broadcast' };
    return bot.sendMessage(chatId, 'Ketik pesan yang ingin di-broadcast ke seluruh pengguna:');
  }
  if (session && session.mode === 'awaiting_broadcast' && userId === ADMIN_ID) {
    const users = fs.existsSync('user.json') ? JSON.parse(fs.readFileSync('user.json')) : [];
    let sukses = 0, gagal = 0;
    for (const u of users) {
      try { await bot.sendMessage(u.id, `📢 Pesan Broadcast dari Admin:\n\n${msg.text}`); sukses++; } catch (e) { gagal++; }
    }
    delete sessions[userId];
    return bot.sendMessage(chatId, `Broadcast selesai!\nBerhasil: ${sukses}\nGagal: ${gagal}`);
  }
  // === Batalkan transaksi
  if (text === 'batal') {
    if (sessions[userId] && sessions[userId].interval) {
      clearInterval(sessions[userId].interval);
      delete sessions[userId];
      bot.sendMessage(chatId, '❌ Semua transaksi Anda telah dibatalkan.');
    } else {
      bot.sendMessage(chatId, 'Tidak ada transaksi yang sedang berlangsung.');
    }
    return;
  }
  // === PRODUK .json (MENU PRODUK) DENGAN PAGINATION DAN OTOMATIS QRIS
  if (msg.text === '🛍 Produk') return sendProdukKeyboard(chatId, 0);

  if (sessions[chatId] && sessions[chatId].produkKeyboard) {
    if (msg.text === '⬅️ Prev') return sendProdukKeyboard(chatId, Math.max(0, (sessions[chatId].produkPage || 0) - 1));
    if (msg.text === 'Next ➡️') return sendProdukKeyboard(chatId, (sessions[chatId].produkPage || 0) + 1);
    const produk = sessions[chatId].produkKeyboard.find(p => msg.text.startsWith(p.nama));
    if (produk) {
      if (produk.stok < 1) return bot.sendMessage(chatId, '❌ Produk tidak tersedia atau stok habis.');
      const role = 'user';
      const basePrice = hargaSetelahProfit(produk.harga, role);
      const fee = generateRandomFee();
      const total = basePrice + fee;
      const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
      const expireAt = Date.now() + 5 * 60000;
      const formattedTime = new Date(expireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
      const qrisImage = 'img/qris.jpg';
      let caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk:* ${escapeMarkdown(produk.nama)}\nHarga: Rp${toRupiah(basePrice)} + 2 digit acak\nTotal: Rp${toRupiah(total)}\n\nSilakan bayar sebelum *${formattedTime}*.\n\nSetelah pembayaran terdeteksi, kode produk akan dikirim otomatis.`;

      await bot.sendPhoto(chatId, fs.createReadStream(qrisImage), {
        caption,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Batalkan Pesanan', callback_data: `cancel_${userId}` }]]
        }
      });

      const produkList = JSON.parse(fs.readFileSync('produk.json'));
      const interval = setInterval(async () => {
        if (Date.now() >= expireAt) {
          clearInterval(interval);
          return bot.sendMessage(chatId, '❌ Waktu pembayaran habis. Pesanan dibatalkan.');
        }
        try {
          const check = await axios.get(`https://gateway.okeconnect.com/api/mutasi/qris/${memberId}/${apikey_orkut}`);
          const found = check.data.data.find(i => i.type === 'CR' && i.qris === 'static' && parseInt(i.amount) === total);
          if (found) {
            clearInterval(interval);
            bot.sendMessage(chatId, '✅ Pembayaran diterima! Memproses pesanan...');
            const prod = produkList.find(p => p.kode === produk.kode);
            let stok_item;
            for (let i = 0; i < prod.stok_data.length; i++) {
              if (prod.stok_data[i].trim() !== '') {
                stok_item = prod.stok_data[i];
                prod.stok_data.splice(i, 1);
                break;
              }
            }
            prod.stok = prod.stok_data.length;
            fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));
            bot.sendMessage(chatId, `🎉 *TRANSAKSI SUKSES* 🎉\n\nProduk: ${escapeMarkdown(prod.nama)}\nRefID: ${escapeMarkdown(reffId)}\nKode:\n${escapeMarkdown(stok_item)}`, {
              parse_mode: 'Markdown'
            });
          }
        } catch (err) {
          console.log('ERROR:', err.message);
        }
      }, 10000);

      sessions[userId] = { ...sessions[userId], interval };
      delete sessions[chatId].produkKeyboard;
      return;
    }
  }

  // === ORDER PULSA ===
  if (msg.text === '📱 Order Pulsa') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      const pulsaList = res.data.filter(p => p.kategori && p.kategori.toLowerCase() === 'pulsa');
      const providers = [...new Set(pulsaList.map(p => p.produk))];
      const providerButtons = [];
      for (let i = 0; i < providers.length; i += 2) {
        providerButtons.push(providers.slice(i, i + 2).map(p => ({ text: p })));
      }
      sessions[userId] = { step: 'awaiting_provider_pulsa', pulsaList };
      return bot.sendMessage(chatId, 'Pilih provider pulsa:', {
        reply_markup: { keyboard: providerButtons, resize_keyboard: true, one_time_keyboard: true }
      });
    } catch (err) {
      return bot.sendMessage(chatId, 'Gagal mengambil daftar provider pulsa.');
    }
  }
  if (session && session.step === 'awaiting_provider_pulsa') {
    const provider = msg.text.trim();
    const pulsaList = session.pulsaList || [];
    const produkPulsa = pulsaList.filter(p => p.produk.toLowerCase() === provider.toLowerCase());
    if (produkPulsa.length === 0) return bot.sendMessage(chatId, 'Provider tidak ditemukan. Pilih dari menu.');
    sessions[userId] = { step: 'awaiting_nominal_pulsa', provider, produkPulsa };
    const buttons = produkPulsa.map(p => [{
      text: `${p.keterangan} - Rp${toRupiah(hargaSetelahProfit(p.harga))}`,
      callback_data: `pilihnominalpulsa_${p.kode}`
    }]);
    return bot.sendMessage(chatId, `Pilih nominal pulsa untuk ${provider}:`, {
      reply_markup: { inline_keyboard: buttons }
    });
  }
  if (session && session.step === 'awaiting_nomor_pulsa') {
    const nomor = msg.text.replace(/[^0-9]/g, '');
    if (nomor.length < 10 || nomor.length > 15) return bot.sendMessage(chatId, 'Nomor HP tidak valid. Masukkan nomor yang benar.');
    await handleOrderGame(chatId, userId, session.produk, { nomor }, 'pulsa');
    delete sessions[userId];
    return;
  }

  // === Menu game (order game) ===
  const gameMenus = [
    { text: '🎮 Order ML', game: 'ml', filter: "mobile legends" },
    { text: '🔫 Order PUBG', game: 'pubg', filter: "pubg" },
    { text: '🔥 Order Free Fire', game: 'ff', filter: "free fire" },
    { text: '👑 Order HOK', game: 'hok', filter: "honor of king" },
    { text: '🌌 Order Genshin', game: 'genshin', filter: "genshin" },
    { text: '⚔️ Order Lord Mobile', game: 'lordmobile', filter: "lord mobile" },
    { text: '🎯 Order COD', game: 'cod', filter: "call of duty" },
    { text: '🥚 Order Eggy Party', game: 'eggy', filter: "eggy party" }
  ];
  for (const menu of gameMenus) {
    if (msg.text === menu.text) {
      try {
        const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
        productCache = res.data.filter(p => p.produk.toLowerCase().includes(menu.filter));
        sendProductPage(chatId, 0, menu.game);
      } catch (err) {
        bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
      }
      return;
    }
  }

  // === Manager produk (admin)
  if (msg.text === '🛠 Manager' && userId === ADMIN_ID) {
    const produkList = JSON.parse(fs.readFileSync('produk.json'));
    const buttons = produkList.map(p => [{
      text: `✏️ ${p.nama}`,
      callback_data: `manage_${p.kode}`
    }]);
    buttons.push([{ text: '➕ Tambah Produk Baru', callback_data: 'add_produk_baru' }]);
    await bot.sendMessage(chatId, `🛠 *Kelola Produk*`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }
  // === Tambah produk baru
  if (session && session.mode === 'add_nama') {
    const produkList = JSON.parse(fs.readFileSync('produk.json'));
    const namaProduk = msg.text.trim();
    const produkAda = produkList.find(p => p.nama.toLowerCase() === namaProduk.toLowerCase());
    session.nama = namaProduk;
    if (produkAda) {
      session.harga = produkAda.harga;
      session.mode = 'add_stok';
      return bot.sendMessage(chatId, `Harga secara otomatis diambil dari produk.json: *Rp${toRupiah(produkAda.harga)}*\n\nMasukkan *data stok* (setiap baris bisa berisi satu atau beberapa item)`, { parse_mode: 'Markdown' });
    } else {
      session.mode = 'add_harga';
      return bot.sendMessage(chatId, 'Produk baru, masukkan *harga* produk:', { parse_mode: 'Markdown' });
    }
  }
  if (session && session.mode === 'add_harga') {
    const harga = parseInt(msg.text.trim());
    if (isNaN(harga)) return bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid untuk harga.');
    session.harga = harga;
    session.mode = 'add_stok';
    return bot.sendMessage(chatId, 'Masukkan *data stok* (setiap baris bisa berisi satu atau beberapa item)', { parse_mode: 'Markdown' });
  }
  if (session && session.mode === 'add_stok') {
    const stok_data = msg.text.split('\n').map(line => line.trim()).filter(Boolean);
    if (stok_data.length === 0) return bot.sendMessage(chatId, '⚠️ Stok tidak boleh kosong.');
    const kode = 'P' + Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
    const produkList = JSON.parse(fs.readFileSync('produk.json'));
    produkList.push({
      kode,
      nama: session.nama,
      harga: session.harga,
      stok: stok_data.length,
      stok_data
    });
    fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));
    delete sessions[userId];
    return bot.sendMessage(chatId, `✅ Produk baru berhasil ditambahkan!\n\nNama: ${escapeMarkdown(session.nama)}\nHarga: Rp${toRupiah(session.harga)}\nJumlah baris stok: ${stok_data.length}`, { parse_mode: 'Markdown' });
  }

  const inputSteps = [
    { step: 'awaiting_userid_ml', game: 'ml', zone: true },
    { step: 'awaiting_userid_pubg', game: 'pubg', zone: false },
    { step: 'awaiting_userid_ff', game: 'ff', zone: false },
    { step: 'awaiting_userid_hok', game: 'hok', zone: false },
    { step: 'awaiting_userid_genshin', game: 'genshin', zone: false },
    { step: 'awaiting_userid_lordmobile', game: 'lordmobile', zone: false },
    { step: 'awaiting_userid_cod', game: 'cod', zone: false },
    { step: 'awaiting_userid_eggy', game: 'eggy', zone: false }
  ];
  for (const stepObj of inputSteps) {
    if (session && session.step === stepObj.step) {
      if (stepObj.zone) {
        session.userId = msg.text.trim();
        session.step = `awaiting_zoneid_${stepObj.game}`;
        return bot.sendMessage(chatId, 'Masukkan Zone ID:');
      } else {
        session.userId = msg.text.trim();
        const produk = productCache.find(p => p.kode === session.kode);
        if (!produk) {
          delete sessions[userId];
          return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
        }
        await handleOrderGame(chatId, userId, produk, session, stepObj.game);
        delete sessions[userId];
        return;
      }
    }
    if (session && session.step === `awaiting_zoneid_${stepObj.game}`) {
      session.zoneId = msg.text.trim();
      const produk = productCache.find(p => p.kode === session.kode);
      if (!produk) {
        delete sessions[userId];
        return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
      }
      await handleOrderGame(chatId, userId, produk, session, stepObj.game);
      delete sessions[userId];
      return;
    }
  }
  if (session && (session.mode === 'edit_nama' || session.mode === 'edit_harga' || session.mode === 'edit_stok')) {
    const produkList = JSON.parse(fs.readFileSync('produk.json'));
    const produk = produkList.find(p => p.kode === session?.kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    if (session.mode === 'edit_nama') produk.nama = msg.text;
    else if (session.mode === 'edit_harga') {
      const hargaBaru = parseInt(msg.text);
      if (isNaN(hargaBaru)) return bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid untuk harga.');
      produk.harga = hargaBaru;
    } else if (session.mode === 'edit_stok') {
      const stokBaru = msg.text.split('\n').map(s => s.trim()).filter(Boolean);
      produk.stok_data = produk.stok_data.concat(stokBaru);
      produk.stok = produk.stok_data.length;
    }
    fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));
    delete sessions[userId];
    bot.sendMessage(chatId, '✅ Data produk berhasil diperbarui.');
    return;
  }
});

// ==== HANDLER CALLBACK ====
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id.toString();
  const data = cb.data;
  const produkList = JSON.parse(fs.readFileSync('produk.json'));
  const session = sessions[userId];
  ensureUser(cb.from);

  // === Pulsa
  if (data.startsWith('pilihnominalpulsa_')) {
    const kode = data.replace('pilihnominalpulsa_', '');
    const produk = (session?.produkPulsa || []).find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk pulsa tidak ditemukan.');
    sessions[userId] = { step: 'awaiting_nomor_pulsa', produkPulsa: session.produkPulsa, produk };
    return bot.sendMessage(chatId, `Masukkan nomor HP tujuan untuk ${produk.keterangan}:`);
  }
  // === Game order & pagination
  const gameOrderCallback = [
    { prefix: 'mlorder_', game: 'ml', step: 'awaiting_userid_ml' },
    { prefix: 'pubgorder_', game: 'pubg', step: 'awaiting_userid_pubg' },
    { prefix: 'fforder_', game: 'ff', step: 'awaiting_userid_ff' },
    { prefix: 'hokorder_', game: 'hok', step: 'awaiting_userid_hok' },
    { prefix: 'genshinorder_', game: 'genshin', step: 'awaiting_userid_genshin' },
    { prefix: 'lordmobileorder_', game: 'lordmobile', step: 'awaiting_userid_lordmobile' },
    { prefix: 'codorder_', game: 'cod', step: 'awaiting_userid_cod' },
    { prefix: 'eggyorder_', game: 'eggy', step: 'awaiting_userid_eggy' }
  ];
  for (const go of gameOrderCallback) {
    if (data.startsWith(go.prefix)) {
      const kode = data.replace(go.prefix, '');
      const produk = productCache.find(p => p.kode === kode);
      if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
      sessions[userId] = { kode, step: go.step };
      bot.sendMessage(chatId, `Masukkan User ID${go.game === 'ml' ? '' : ` ${go.game.toUpperCase()}`}:`);
      return;
    }
    if (data.startsWith(go.game + 'page_')) {
      const page = parseInt(data.split('_')[1]);
      sendProductPage(chatId, page, go.game);
      return;
    }
  }
  // === Produk manual dari produk.json (tidak perlu pesan error di sini)
  if (data.startsWith('produkjson_')) {
    return bot.sendMessage(chatId, 'Silakan pilih produk dari menu utama, bukan dari callback.');
  }
  // === Manager produk
  if (data.startsWith('manage_')) {
    const kode = data.replace('manage_', '');
    const produk = produkList.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { mode: 'manage', kode };
    const buttons = [
      [{ text: '📝 Ubah Nama', callback_data: `edit_nama_${kode}` }],
      [{ text: '💵 Ubah Harga', callback_data: `edit_harga_${kode}` }],
      [{ text: '➕ Tambah Stok', callback_data: `edit_stok_${kode}` }]
    ];
    bot.sendMessage(chatId, `🛠 *Edit Produk:* ${escapeMarkdown(produk.nama)}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  } else if (data.startsWith('edit_')) {
    const [_, jenis, kode] = data.split('_');
    sessions[userId] = { mode: `edit_${jenis}`, kode };
    const label = jenis === 'nama' ? 'nama baru' : jenis === 'harga' ? 'harga baru' : 'data stok (setiap baris satu stok, bisa lebih dari satu item dipisahkan koma, pisahkan baris dengan ENTER)';
    bot.sendMessage(chatId, `Kirim ${label} untuk produk ${escapeMarkdown(kode)}:`);
    return;
  }
  if (data === 'add_produk_baru') {
    sessions[userId] = { mode: 'add_nama' };
    bot.sendMessage(chatId, 'Masukkan *nama* produk:', { parse_mode: 'Markdown' });
    return;
  }
  // === Batalkan pesanan
  if (data.startsWith('cancel_')) {
    const uid = data.split('_')[1];
    if (sessions[uid]) {
      clearInterval(sessions[uid].interval);
      delete sessions[uid];
      bot.sendMessage(chatId, '❌ Pesanan berhasil dibatalkan.');
    } else {
      bot.sendMessage(chatId, '⚠️ Tidak ada pesanan yang bisa dibatalkan.');
    }
    return;
  }
});
