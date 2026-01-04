import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  // Setup CORS agar bisa diakses dari mana saja
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { text } = req.query;

  if (!text) {
    return res.status(400).json({ error: 'Parameter ?text= wajib diisi' });
  }

  let browser = null;

  try {
    const isLocal = process.env.NODE_ENV === 'development';
    
    // Konfigurasi Browser
    browser = await puppeteer.launch({
      args: isLocal ? [] : chromium.args,
      defaultViewport: { width: 800, height: 600 }, // Viewport kecil agar hemat RAM
      executablePath: isLocal 
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' // Sesuaikan path jika di local
        : await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Block gambar/css/font yang tidak perlu agar loading cepat
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
         // Kita butuh stylesheet utama brat, tapi block yang lain jika bisa. 
         // Untuk aman, kita allow semua dulu, atau filter domain iklan.
         req.continue();
      } else {
        req.continue();
      }
    });

    await page.goto('https://www.bratgenerator.com/', { waitUntil: 'domcontentloaded' });

    // Selector update
    const inputSelector = '#textInput';
    await page.waitForSelector(inputSelector);

    // Hapus text lama & ketik baru
    await page.evaluate(() => document.getElementById('textInput').value = '');
    await page.type(inputSelector, text);

    // Tunggu render
    await new Promise(r => setTimeout(r, 500)); 

    // Screenshot elemen #brat
    const element = await page.$('#brat');
    if (!element) throw new Error('Element gagal dirender');

    const buffer = await element.screenshot({ type: 'png' });

    // Kirim response gambar
    res.setHeader('Content-Type', 'image/png');
    res.status(200).send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal membuat gambar', detail: error.message });
  } finally {
    if (browser) await browser.close();
  }
}
