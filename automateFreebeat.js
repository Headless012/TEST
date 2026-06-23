const { createTempMail, waitForEmail } = require('./utils/mail');
async function automateFreebeat(userPrompt, durationSeconds) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. Go to the site
    await page.goto('https://freebeat.ai/it/ai-video-generator?model=seedance-2.0&ops_id=header_video_model_seeddance_2_0&ops_name=SeedDance+2.0&ops_surface=header&ops_group=video_models_dropdown&ops_position=model_item&target_product=video&target_model=SeedDance+2.0&ops_journey_id=ops_mqqgc4dc_483cvwca', { waitUntil: 'networkidle' });

    // 2. Click "Accedi" (login) bottom left - adjust selector as needed
    await page.waitForSelector('text=Accedi', { timeout: 10000 });
    await page.click('text=Accedi');

    // 3. Temp mail with mail.tm
    const tempEmail = await createTempMail();
    console.log('Temp email:', tempEmail.address);

    // Fill email (inspect the signup form selectors on the site)
    await page.fill('input[type="email"]', tempEmail.address); // Adjust selector
    await page.click('button[type="submit"]'); // Continue

    // 4. Get verification code from temp mail
    const verificationCode = await waitForEmail(tempEmail, 30000); // Wait up to 30s
    await page.fill('input[placeholder*="code" i]', verificationCode); // Adjust
    await page.click('button[type="submit"]');

    // 5. Survey - random answers (3 questions)
    await handleSurvey(page);

    // 6. Back to generator, input prompt + duration
    await page.goto('https://freebeat.ai/it/ai-video-generator?...', { waitUntil: 'networkidle' }); // Your full URL

    await page.fill('textarea[placeholder*="prompt" i]', userPrompt); // Adjust selector
    // Select duration - example dropdown or slider
    await page.selectOption('select#duration', `${durationSeconds}`); // Adjust as needed

    await page.click('button:has-text("Generate")'); // Or submit button text

    // 7. Wait for video generation (monitor for download link or progress)
    await page.waitForSelector('video, a[download], [data-video-ready]', { timeout: 120000 }); // 2 min timeout

    // Download video
    const videoUrl = await page.evaluate(() => {
      const video = document.querySelector('video source') || document.querySelector('a[download]');
      return video ? video.src || video.href : null;
    });

    const videoPath = path.join(__dirname, `video_${Date.now()}.mp4`);
    if (videoUrl) {
      const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(videoPath, response.data);
    } else {
      // Alternative: right-click save or use page.evaluate for blob
      await page.waitForSelector('video');
      // More advanced download if needed
    }

    await browser.close();
    return videoPath;

  } catch (e) {
    console.error(e);
    await browser.close();
    throw e;
  }
}