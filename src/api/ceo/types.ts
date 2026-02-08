/**
 * Type augmentation for Express Request with auth middleware
 */
declare module 'express' {
  interface Request {
    user?: { uid: string };
  }
}

export {};
