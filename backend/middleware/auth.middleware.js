import { clerkClient } from '../lib/clerk.js';
import dotenv from 'dotenv';

dotenv.config();

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token header.' });
    }

    // Construct a standard Web API Request from the Express req object.
    // Clerk SDK's authenticateRequest expects a standard Request object.
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, val]) => {
      if (val) {
        if (Array.isArray(val)) {
          val.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, val);
        }
      }
    });

    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers
    });

    // Verify token using the client instance from lib/clerk.js
    const requestState = await clerkClient.authenticateRequest(webRequest, {
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!requestState.isAuthenticated) {
      return res.status(401).json({ 
        error: 'Unauthorized: Invalid token.', 
        reason: requestState.reason 
      });
    }

    // Attach the verified user payload onto req.user
    req.user = requestState.toAuth();
    next();
  } catch (error) {
    console.error('Clerk Authentication Middleware Error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

