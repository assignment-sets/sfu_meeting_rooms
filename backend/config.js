// backend/config.js
import os from 'os';

export const config = {
  // MediaSoup Worker settings
  worker: {
    rtcMinPort: 20000,
    rtcMaxPort: 20100,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  },
  // MediaSoup Router settings (Supported Codecs)
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8', // VP8 is easiest to test with and highly compatible
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ],
  },
  // MediaSoup WebRtcTransport settings
  webRtcTransport: {
    listenInfos: [
      {
        protocol: 'udp',
        ip: '127.0.0.1', // For local testing, bind to localhost
        // announcedAddress: 'YOUR_PUBLIC_IP' // Leave commented out for local development
      },
      {
        protocol: 'tcp',
        ip: '127.0.0.1',
      }
    ],
    initialAvailableOutgoingBitrate: 1000000,
  }
};
