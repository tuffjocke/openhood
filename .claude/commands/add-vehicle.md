---
description: Scaffold a new vehicle profile from the template
argument-hint: <make and engine/ECU, e.g. "BMW M52 Siemens MS41">
---

Add a new vehicle profile for: $ARGUMENTS

1. Read AGENTS.md, core/profile.ts, docs/adding-a-vehicle.md and profiles/land-rover-td5/ first.
2. Pick a kebab-case id (make-engine or make-ecu) and copy profiles/_template to profiles/<id>.
3. Research what is publicly known about this ECU's K-line protocol: baud rate, init type,
   addresses, session, security, local ids and scalings. Cite every source in the profile README.
   Mark everything "community" or "guess". Never "verified".
4. If the ECU needs something core/profile.ts can't express (e.g. 5-baud slow init), stop and
   propose a general change to the core before writing the profile.
5. Fill in `vehicles` using only names from profiles/names.ts and model years you can source.
   If the model is missing there, add it with the official spelling, alphabetically, and tell the person.
6. Implement channels, groups (encode next to decode), schedule, faults if known, and a simulator.
7. Register it in profiles/index.ts.
8. Run `npm run check` and fix everything.
9. Summarise what is sourced, what is guessed and what a person needs to verify on a real car.
