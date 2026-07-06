const INSTALL_ID_KEY = 'obsrec-install-id';

export async function getInstallId(): Promise<string> {
  const existing = localStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;

  const installId = crypto.randomUUID();
  localStorage.setItem(INSTALL_ID_KEY, installId);
  return installId;
}
