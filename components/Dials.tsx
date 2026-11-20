import type { Channel, ChannelGroup, Values, VehicleProfile } from "@/core/profile";
import { Dial } from "./Dial";

/**
 * Which readings a profile shows as dials and which as charts. The profile's `dials` decide;
 * without them the first three channels get dials. Charts are ordered by group (air, engine, fuel).
 */
export function dialLayout(profile: VehicleProfile) {
  const d = profile.dials ?? { main: profile.channels[0]?.key, left: profile.channels[1]?.key, right: profile.channels[2]?.key };
  const byKey = (k?: string) => profile.channels.find((c) => c.key === k);
  const dials = [
    { channel: byKey(d.left), big: false },
    { channel: byKey(d.main), big: true },
    { channel: byKey(d.right), big: false },
  ].filter((x): x is { channel: Channel; big: boolean } => !!x.channel);
  const battery = byKey(profile.dials?.battery);
  const used = new Set([d.main, d.left, d.right, profile.dials?.battery]);
  const rank = (c: Channel) => (c.group ? GROUP_ORDER.indexOf(c.group) : GROUP_ORDER.length);
  const charts = profile.channels.filter((c) => !used.has(c.key)).sort((a, b) => rank(a) - rank(b));
  return { dials, battery, charts, groups: GROUP_ORDER.filter((g) => charts.some((c) => c.group === g)) };
}

export const GROUP_ORDER: ChannelGroup[] = ["air", "engine", "fuel"];
export const GROUP_NAMES: Record<ChannelGroup, string> = { air: "Air in", engine: "Engine", fuel: "Fuel" };

/** The row of dials: the big one in the middle, the others either side, the battery bar in the big one. */
export function DialRow({
  profile,
  values,
  unavailable,
}: {
  profile: VehicleProfile;
  values: Partial<Values>;
  unavailable?: Set<string>;
}) {
  const { dials, battery } = dialLayout(profile);
  return (
    <div className="dials">
      {dials.map(({ channel, big }) => (
        <Dial
          key={channel.key}
          channel={channel}
          big={big}
          value={values[channel.key]}
          unavailable={unavailable?.has(channel.key)}
          battery={big && battery ? { channel: battery, value: values[battery.key] } : undefined}
        />
      ))}
    </div>
  );
}
