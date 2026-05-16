const ALARM_NAME = 'inactivity-check'

export function setupAlarm(intervalHours: number): void {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: intervalHours * 60,
  })
}

export function onAlarm(callback: () => void): void {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM_NAME) callback()
  })
}
