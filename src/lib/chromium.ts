import { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import config from '../config';
import { getCorrelationIdLog } from '../util/logger';

const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('iframe.contentWindow');
stealthPlugin.enabledEvasions.delete('media.codecs');
chromium.use(stealthPlugin);

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

  // Base browser args used by all bots
const baseBrowserArgs: string[] = [
  '--no-sandbox',                  // CRITICAL FOR DOCKER
    '--disable-dev-shm-usage',       // CRITICAL FOR DOCKER
    '--disable-setuid-sandbox',
    // --- YOUR EXISTING REQUIRED FLAGS ---
    '--enable-usermedia-screen-capturing',
    '--allow-http-screen-capture',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    `--window-size=${size.width},${size.height}`,
    '--auto-accept-this-tab-capture',
    '--enable-features=MediaRecorder',
    '--enable-audio-service-out-of-process',
    '--autoplay-policy=no-user-gesture-required',
    
    // --- NEW PERFORMANCE & SPEED FLAGS ---
    '--disable-extensions',                     // Stops Chrome from loading heavy extensions in the profile
    '--no-proxy-server',                        // Bypasses any local proxy delays
    '--disable-background-networking',          // Stops Chrome from calling home to Google for updates
    '--disable-background-timer-throttling',    // Forces JS to run at full speed even in background
    '--disable-backgrounding-occluded-windows', // Stops Chrome from sleeping tabs
    '--disable-renderer-backgrounding',         // Keeps the renderer thread at high priority
    '--disable-client-side-phishing-detection', // Turns off Google's slow security scanner
    '--disable-sync',                           // Prevents it from trying to sync  bookmarks/history
    '--metrics-recording-only',                 // Stops reporting metrics to Google
    '--mute-audio',                             // (Optional) Mutes output audio to save processing
  ];

  const fakeDeviceArgs: string[] = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ];

  const browserArgs = botType === 'microsoft'
    ? [...baseBrowserArgs, ...fakeDeviceArgs]
    : baseBrowserArgs;

  const displayArgs = botType === 'microsoft'
    ? ['--kiosk', '--start-maximized']
    : [];

  console.log(`${getCorrelationIdLog(correlationId)} Launching browser for ${botType} bot (fake devices: ${botType === 'microsoft'})`);

  const linuxX11UserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

  // Use launchPersistentContext, combining the old launch() and newContext() properties
  const context = await launchContextWithTimeout(
    async () => await chromium.launchPersistentContext('./chrome-profile', {
      headless: false, // Kept false for local Mac testing POC
      args: [
        ...browserArgs,
        ...displayArgs,
      ],
      ignoreDefaultArgs: ['--mute-audio'],
executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      permissions: ['camera', 'microphone'],
      viewport: size,
      ignoreHTTPSErrors: true,
      // userAgent: linuxX11UserAgent,
      ...(process.env.NODE_ENV === 'development' && {
        recordVideo: {
          dir: './debug-videos/',
          size: size,
        },
      }),
    }),
    60000,
    correlationId
  );

  // Grant permissions so Teams will play audio (Teams requires this unlike Google Meet)
  await context.grantPermissions(['microphone', 'camera'], { origin: url });

  // Persistent contexts open with a blank page by default. 
  // We grab the existing one instead of creating a zombie tab.
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Attach common error handlers
  attachBrowserErrorHandlers(context, page, correlationId);

  console.log(`${getCorrelationIdLog(correlationId)} Browser launched successfully using persistent profile!`);

  return page;
}

export default createBrowserContext;