/** Process exit codes used by every `colt` invocation. */
export const ExitCode = {
  /** The command completed and the source was valid. */
  Success: 0,
  /** The source produced one or more Colt diagnostics. */
  Diagnostics: 1,
  /** The command line itself was invalid, or an input file could not be read. */
  UsageError: 2,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
