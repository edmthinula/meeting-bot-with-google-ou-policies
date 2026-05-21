import { chromium } from 'playwright';
import * as path from 'path'; // 1. Import the path module

(async () => {
    console.log('Launching persistent browser using REAL Windows Chrome...');

    // 2. Resolve the relative path to an absolute path dynamically
    const userDataDir = path.resolve('./chrome-profile'); 

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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