const SETUP_COMPLETE_KEY = "racksmith_setup_complete";
const WANTS_RACK_KEY = "racksmith_wants_rack";

export function getSetupComplete(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SETUP_COMPLETE_KEY) === "true";
}

export function setSetupComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETUP_COMPLETE_KEY, "true");
}

export function getWantsRack(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(WANTS_RACK_KEY);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function setWantsRack(value: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WANTS_RACK_KEY, String(value));
}
