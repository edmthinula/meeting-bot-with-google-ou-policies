import { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import config from '../config';
import * as path from 'path';
import { getCorrelationIdLog } from '../util/logger';

// Only use stealth plugin on non-Windows environments
if (process.platform !== 'win32') {
  const stealthPlugin = StealthPlugin();
  stealthPlugin.enabledEvasions.delete('iframe.contentWindow');
  stealthPlugin.enabledEvasions.delete('media.codecs');
  chromium.use(stealthPlugin);
}

export type BotType = 'microsoft' | 'google' | 'zoom';

// Removed 'Browser' since launchPersistentContext directly returns a BrowserContext
function attachBrowserErrorHandlers(context: BrowserContext, page: Page, correlationId: string) {
  const log = getCorrelationIdLog(correlationId);

  context.on('close', () => {
    console.log(`${log} Browser context has closed!`);
  });

  page.on('crash', (page) => {
    console.error(`${log} Page has crashed! ${page?.url()}`);
  });

  page.on('close', (page) => {
    console.log(`${log} Page has closed! ${page?.url()}`);
  });
}

// Updated to return Promise<BrowserContext> instead of Promise<Browser>
async function launchContextWithTimeout(launchFn: () => Promise<BrowserContext>, timeoutMs: number, correlationId: string): Promise<BrowserContext> {
  let timeoutId: NodeJS.Timeout;
  let finished = false;

  return new Promise((resolve, reject) => {
    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!finished) {
        finished = true;
        reject(new Error(`Browser context launch timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Start launch
    launchFn()
      .then(result => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          console.log(`${getCorrelationIdLog(correlationId)} Browser context launch function success!`);
          resolve(result);
        }
      })
      .catch(err => {
        console.error(`${getCorrelationIdLog(correlationId)} Error launching browser context`, err);
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          reject(err);
        }
      });
  });
}

async function createBrowserContext(url: string, correlationId: string, botType: BotType = 'google'): Promise<Page> {
  const size = { width: 1280, height: 720 };

  // Minimal args for Windows compatibility
  const baseBrowserArgs: string[] = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
  ];

  const fakeDeviceArgs: string[] = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ];

  const browserArgs = botType === 'microsoft'
    ? [...baseBrowserArgs, ...fakeDeviceArgs]
    : baseBrowserArgs;

  console.log(`${getCorrelationIdLog(correlationId)} Launching browser for ${botType} bot`);

  const userDataDir = path.resolve('./chrome-profile');
  
  // Build launch options with optional executable path
  const launchOptions: any = {
    headless: false,
    args: browserArgs,
    permissions: ['camera', 'microphone'],
    viewport: size,
    ignoreHTTPSErrors: true,
  };

  // Only set executablePath if provided in config, otherwise let Playwright find it
  if (config.chromeExecutablePath) {
    launchOptions.executablePath = config.chromeExecutablePath;
  }
  
  const context = await launchContextWithTimeout(
    async () => await chromium.launchPersistentContext(userDataDir, launchOptions),
    60000,
    correlationId
  );

  console.log(`${getCorrelationIdLog(correlationId)} Browser context created successfully!`);

  // Grant permissions
  await context.grantPermissions(['microphone', 'camera'], { origin: url });

  // Get or create page
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Attach error handlers
  attachBrowserErrorHandlers(context, page, correlationId);

  console.log(`${getCorrelationIdLog(correlationId)} Browser launched successfully!`);

  return page;
}

export default createBrowserContext;