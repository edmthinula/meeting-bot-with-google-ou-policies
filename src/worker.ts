// src/worker.ts
import { GoogleMeetBot } from './bots/GoogleMeetBot';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

// 1. Create a simple Winston logger to satisfy the bot's constructor
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
  ),
  transports: [new winston.transports.Console()],
});

async function main() {
  const meetingUrl = process.env.MEETING_URL;

  if (!meetingUrl) {
    logger.error('FATAL: MEETING_URL environment variable is not set.');
    process.exit(1);
  }

  logger.info(`[Worker] Starting ephemeral bot for meeting: ${meetingUrl}`);

  try {
    // 2. Pass the logger and a correlationId to the constructor
    const correlationId = uuidv4();
    const bot = new GoogleMeetBot(logger, correlationId);

    // 3. Call the correct .join() method with required JoinParams
    // Provide JoinParams; cast to any to satisfy local POC where full types may not be available
    await bot.join({
      url: meetingUrl,
      bearerToken: 'local-test-token', // Dummy data for local POC
      teamId: 'local-poc-team',
      userId: 'local-poc-user',
      eventId: 'local-poc-event',
      botId: 'local-poc-bot',
      name: 'Local POC Bot',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uploader: {}, // minimal placeholder; adjust to real shape as needed
    } as any);

    logger.info(
      '[Worker] Meeting concluded. Shutting down container gracefully.',
    );
    process.exit(0);
  } catch (error) {
    logger.error('[Worker] Bot encountered a fatal error:', error);
    process.exit(1);
  }
}

main();
