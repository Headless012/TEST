async function createTempMail(page) {
  console.log('📧 Apertura best-temp-mail.com...');
  await page.goto('https://best-temp-mail.com/', { waitUntil: 'domcontentloaded' });
  
  await page.getByRole('button', { name: 'Acconsenti' }).click().catch(() => {});
  await page.waitForTimeout(5000);

  const tempEmail = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], input[readonly]');
    for (const input of inputs) {
      const val = input.value.trim();
      if (val.includes('@') && val.length > 15) return val;
    }

    const text = document.body.innerText;
    const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      for (const email of matches) {
        if (email.length > 15 && !email.includes('support') && !email.includes('contact')) {
          return email;
        }
      }
    }
    return null;
  });

  if (!tempEmail) throw new Error('❌ Impossibile leggere email da best-temp-mail.com');

  console.log(`✅ Email ottenuta: ${tempEmail}`);
  return tempEmail.trim();
}

async function waitForEmail(page, timeoutMs = 120000) {
  const start = Date.now();
  console.log('⏳ Monitorando inbox...');

  while (Date.now() - start < timeoutMs) {
    try {
      const hasCode = await page.getByText('is your verification code').count();
      if (hasCode > 0) {
        const code = await page.evaluate(() => {
          const text = document.body.innerText;
          const match = text.match(/(\d{6})/);
          return match ? match[1] : null;
        });
        if (code) {
          console.log(`🔑 Codice trovato: ${code}`);
          return code;
        }
      }
    } catch (e) {}
    await page.waitForTimeout(5000);
  }
  throw new Error('⏰ Nessun codice ricevuto');
}

module.exports = { createTempMail, waitForEmail };