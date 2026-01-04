import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  // Setup Browser
  let browser = null;
  
  try {
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: 'Text required' });

    // 1. Konfigurasi Chromium (Minimalist)
    // Gunakan konfigurasi local vs production
    const isLocal = process.env.NODE_ENV === 'development';
    
    browser = await puppeteer.launch({
      args: isLocal ? [] : [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
      defaultViewport: { width: 800, height: 800 },
      executablePath: isLocal 
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Ganti path chrome laptopmu
        : await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // 2. TEKNIK OPTIMASI: Request Interception (AdBlock)
    // Kita blokir semua iklan dan request sampah biar cepat
    await page.setRequestInterception(true);
    
    const blockedDomains = [
      'googlesyndication.com', 
      'adservice.google.com',
      'doubleclick.net',
      'google-analytics.com',
      'adnxs.com'
    ];

    page.on('request', (req) => {
      const url = req.url();
      const resourceType = req.resourceType();

      // Blokir Iklan berdasarkan Domain
      if (blockedDomains.some(domain => url.includes(domain))) {
        req.abort();
      } 
      // Blokir Gambar/Media yang tidak perlu (kecuali script/css utama)
      else if (['image', 'media', 'font'].includes(resourceType)) {
        // Kita abort gambar UI website, tapi hati-hati font kadang dibutuhkan
        // Untuk amannya di bratgenerator, kita block image saja.
        req.abort();
      } 
      else {
        req.continue();
      }
    });

    // 3. Buka Website (WaitUntil: domcontentloaded lebih cepat daripada networkidle)
    await page.goto('https://www.bratgenerator.com/', { 
      waitUntil: 'domcontentloaded',
      timeout: 8000 // Kita set timeout internal 8 detik biar gak kena limit Vercel
    });

    // 4. Injeksi Javascript Langsung (Lebih cepat daripada page.type)
    // Kita ubah isi HTML langsung tanpa mensimulasikan ketikan keyboard
    await page.evaluate((textToType) => {
      const input = document.getElementById('textInput');
      // Update nilai input (untuk form)
      if(input) input.value = textToType;
      
      // Update tampilan visual (untuk div brat)
      // Website ini biasanya mengupdate div #brat saat input berubah
      // Kita panggil event input manual
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('keyup', { bubbles: true }));
      
    }, text);

    // 5. Tunggu sebentar untuk render font/css
    await new Promise(r => setTimeout(r, 200));

    // 6. Screenshot area spesifik
    const element = await page.$('#brat');
    if (!element) throw new Error('Element #brat tidak ditemukan');

    const buffer = await element.screenshot({ type: 'png' });

    // 7. Kirim Hasil
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 hari
    res.status(200).send(buffer);

  } catch (error) {
    console.error("Scraping Error:", error);
    res.status(500).json({ 
      error: 'Gagal generate', 
      detail: error.message,
      tips: 'Coba lagi, server sedang sibuk'
    });
  } finally {
    if (browser) await browser.close();
  }
}
