export function notificationChannelInventory() {
  return (['EMAIL', 'SMS'] as const).map(channel => ({
    channel,
    configured: Boolean(process.env[`NOTIFICATIONS_${channel}_URL`] && process.env[`NOTIFICATIONS_${channel}_TOKEN`]),
  }));
}
