# Contributing

Thanks for helping. The most valuable contributions, in order:

1. **Testing on a real car.** Run the app, connect, then click **Send test report** at the bottom of
   the page. It opens a GitHub issue with your car, the values and the K-line traffic filled in;
   just answer the two questions. Even "connects but rpm reads double" is gold.
2. **New vehicles.** See [docs/adding-a-vehicle.md](docs/adding-a-vehicle.md).
3. **Verifying existing profiles.** Move things from `community` to `verified`, with the car you tested on.
4. **Core features** listed in [docs/architecture.md](docs/architecture.md).

## Pull requests

- Run `npm run check` before opening.
- One vehicle or one feature per PR.
- For protocol changes, paste the relevant K-line traffic in the description.
- Link your sources. No sources, no "verified".
- AI-written code is welcome. You are responsible for it: read it, run it, and say what you tested.

## Ground rules

- Read-only by default. Anything that writes to an ECU beyond clearing faults needs an issue first.
- No immobiliser, key programming, odometer or emissions-defeat features.
- Be kind. Most people here are hobbyists with greasy hands.

By contributing you agree that your work is licensed under GPL-3.0.
