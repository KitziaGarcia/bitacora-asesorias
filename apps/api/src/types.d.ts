declare global {
  namespace Express {
    interface Request {
      student?: { id: string; name: string };
    }
  }
}
export {};
