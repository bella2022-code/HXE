importScripts("palettes.js");

const dailyAlarmName = "hxe-daily-palette-refresh";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value) {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 100000, 17);
}

function getDailyPalette() {
  const palettes = self.HXE_PALETTES || [];
  if (!palettes.length) return null;
  const weighted = palettes.flatMap((palette) =>
    Array.from({ length: Math.max(1, Math.round((palette.score || 80) / 12)) }, () => palette),
  );
  return weighted[hashString(todayKey()) % weighted.length];
}

async function refreshDailyPalette() {
  const palette = getDailyPalette();
  if (!palette) return;
  await chrome.storage.local.set({
    dailyPalette: palette,
    dailyPaletteDate: todayKey(),
    dailyPaletteUpdatedAt: new Date().toISOString(),
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(dailyAlarmName, { periodInMinutes: 60 * 24 });
  await refreshDailyPalette();
});

chrome.runtime.onStartup.addListener(refreshDailyPalette);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === dailyAlarmName) refreshDailyPalette();
});
