import { JoinParams } from './AbstractMeetBot';
import { BotStatus } from '../types';
import config from '../config';
import { patchBotStatus } from '../services/botService';
import { MeetBotBase } from './MeetBotBase';
import { v4 } from 'uuid';
import { Logger } from 'winston';
import { retryActionWithWait } from '../util/resilience';
import createBrowserContext from '../lib/chromium';

export class GoogleMeetBot extends MeetBotBase {
  private _logger: Logger;
  private _correlationId: string;

  constructor(logger: Logger, correlationId: string) {
    super();
    this.slightlySecretId = v4();
    this._logger = logger;
    this._correlationId = correlationId;
  }

  async join({ url, bearerToken, teamId, userId, eventId, botId }: JoinParams): Promise<void> {
    const _state: BotStatus[] = ['processing'];
    const pushState = (st: BotStatus) => _state.push(st);

    try {
      this._logger.info('Starting Enterprise  Join Flow...', { userId, teamId });
      
      await this.joinMeeting({ url, teamId, userId, eventId, botId, pushState });

      if (_state.includes('joined')) {
        pushState('finished');
      }

      await patchBotStatus({ botId, eventId, provider: 'google', status: _state, token: bearerToken }, this._logger);
    } catch(error) {
      this._logger.error('Error during meeting join/monitor flow', { error });
      
      if (!_state.includes('finished')) {
        _state.push('failed');
      }

      await patchBotStatus({ botId, eventId, provider: 'google', status: _state, token: bearerToken }, this._logger);
      throw error;
    }
  }

  private async joinMeeting({ url, teamId, userId, pushState }: Partial<JoinParams> & { pushState(state: BotStatus): void }): Promise<void> {
    this._logger.info('Launching persistent browser...');

    // Launch the persistent profile
    this.page = await createBrowserContext(url as string, this._correlationId, 'google');

    this._logger.info('Navigating to Google Meet URL...');
const meetUrlObj = new URL(url as string);
    meetUrlObj.searchParams.set('authuser', '0');
    const finalUrl = meetUrlObj.toString();
    
    await this.page.goto(finalUrl, { waitUntil: 'domcontentloaded' });

    this._logger.info('Waiting for page to settle...');
    await this.page.waitForTimeout(5000);

    // 1. Dismiss any potential device tooltips or "Got it" modals that might block the UI
    try {
      const gotItButtons = await this.page.locator('button', { hasText: 'Got it' }).all();
      for (const btn of gotItButtons) {
         if (await btn.isVisible()) {
             await btn.click();
             this._logger.info('Dismissed a "Got it" modal.');
         }
      }
    } catch (e) {
      // Ignore if not found
    }

    // 2. Click "Join now" (Authenticated Enterprise Flow)
    this._logger.info('Looking for "Join now" button...');
    await retryActionWithWait(
      'Clicking the "Join now" button',
      async () => {
        const joinButton = await this.page.locator('button', { hasText: /Join now/i }).first();
        if (await joinButton.count() > 0 && await joinButton.isVisible()) {
          await joinButton.click({ timeout: 5000 });
          this._logger.info('Successfully clicked "Join now"!');
        } else {
          throw new Error('Join now button not visible yet...');
        }
      },
      this._logger,
      3,
      10000
    );

    // Give it a moment to transition from the lobby to the actual meeting room
    await this.page.waitForTimeout(5000);
    pushState('joined');
    this._logger.info('Bot has entered the meeting room. Native Workspace recording should trigger (if configured).');

    // 3. Monitor Meeting State (Wait until meeting ends or bot is alone)
    await this.monitorMeeting(teamId as string, userId as string);
  }

  private async monitorMeeting(teamId: string, userId: string): Promise<void> {
    const maxDuration = config.maxRecordingDuration * 60 * 1000;
    const startTime = Date.now();
    let isMeetingActive = true;

    this._logger.info(`Starting meeting monitor. Max duration: ${config.maxRecordingDuration} minutes.`);

    while (isMeetingActive && (Date.now() - startTime < maxDuration)) {
      // Check every 10 seconds
      await this.page?.waitForTimeout(10000);

      if (!this.page || this.page.isClosed()) {
        this._logger.info('Browser page was closed externally.');
        break;
      }

      try {
        const status = await this.page.evaluate(() => {
          const bodyText = document.body.innerText;
          
          // Check if bot was kicked
          if (bodyText.includes("You've been removed from the meeting") || 
              bodyText.includes("Left the meeting")) {
            return { active: false, reason: 'kicked' };
          }

          // Check participant count
          // Looks for aria-labels like "People - 2 joined"
          const allButtons = Array.from(document.querySelectorAll('button'));
          let participantCount = -1;

          for (const btn of allButtons) {
            const label = btn.getAttribute('aria-label');
            if (label && label.includes('People')) {
              const match = label.match(/People.*?(\d+)/);
              if (match) {
                participantCount = parseInt(match[1], 10);
                break;
              }
            }
          }

          return { active: true, participantCount };
        });

        if (!status.active) {
          this._logger.info(`Meeting ended. Reason: ${status.reason}`);
          isMeetingActive = false;
          break;
        }

        // If count is successfully parsed and bot is alone, leave the meeting.
        if (status.participantCount !== -1 && status.participantCount < 2) {
           this._logger.info('Bot is the only participant left in the room. Ending session.', { teamId, userId });
           isMeetingActive = false;
           break;
        }

      } catch (error) {
        this._logger.error('Error during meeting monitor evaluation', { error });
      }
    }

    if (isMeetingActive) {
       this._logger.info('Max meeting duration reached. Ending session.');
    }

    // Gracefully close the browser
    this._logger.info('Closing the browser context...');
    await this.page?.context().browser()?.close();
  }
}