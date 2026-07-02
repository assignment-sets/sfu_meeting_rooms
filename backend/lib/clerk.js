import { createClerkClient } from '@clerk/backend';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Clerk with your secret key directly from process.env
export const clerkClient = createClerkClient({ 
  secretKey: process.env.CLERK_SECRET_KEY 
});
