require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

const { createTempMail, waitForEmail } = require('./utils/mail-best');

chromium.use(StealthPlugin());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const activeGenerations = new Set();

client.once('ready', () => {
  console.log(`✅ Bot avviato come ${client.user.tag} - 24/7 su Render`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!generate')) return;

  if (activeGenerations.size >= 3) {
    return message.reply('⚠️ Sono già in corso 3 generazioni. Attendi che una finisca.');
  }

  const fullText = message.content.slice(10).trim();
  const durationMatch = fullText.match(/(\d+)(s|sec|seconds?)/i);
  const duration = durationMatch ? parseInt(durationMatch[1]) : 8;
  let prompt = fullText.replace(/(\d+)(s|sec|seconds?)/i, '').trim();

  const isVertical = prompt.toLowerCase().includes('vertical');
  if (isVertical) {
    prompt = prompt.replace(/vertical/i, '').trim();
  }

  if (!prompt) {
    return message.reply('❌ Usa: `!generate il tuo prompt qui 10s` (aggiungi "vertical" per 9:16)');
  }

  // Gestione immagine allegata
  let imagePath = null;
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType?.startsWith('image/')) {
      imagePath = path.join(__dirname, `upload_${Date.now()}.jpg`);
      try {
        const response = await fetch(attachment.url);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(imagePath, Buffer.from(buffer));
        console.log(`📸 Immagine allegata salvata`);
      } catch (err) {
        console.error('Errore download immagine:', err);
        imagePath = null;
      }
    }
  }

  activeGenerations.add(message.id);
  await message.reply(`⏳ Generazione avviata per **"${prompt}"** (${duration}s)${isVertical ? ' 📱 Verticale (9:16)' : ''}...`);

  automateFreebeat(prompt, duration, message, imagePath, isVertical)
    .finally(() => {
      activeGenerations.delete(message.id);
      if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath).catch(() => {});
    })
    .catch(err => {
      console.error(err);
      message.reply('❌ Errore durante la generazione: ' + err.message).catch(() => {});
    });
});

async function automateFreebeat(prompt, durationSeconds, originalMessage, imagePath = null, isVertical = false) {
  const browser = await chromium.launch({
    headless: true,   // OBBLIGATORIO su Render
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--no-first-run',
      '--no-zygote',
      '--single-process'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    // === TEMP MAIL ===
    const mailPage = await context.newPage();
    const tempEmail = await createTempMail(mailPage);

    // === FREEBEAT ===
    const freebeatPage = await context.newPage();
    await freebeatPage.goto('https://freebeat.ai/it/ai-video-generator?model=seedance-2.0', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await freebeatPage.getByRole('button', { name: 'Accedi' }).first().click({ timeout: 20000 });
    await freebeatPage.getByRole('textbox', { name: 'Continua con la tua email' }).fill(tempEmail);
    await freebeatPage.getByRole('button', { name: 'Send login code' }).click();

    const code = await waitForEmail(mailPage, 120000);

    for (let i = 0; i < 6; i++) {
      await freebeatPage.getByRole('textbox').nth(i).fill(code[i]);
      await freebeatPage.waitForTimeout(300);
    }

    // Survey
    await freebeatPage.getByRole('button', { name: 'Maybe Later' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'Produttore musicale' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'Avanti' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'ChatGPT, Gemini, Claude, ecc.' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'Avanti' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'Crescere e monetizzare il' }).click().catch(() => {});
    await freebeatPage.getByRole('button', { name: 'Invia e ottieni 300 crediti' }).click().catch(() => {});

    await freebeatPage.waitForTimeout(3000);
    await freebeatPage.getByRole('button', { name: /acconsenti|accetta/i }).click().catch(() => {});

    // Prompt
    await freebeatPage.getByRole('textbox', { name: 'Descrivi cosa vuoi creare' }).fill(prompt);

    // Upload immagine
    if (imagePath && fs.existsSync(imagePath)) {
      console.log('📤 Upload immagine...');
      try {
        await freebeatPage.getByRole('button').filter({ hasText: /^$/ }).nth(3).click();
        await freebeatPage.getByRole('menuitem', { name: 'Upload' }).click();
        await freebeatPage.waitForTimeout(1500);
        const fileInput = await freebeatPage.locator('input[type="file"]').first();
        await fileInput.setInputFiles(imagePath);
        await freebeatPage.waitForTimeout(4000);
        console.log('✅ Immagine caricata');
      } catch (e) {
        console.error('Errore upload immagine:', e);
      }
    }

    // Durata
    await freebeatPage.getByRole('button', { name: '4s' }).click();
    await freebeatPage.getByRole('menuitem', { name: `${durationSeconds}s` }).click().catch(() => {});

    // Verticale 9:16
    if (isVertical) {
      console.log('📱 Imposto formato 9:16...');
      await freebeatPage.waitForTimeout(1500);
      await freebeatPage.getByRole('button', { name: ':9' }).click();
      await freebeatPage.waitForTimeout(800);
      await freebeatPage.getByRole('menuitem', { name: ':16' }).click();
      await freebeatPage.waitForTimeout(1500);
    }

    // 3 secondi prima di Crea
    await freebeatPage.waitForTimeout(3000);
    await freebeatPage.getByRole('button', { name: 'Crea' }).click();
    await freebeatPage.getByRole('button', { name: 'Ho 18+, continua' }).click().catch(() => {});

    console.log(`⏳ Generazione in corso...`);

    // Attesa generazione
    let videoUrl = null;
    const maxWait = 1500000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        await freebeatPage.locator('div').filter({ hasText: /^In attesa in coda\.$/ }).nth(1).click().catch(() => {});
        await freebeatPage.locator('img').nth(2).click().catch(() => {});

        const pageText = await freebeatPage.evaluate(() => document.body.innerText.toLowerCase());

        if (pageText.includes('il tuo piano') || pageText.includes('piano')) {
          await freebeatPage.reload({ waitUntil: 'domcontentloaded' });
          await freebeatPage.waitForTimeout(8000);
        }

        if (pageText.includes('generazione video fallita') || pageText.includes('generazione fallita')) {
          await originalMessage.reply('⚠️ Ha violato i termini di servizio o superato i limiti del piano.');
          return;
        }

        const hasDownload = await freebeatPage.getByRole('button', { name: /Scarica|Download/i }).count();
        const hasVideo = await freebeatPage.locator('video').count();

        if (hasDownload > 0 || hasVideo > 0) {
          videoUrl = freebeatPage.url();
          const direct = await freebeatPage.evaluate(() => {
            const el = document.querySelector('video source, video, a[download], a[href*=".mp4"]');
            return el ? (el.src || el.href || el.currentSrc) : null;
          });
          if (direct && direct.includes('http')) videoUrl = direct;
          break;
        }
      } catch (e) {}

      await freebeatPage.waitForTimeout(12000);
    }

    if (!videoUrl) throw new Error('Video non pronto entro il timeout');

    await originalMessage.reply(`✅ Video pronto, guardalo qui:\n${videoUrl}`);

  } catch (error) {
    console.error('❌ Errore completo:', error);
    await originalMessage.reply('❌ Errore durante la generazione: ' + error.message).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

client.login(process.env.DISCORD_TOKEN);
