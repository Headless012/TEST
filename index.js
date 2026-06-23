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
  console.log(`✅ Bot avviato come ${client.user.tag} - XVFB Mode`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!generate')) return;

  if (activeGenerations.size >= 3) {
    return message.reply('⚠️ Sono già in corso 3 generazioni. Attendi.');
  }

  const fullText = message.content.slice(10).trim();
  const durationMatch = fullText.match(/(\d+)(s|sec|seconds?)/i);
  const duration = durationMatch ? parseInt(durationMatch[1]) : 8;
  let prompt = fullText.replace(/(\d+)(s|sec|seconds?)/i, '').trim();

  const isVertical = prompt.toLowerCase().includes('vertical');
  if (isVertical) prompt = prompt.replace(/vertical/i, '').trim();

  if (!prompt) return message.reply('❌ Usa: `!generate prompt 10s` (aggiungi "vertical" per 9:16)');

  let imagePath = null;
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType?.startsWith('image/')) {
      imagePath = path.join(__dirname, `upload_${Date.now()}.jpg`);
      try {
        const res = await fetch(attachment.url);
        fs.writeFileSync(imagePath, Buffer.from(await res.arrayBuffer()));
      } catch (e) {}
    }
  }

  activeGenerations.add(message.id);
  await message.reply(`⏳ Generazione avviata per **"${prompt}"** (${duration}s)${isVertical ? ' 📱 Verticale' : ''}...`);

  automateFreebeat(prompt, duration, message, imagePath, isVertical)
    .finally(() => {
      activeGenerations.delete(message.id);
      if (imagePath) fs.unlinkSync(imagePath).catch(() => {});
    })
    .catch(err => message.reply('❌ Errore: ' + err.message).catch(() => {}));
});

async function automateFreebeat(prompt, durationSeconds, originalMessage, imagePath = null, isVertical = false) {
  const browser = await chromium.launch({
    headless: false,           // ← Usa false con XVFB
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--mute-audio',
      '--window-position=-2000,-2000'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'it-IT'
  });

  try {
    const mailPage = await context.newPage();
    const tempEmail = await createTempMail(mailPage);

    const freebeatPage = await context.newPage();
    await freebeatPage.goto('https://freebeat.ai/it/ai-video-generator?model=seedance-2.0', { 
      waitUntil: 'domcontentloaded', 
      timeout: 90000 
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

    await freebeatPage.getByRole('textbox', { name: 'Descrivi cosa vuoi creare' }).fill(prompt);

    if (imagePath && fs.existsSync(imagePath)) {
      try {
        await freebeatPage.getByRole('button').filter({ hasText: /^$/ }).nth(3).click();
        await freebeatPage.getByRole('menuitem', { name: 'Upload' }).click();
        await freebeatPage.waitForTimeout(1500);
        await freebeatPage.locator('input[type="file"]').first().setInputFiles(imagePath);
        await freebeatPage.waitForTimeout(4000);
      } catch (e) {}
    }

    await freebeatPage.getByRole('button', { name: '4s' }).click();
    await freebeatPage.getByRole('menuitem', { name: `${durationSeconds}s` }).click().catch(() => {});

    if (isVertical) {
      await freebeatPage.waitForTimeout(1500);
      await freebeatPage.getByRole('button', { name: ':9' }).click();
      await freebeatPage.waitForTimeout(800);
      await freebeatPage.getByRole('menuitem', { name: ':16' }).click();
      await freebeatPage.waitForTimeout(1500);
    }

    await freebeatPage.waitForTimeout(3000);
    await freebeatPage.getByRole('button', { name: 'Crea' }).click();
    await freebeatPage.getByRole('button', { name: 'Ho 18+, continua' }).click().catch(() => {});

    let videoUrl = null;
    const maxWait = 1500000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        await freebeatPage.locator('div').filter({ hasText: /^In attesa in coda\.$/ }).nth(1).click().catch(() => {});
        await freebeatPage.locator('img').nth(2).click().catch(() => {});

        const pageText = await freebeatPage.evaluate(() => document.body.innerText.toLowerCase());

        if (pageText.includes('generazione video fallita')) {
          await originalMessage.reply('⚠️ Ha violato i termini o superato i limiti.');
          return;
        }

        const hasDownload = await freebeatPage.getByRole('button', { name: /Scarica|Download/i }).count();
        if (hasDownload > 0) {
          videoUrl = freebeatPage.url();
          break;
        }
      } catch (e) {}

      await freebeatPage.waitForTimeout(12000);
    }

    if (!videoUrl) throw new Error('Timeout: Video non pronto');

    await originalMessage.reply(`✅ Video pronto, guardalo qui:\n${videoUrl}`);

  } catch (error) {
    console.error(error);
    await originalMessage.reply('❌ Errore: ' + error.message).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

client.login(process.env.DISCORD_TOKEN);
