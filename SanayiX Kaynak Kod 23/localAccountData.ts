type LocalStorage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
};
/** Preserve legacy data for other accounts that have used this device. */
export async function clearLocalAccountData(storage: LocalStorage, userId: string) {
  if (!userId) throw new Error('Silinen hesap doğrulanamadı.');
  const favorites = (await storage.getAllKeys()).filter(key => key.startsWith(`sanayix:favorites:v1:${userId}:`));
  const fuelKey = '@sanayix/fuel-entries-v1';
  const raw = await storage.getItem(fuelKey);
  if (raw) {
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('Cihazdaki eski yakıt verileri okunamadı.');
    const retained = entries.filter(entry => entry?.user_id !== userId);
    if (retained.length !== entries.length) {
      if (retained.length) await storage.setItem(fuelKey, JSON.stringify(retained));
      else favorites.push(fuelKey);
    }
  }
  await storage.multiRemove(favorites);
}
