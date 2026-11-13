export type DestinationChannel =
  | "email"
  | "sms";

export function maskDestination(
  channel: DestinationChannel,
  value: string,
): string {
  if (channel === "email") {
    const [local, domain] =
      value.split("@");

    if (!domain) {
      return "***";
    }

    return (
      local.slice(0, 1) +
      "*".repeat(
        Math.max(local.length - 1, 2),
      ) +
      "@" +
      domain
    );
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return (
    value.slice(0, 3) +
    "*".repeat(
      Math.max(value.length - 6, 2),
    ) +
    value.slice(-3)
  );
}
