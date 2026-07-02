import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Construct standard redis connection URL:
let redisUrl = 'redis://';
if (REDIS_PASSWORD) {
  // Safe encoding of the password in case it contains special characters
  redisUrl += `:${encodeURIComponent(REDIS_PASSWORD)}@`;
}
redisUrl += `${REDIS_HOST}:${REDIS_PORT}`;

export const redisClient = createClient({
  url: redisUrl
});

redisClient.on('error', (err) => {
  console.error('[Redis] Connection Error:', err);
});

redisClient.on('connect', () => {
  console.log('[Redis] Establishing connection to server...');
});

redisClient.on('ready', () => {
  console.log('[Redis] Connection verified. Client is ready!');
});

redisClient.on('end', () => {
  console.log('[Redis] Connection closed.');
});

// Asynchronously connect the client to server on module import
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('[Redis] Asynchronous connection initialization failed:', error);
  }
})();
