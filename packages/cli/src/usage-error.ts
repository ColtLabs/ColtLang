/** Raised when the command line cannot be interpreted as a supported `colt` invocation. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
