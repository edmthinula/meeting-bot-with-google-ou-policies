import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

(async () => {
  console.log('Launching persistent browser using REAL Mac Chrome...');
  
  const context = await chromium.launchPersistentContext('./chrome-profile', {
    headless: false,
    // Point directly to your Mac's native Google Chrome
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    channel: 'chrome'
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  await page.goto('https://meet.google.com');

  console.log('----------------------------------------------------');
  console.log('Browser opened! Please log in with your account.');
  console.log('Once you are fully logged in and on the Meet homepage,');
  console.log('simply CLOSE the browser window to save the session.');
  console.log('----------------------------------------------------');
})();