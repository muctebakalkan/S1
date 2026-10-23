export interface CustomerRegistrationDraft {
  email: string; password: string; fullName: string; phone: string;
}

// Passwords stay in memory while moving between the two signup screens.
// They must never enter route parameters, disk storage, or signup metadata.
let customerDraft: { value: CustomerRegistrationDraft; expiresAt: number } | null = null;
export function setCustomerRegistrationDraft(value: CustomerRegistrationDraft) {
  customerDraft = { value: { ...value }, expiresAt: Date.now() + 15 * 60 * 1000 };
}
export function getCustomerRegistrationDraft(): CustomerRegistrationDraft | null {
  if (!customerDraft || customerDraft.expiresAt <= Date.now()) {
    customerDraft = null;
    return null;
  }
  return { ...customerDraft.value };
}
export function clearCustomerRegistrationDraft() { customerDraft = null; }
