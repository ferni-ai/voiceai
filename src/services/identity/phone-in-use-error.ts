/**
 * A family member's phone number already belongs to someone else's identity.
 * A number maps to exactly one identity, so a call can be recognised; the API
 * answers this with 409 rather than a server error. The message keeps
 * "already registered", which the voice self-registration tool matches on.
 */
export class PhoneInUseError extends Error {
  constructor(phoneNumber: string) {
    super(`Phone number ${phoneNumber} is already registered to another identity`);
    this.name = 'PhoneInUseError';
  }
}
