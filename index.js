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

// Escape karakter khusus Markdown
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

function hargaSetelahProfit(basePrice, role = 'user') {
  let margin = role === 'reseller' ? 1000 : 1500;
  return parseInt(basePrice) + margin;
}

function generateRandomFee() {
  return Math.floor(Math.random() * 90 + 10);
}

const isAdmin = (id) => id.toString() === ADMIN_ID;

// === PRODUK .json DENGAN KEYBOARD PAGINATION ===
function sendProdukKeyboard(chatId, page = 0) {
  const produkList = JSON.parse(fs.readFileSync('produk.json'));
  const perPage = 10;
  const totalPages = Math.ceil(produkList.length / perPage);
  const currentProducts = produkList.slice(page * perPage, (page + 1) * perPage);

  // 2 baris, masing-masing 5 produk
  let keyboard = [];
  for (let i = 0; i < currentProducts.length; i += 5) {
    keyboard.push(
      currentProducts.slice(i, i + 5).map(p => ({
        text: `${p.nama} (${p.stok})`
      }))
    );
  }

  // Navigasi halaman
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

  // Simpan produk di sesi untuk pemilihan berikutnya
  sessions[chatId] = { ...sessions[chatId], produkKeyboard: currentProducts, produkPage: page };
}

// === START HANDLER DENGAN CUSTOM KEYBOARD ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

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
  if (userId === ADMIN_ID) menu.push({ text: '🛠 Manager' });

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

// === KEYBOARD HANDLER ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text?.toLowerCase() || '';
  const session = sessions[userId];

  // === FITUR BATALKAN TRANSAKSI DENGAN KETIK "batal" ===
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

  // === PRODUK .json DENGAN KEYBOARD PAGINATION ===
  if (msg.text === '🛍 Produk') {
    sendProdukKeyboard(chatId, 0);
    return;
  }
  // Navigasi produk .json
  if (sessions[chatId] && sessions[chatId].produkKeyboard) {
    if (msg.text === '⬅️ Prev') {
      sendProdukKeyboard(chatId, Math.max(0, (sessions[chatId].produkPage || 0) - 1));
      return;
    }
    if (msg.text === 'Next ➡️') {
      sendProdukKeyboard(chatId, (sessions[chatId].produkPage || 0) + 1);
      return;
    }
    // Pilih produk dari keyboard
    const produk = sessions[chatId].produkKeyboard.find(p => msg.text.startsWith(p.nama));
    if (produk) {
      if (produk.stok < 1) return bot.sendMessage(chatId, '❌ Produk tidak tersedia atau stok habis.');
      // Proses pembayaran seperti produkjson_
      const role = 'user';
      const basePrice = hargaSetelahProfit(produk.harga);
      const fee = generateRandomFee();
      const total = basePrice + fee;
      const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
      const expireAt = Date.now() + 5 * 60000;
      const formattedTime = new Date(expireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

      const qrisImage = 'img/qris.jpg';
      let caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk:* ${escapeMarkdown(produk.nama)}\nHarga: Rp${toRupiah(basePrice)} + 2 digit acak\nTotal: Rp${toRupiah(total)}\n\nSilakan bayar sebelum *${escapeMarkdown(formattedTime)}*.`

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
            const stok = prod.stok_data.shift();
            prod.stok = prod.stok_data.length;
            fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));

            bot.sendMessage(chatId, `🎉 *TRANSAKSI SUKSES* 🎉\n\nProduk: ${escapeMarkdown(prod.nama)}\nRefID: ${escapeMarkdown(reffId)}\nKode: ${escapeMarkdown(stok)}`, {
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

  // Setelah pilih provider, tampilkan nominal
  if (session && session.step === 'awaiting_provider_pulsa') {
    const provider = msg.text.trim();
    const pulsaList = session.pulsaList || [];
    const produkPulsa = pulsaList.filter(p => p.produk.toLowerCase() === provider.toLowerCase());
    if (produkPulsa.length === 0) {
      return bot.sendMessage(chatId, 'Provider tidak ditemukan. Pilih dari menu.');
    }
    sessions[userId] = { step: 'awaiting_nominal_pulsa', provider, produkPulsa };
    const buttons = produkPulsa.map(p => [{
      text: `${p.keterangan} - Rp${toRupiah(hargaSetelahProfit(p.harga))}`,
      callback_data: `pilihnominalpulsa_${p.kode}`
    }]);
    return bot.sendMessage(chatId, `Pilih nominal pulsa untuk ${provider}:`, {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  // Setelah pilih nominal, minta nomor HP
  if (session && session.step === 'awaiting_nomor_pulsa') {
    const nomor = msg.text.replace(/[^0-9]/g, '');
    if (nomor.length < 10 || nomor.length > 15) {
      return bot.sendMessage(chatId, 'Nomor HP tidak valid. Masukkan nomor yang benar.');
    }
    // Lanjutkan ke pembayaran pulsa
    return handleOrderGame(chatId, userId, session.produk, { nomor }, 'pulsa');
  }

  // === Keyboard menu produk lain ===
  if (msg.text === '🎮 Order ML') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("mobile legends"));
      sendProductPage(chatId, 0, 'ml');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '🔫 Order PUBG') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("pubg"));
      sendProductPage(chatId, 0, 'pubg');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '🔥 Order Free Fire') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("free fire"));
      sendProductPage(chatId, 0, 'ff');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '👑 Order HOK') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("honor of king"));
      sendProductPage(chatId, 0, 'hok');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '🌌 Order Genshin') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("genshin"));
      sendProductPage(chatId, 0, 'genshin');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '⚔️ Order Lord Mobile') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("lord mobile"));
      sendProductPage(chatId, 0, 'lordmobile');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '🎯 Order COD') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("call of duty"));
      sendProductPage(chatId, 0, 'cod');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
  if (msg.text === '🥚 Order Eggy Party') {
    try {
      const res = await axios.get("https://okeconnect.com/harga/json?id=905ccd028329b0a");
      productCache = res.data.filter(p => p.produk.toLowerCase().includes("eggy party"));
      sendProductPage(chatId, 0, 'eggy');
    } catch (err) {
      bot.sendMessage(chatId, '❌ Gagal mengambil daftar produk.');
    }
    return;
  }
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

  // === TAMBAH PRODUK BARU ===
  if (session && session.mode === 'add_nama') {
    session.nama = msg.text.trim();
    session.mode = 'add_harga';
    return bot.sendMessage(chatId, 'Masukkan *harga* produk:', { parse_mode: 'Markdown' });
  }
  if (session && session.mode === 'add_harga') {
    const harga = parseInt(msg.text.trim());
    if (isNaN(harga)) return bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid untuk harga.');
    session.harga = harga;
    session.mode = 'add_stok';
    return bot.sendMessage(chatId, 'Masukkan *stok* produk (pisahkan dengan koma, contoh: kode1,kode2,kode3):', { parse_mode: 'Markdown' });
  }
  if (session && session.mode === 'add_stok') {
    const stok_data = msg.text.split(',').map(s => s.trim()).filter(Boolean);
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
    return bot.sendMessage(chatId, `✅ Produk baru berhasil ditambahkan!\n\nNama: ${escapeMarkdown(session.nama)}\nHarga: Rp${toRupiah(session.harga)}\nStok: ${stok_data.length}`, { parse_mode: 'Markdown' });
  }

  // === ORDER MOBILE LEGENDS ===
  if (session && session.step === 'awaiting_userid_ml') {
    session.userId = msg.text.trim();
    session.step = 'awaiting_zoneid_ml';
    return bot.sendMessage(chatId, 'Masukkan Zone ID:');
  }
  if (session && session.step === 'awaiting_zoneid_ml') {
    session.zoneId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'ml');
  }

  // === ORDER PUBG ===
  if (session && session.step === 'awaiting_userid_pubg') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'pubg');
  }

  // === ORDER FREE FIRE ===
  if (session && session.step === 'awaiting_userid_ff') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'ff');
  }

  // === ORDER HOK ===
  if (session && session.step === 'awaiting_userid_hok') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'hok');
  }

  // === ORDER GENSHIN ===
  if (session && session.step === 'awaiting_userid_genshin') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'genshin');
  }

  // === ORDER LORD MOBILE ===
  if (session && session.step === 'awaiting_userid_lordmobile') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'lordmobile');
  }

  // === ORDER COD ===
  if (session && session.step === 'awaiting_userid_cod') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'cod');
  }

  // === ORDER EGGY PARTY ===
  if (session && session.step === 'awaiting_userid_eggy') {
    session.userId = msg.text.trim();
    const produk = productCache.find(p => p.kode === session.kode);
    if (!produk) {
      delete sessions[userId];
      return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    }
    return handleOrderGame(chatId, userId, produk, session, 'eggy');
  }

  // === ORDER DARI FILE produk.json (bukan ML) & EDIT ===
  if (session && (session.mode === 'edit_nama' || session.mode === 'edit_harga' || session.mode === 'edit_stok')) {
    const produkList = JSON.parse(fs.readFileSync('produk.json'));
    const produk = produkList.find(p => p.kode === session?.kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');

    if (session.mode === 'edit_nama') {
      produk.nama = msg.text;
    } else if (session.mode === 'edit_harga') {
      const hargaBaru = parseInt(msg.text);
      if (isNaN(hargaBaru)) return bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid untuk harga.');
      produk.harga = hargaBaru;
    } else if (session.mode === 'edit_stok') {
      const stokBaru = msg.text.split(',').map(s => s.trim()).filter(Boolean);
      produk.stok_data = produk.stok_data.concat(stokBaru);
      produk.stok = produk.stok_data.length;
    }
    fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));
    delete sessions[userId];
    bot.sendMessage(chatId, '✅ Data produk berhasil diperbarui.');
    return;
  }
});

// === PAGINATION PRODUK GAME ===
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

// === CALLBACK QUERY HANDLER ===
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id.toString();
  const data = cb.data;
  const produkList = JSON.parse(fs.readFileSync('produk.json'));
  const session = sessions[userId];

  // === CALLBACK PULSA ===
  if (data.startsWith('pilihnominalpulsa_')) {
    const kode = data.replace('pilihnominalpulsa_', '');
    const produk = (session?.produkPulsa || []).find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk pulsa tidak ditemukan.');
    sessions[userId] = { step: 'awaiting_nomor_pulsa', produkPulsa: session.produkPulsa, produk };
    return bot.sendMessage(chatId, `Masukkan nomor HP tujuan untuk ${produk.keterangan}:`);
  }

  // ORDER MOBILE LEGENDS
  if (data.startsWith('mlorder_')) {
    const kode = data.replace('mlorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_ml' };
    bot.sendMessage(chatId, 'Masukkan User ID:');
    return;
  } else if (data.startsWith('mlpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'ml');
    return;
  }

  // ORDER PUBG
  if (data.startsWith('pubgorder_')) {
    const kode = data.replace('pubgorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_pubg' };
    bot.sendMessage(chatId, 'Masukkan User ID PUBG:');
    return;
  } else if (data.startsWith('pubgpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'pubg');
    return;
  }

  // ORDER FREE FIRE
  if (data.startsWith('fforder_')) {
    const kode = data.replace('fforder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_ff' };
    bot.sendMessage(chatId, 'Masukkan User ID Free Fire:');
    return;
  } else if (data.startsWith('ffpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'ff');
    return;
  }

  // ORDER HOK
  if (data.startsWith('hokorder_')) {
    const kode = data.replace('hokorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_hok' };
    bot.sendMessage(chatId, 'Masukkan User ID Honor of King:');
    return;
  } else if (data.startsWith('hokpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'hok');
    return;
  }

  // ORDER GENSHIN
  if (data.startsWith('genshinorder_')) {
    const kode = data.replace('genshinorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_genshin' };
    bot.sendMessage(chatId, 'Masukkan User ID Genshin Impact:');
    return;
  } else if (data.startsWith('genshinpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'genshin');
    return;
  }

  // ORDER LORD MOBILE
  if (data.startsWith('lordmobileorder_')) {
    const kode = data.replace('lordmobileorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_lordmobile' };
    bot.sendMessage(chatId, 'Masukkan User ID Lord Mobile:');
    return;
  } else if (data.startsWith('lordmobilepage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'lordmobile');
    return;
  }

  // ORDER COD
  if (data.startsWith('codorder_')) {
    const kode = data.replace('codorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_cod' };
    bot.sendMessage(chatId, 'Masukkan User ID Call of Duty:');
    return;
  } else if (data.startsWith('codpage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'cod');
    return;
  }

  // ORDER EGGY PARTY
  if (data.startsWith('eggyorder_')) {
    const kode = data.replace('eggyorder_', '');
    const produk = productCache.find(p => p.kode === kode);
    if (!produk) return bot.sendMessage(chatId, '❌ Produk tidak ditemukan.');
    sessions[userId] = { kode, step: 'awaiting_userid_eggy' };
    bot.sendMessage(chatId, 'Masukkan User ID Eggy Party:');
    return;
  } else if (data.startsWith('eggypage_')) {
    const page = parseInt(data.split('_')[1]);
    sendProductPage(chatId, page, 'eggy');
    return;
  }

  // ORDER DARI FILE produk.json (bukan ML)
  if (data.startsWith('produkjson_')) {
    const kode = data.replace('produkjson_', '');
    const produk = produkList.find(p => p.kode === kode);
    if (!produk || produk.stok < 1) return bot.sendMessage(chatId, '❌ Produk tidak tersedia atau stok habis.');

    const role = 'user';
    const basePrice = hargaSetelahProfit(produk.harga);
    const fee = generateRandomFee();
    const total = basePrice + fee;
    const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
    const expireAt = Date.now() + 5 * 60000;
    const formattedTime = new Date(expireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

    const qrisImage = 'img/qris.jpg';
    let caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk:* ${escapeMarkdown(produk.nama)}\nHarga: Rp${toRupiah(basePrice)} + 2 digit acak\nTotal: Rp${toRupiah(total)}\n\nSilakan bayar sebelum *${escapeMarkdown(formattedTime)}*.`

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
        return bot.sendMessage(chatId, '❌ Waktu pembayaran habis. Pesanan dibatalkan.');
      }

      try {
        const check = await axios.get(`https://gateway.okeconnect.com/api/mutasi/qris/${memberId}/${apikey_orkut}`);
        const found = check.data.data.find(i => i.type === 'CR' && i.qris === 'static' && parseInt(i.amount) === total);

        if (found) {
          clearInterval(interval);
          bot.sendMessage(chatId, '✅ Pembayaran diterima! Memproses pesanan...');

          const prod = produkList.find(p => p.kode === kode);
          const stok = prod.stok_data.shift();
          prod.stok = prod.stok_data.length;
          fs.writeFileSync('produk.json', JSON.stringify(produkList, null, 2));

          bot.sendMessage(chatId, `🎉 *TRANSAKSI SUKSES* 🎉\n\nProduk: ${escapeMarkdown(prod.nama)}\nRefID: ${escapeMarkdown(reffId)}\nKode: ${escapeMarkdown(stok)}`, {
            parse_mode: 'Markdown'
          });
        }
      } catch (err) {
        console.log('ERROR:', err.message);
      }
    }, 10000);

    sessions[userId] = { ...sessions[userId], interval };
    return;
  }

  // MANAGER
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
    const label = jenis === 'nama' ? 'nama baru' : jenis === 'harga' ? 'harga baru' : 'data stok (pisah koma)';
    bot.sendMessage(chatId, `Kirim ${label} untuk produk ${escapeMarkdown(kode)}:`);
    return;
  }
  // Batalkan pesanan
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

// === FUNGSI HANDLE ORDER GAME ===
async function handleOrderGame(chatId, userId, produk, session, game) {
  let nickname = '';
  let detailUser = '';
  if (game === 'pulsa') {
    nickname = session.nomor;
    detailUser = `*Nomor HP:* ${escapeMarkdown(session.nomor)}`;
  } else if (game === 'ml') {
    nickname = `${produk.produk || produk.nama}_${session.userId}_${session.zoneId}`;
    detailUser = `*User ID:* ${escapeMarkdown(session.userId)}\n*Zone ID:* ${escapeMarkdown(session.zoneId)}`;
  } else if (game === 'pubg') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID PUBG:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'ff') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID Free Fire:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'hok') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID HOK:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'genshin') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID Genshin:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'lordmobile') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID Lord Mobile:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'cod') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID COD:* ${escapeMarkdown(session.userId)}`;
  } else if (game === 'eggy') {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID Eggy Party:* ${escapeMarkdown(session.userId)}`;
  } else {
    nickname = `${produk.produk || produk.nama}_${session.userId}`;
    detailUser = `*User ID:* ${escapeMarkdown(session.userId)}`;
  }

  const reffId = crypto.randomBytes(5).toString("hex").toUpperCase();
  const basePrice = hargaSetelahProfit(produk.harga, 'user', produk.kategori);
  const fee = generateRandomFee();
  const total = basePrice + fee;

  const qrisImage = 'img/qris.jpg';
  const expireAt = Date.now() + 5 * 60000;
  const formattedTime = new Date(expireAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

  let caption = `*🧾 MENUNGGU PEMBAYARAN 🧾*\n\n*Produk ID:* ${escapeMarkdown(produk.kode)}\n${detailUser}\n*Nickname:* ${escapeMarkdown(nickname)}\n\nKategori: ${escapeMarkdown(produk.kategori || "-")}\nProduk: ${escapeMarkdown(produk.keterangan || produk.nama)}\nHarga: Rp${toRupiah(basePrice)} + 2 digit acak\nTotal: Rp${toRupiah(total)}\n\nSilakan bayar sebelum *${escapeMarkdown(formattedTime)}*.`

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

        let suksesMsg = `🎉 *TRANSAKSI SUKSES* 🎉\n\nProduk: ${escapeMarkdown(produk.keterangan || produk.nama)}\nRefID: ${escapeMarkdown(reffId)}\n${detailUser}\nNickname: ${escapeMarkdown(nickname)}`;
        bot.sendMessage(chatId, suksesMsg, { parse_mode: 'Markdown' });

        delete sessions[userId];
      }
    } catch (err) {
      console.log('ERROR:', err.message);
    }
  }, 10000);

  sessions[userId].interval = interval;
  session.step = null;
}