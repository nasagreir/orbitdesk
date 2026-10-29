import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/auth/paths";
import {
  getStarlinkModel,
  isStarlinkModelId,
  type StarlinkModelId,
} from "@/lib/starlink-models";

export interface DevicePrefs {
  modelId?: StarlinkModelId;
  roamEnabled?: boolean;
  roamNote?: string;
}

interface PrefsFile {
  devices: Record<string, DevicePrefs>;
}

function prefsPath() {
  return path.join(getDataDir(), "device-prefs.json");
}

async function ensureDataDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readPrefsFile(): Promise<PrefsFile> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(prefsPath(), "utf8");
    const parsed = JSON.parse(raw) as PrefsFile;
    return {
      devices:
        parsed && typeof parsed.devices === "object" && parsed.devices
          ? parsed.devices
          : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { devices: {} };
    }
    throw error;
  }
}

async function writePrefsFile(data: PrefsFile) {
  await ensureDataDir();
  const file = prefsPath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(tmp, file);
}

export async function getAllDevicePrefs(): Promise<Record<string, DevicePrefs>> {
  const data = await readPrefsFile();
  return data.devices;
}

export async function getDevicePrefs(deviceId: string): Promise<DevicePrefs> {
  const data = await readPrefsFile();
  return data.devices[deviceId] ?? {};
}

export async function updateDevicePrefs(
  deviceId: string,
  patch: DevicePrefs,
): Promise<DevicePrefs> {
  const data = await readPrefsFile();
  const current = data.devices[deviceId] ?? {};
  const next: DevicePrefs = { ...current };

  if (patch.modelId !== undefined) {
    if (!isStarlinkModelId(patch.modelId)) {
      throw new Error("Unknown Starlink model");
    }
    next.modelId = patch.modelId;
    const model = getStarlinkModel(patch.modelId);
    if (!model?.supportsRoam) {
      next.roamEnabled = false;
      next.roamNote = undefined;
    }
  }

  if (patch.roamEnabled !== undefined) {
    const modelId = next.modelId ?? current.modelId;
    const model = getStarlinkModel(modelId);
    if (patch.roamEnabled && !model?.supportsRoam) {
      throw new Error("Roam is only available on Starlink Mini");
    }
    next.roamEnabled = patch.roamEnabled;
    if (!patch.roamEnabled) {
      next.roamNote = undefined;
    }
  }

  if (patch.roamNote !== undefined) {
    next.roamNote = patch.roamNote.trim().slice(0, 80) || undefined;
  }

  data.devices[deviceId] = next;
  await writePrefsFile(data);
  return next;
}
