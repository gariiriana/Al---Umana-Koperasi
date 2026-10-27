// HTTP helpers for the absensi Worker. Every error leaves as {error: {code, message, details}}.

export class AbsensiError extends Error {
  constructor(code, status, details = undefined) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
