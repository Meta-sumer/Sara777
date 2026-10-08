import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'app.deviceId';

/** Phone model as the admin panel shows it, e.g. "Xiaomi M2101K6I" or "iOS 17.4". */
function deviceName(): string {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  if (Platform.OS === 'android') {
    const brand = String(c.Brand ?? c.Manufacturer ?? '').trim();
    const model = String(c.Model ?? '').trim();
    const name = [brand && brand[0].toUpperCase() + brand.slice(1), model].filter(Boolean).join(' ');
    return name || `Android ${String(c.Release ?? Platform.Version)}`;
  }
  return `${String(c.systemName ?? Platform.OS)} ${String(c.osVersion ?? Platform.Version)}`.trim();
}

/** A random 16-character id made on first launch and kept on the device. */
async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (saved) return saved;
  const id = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/** Sent with login / register so the admin sees which device an account uses. */
export async function deviceInfo(): Promise<{ deviceName: string; deviceId: string }> {
  try {
    return { deviceName: deviceName(), deviceId: await deviceId() };
  } catch {
    return { deviceName: Platform.OS, deviceId: '' };
  }
}
