/**
 * Dev mode lets one client simulate several players without logging in:
 * authentication and role checks are skipped and fake player ids are generated.
 *
 * It only activates inside the Firebase emulator, which sets FUNCTIONS_EMULATOR
 * automatically. A DEV=true that ends up in a deployed .env file is ignored.
 */
export function isDevMode(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" && process.env.DEV === "true"
}
