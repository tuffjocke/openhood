# Adding a vehicle

A vehicle is one folder in `/profiles`. You don't need to touch the core or the UI.
If you use an AI agent, the `/add-vehicle` command in Claude Code does the scaffolding for you.

## What you need to know about your car

| Question | Example (Td5) |
| --- | --- |
| Which ECU and which OBD pin carries the K-line? | Engine ECU, pin 7 |
| Baud rate | 10400 |
| Wake-up | ISO 14230 fast init (5-baud slow init is not supported yet) |
| ECU and tester addresses | `0x13`, `0xF7` |
| How to start a session | `81` addressed, then `10 A0` |
| Security access needed to read data? Which algorithm? | Yes, `27 01` / `27 02`, see `keygen.ts` |
| Which requests return which values, with what scaling? | `21 09` → rpm as 16-bit |

Forums, workshop manuals, other open-source tools and sniffing a commercial tool's traffic are
all good sources. Link them in the profile README.

## Steps

1. Copy the template:
   ```
   cp -r profiles/_template profiles/volvo-850-r
   ```
2. In `index.ts`, set `id` (same as the folder), `name`, `covers`, `ecu`, `link` and `connect`.
3. Add **channels**: what the UI shows. Label, unit, decimals, a sensible min/max for the trace,
   optional `warnAbove` / `warnBelow`.
4. Add **groups**: one per request. `decode` turns the response payload into values. The response
   payload starts with the positive SID, so `[0x61, localId, data...]` means data from index 2.
   Values that depend on other values can read `state` (see Td5 `manifold` using `ambientKpa`).
5. Add `encode` next to each `decode`, and a **simulator** whose `handle` answers the same requests.
6. Set the **schedule**: list fast groups several times to poll them more often.
7. Optional: **faults** with `read` and `clear`.
8. Register in `profiles/index.ts` and run `npm run check`.
9. Fill in the profile README: status table, connect bytes, sources, "tested on".

## Confidence levels

Every channel, group and fault table has a `confidence`:

- `verified`: checked on a real car. Say which car in the README.
- `community`: from a source, not yet checked.
- `guess`: placeholder.

Be honest. A wrong "verified" costs other people hours.

## Testing on a real car

1. `npm run dev`, open in Chrome, select your profile, ignition on, **Connect cable**.
2. Open **K-line traffic**. Every request and response is there with timestamps.
3. If it fails, the traffic log shows where: no answer to start communication (init or address),
   `7F xx 33` (security needed), `7F 27 35` (wrong key), `7F xx 11/12/31` (wrong request).
4. Compare live values with the dashboard gauges, then mark what you checked as `verified`.
5. Open a pull request with the traffic snippet in the description.
