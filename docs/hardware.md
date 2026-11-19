# Which cable do I need?

Short answer: **the same cheap cable works for most cars from about 1996 to 2006.**
A few cars need a small adapter or a different connector. Each vehicle profile says if it does.

## The standard cable

A "dumb" **KKL cable**, sold as **VAG-COM KKL 409.1**, with an **FTDI FT232RL** chip. About €20.

- Look for "FT232RL" in the title, and only that chip.
- Get the plain version. Avoid the ones with a 4-way switch (made for Fiat ECU Scan).
- Avoid **CH340** chips: they often can't do the timing the wake-up needs.
- **Not an ELM327.** Those are a different kind of adapter and can't do manufacturer-specific
  commands, even when they say "FT232RL" on them.
- It doesn't matter that the listing says VW/Audi. The cable just passes the K-line through.

**USB-C laptop or phone?** These cables only come with USB-A. Add a small USB-A (female) to
USB-C (male) adapter. On a phone, make sure it says OTG.

**Clone chips:** many "FTDI" chips in cheap cables are copies. They usually work. If the cable
doesn't show up when you click Connect cable, the chip is the first suspect.

## Does my car use K-line?

Look into the OBD socket (usually under the dashboard). Number the pins like this, looking at the socket:

```
  1  2  3  4  5  6  7  8
   9 10 11 12 13 14 15 16
```

- **Metal contact in position 7**: your car has a K-line. The standard cable is a good bet.
- **Contacts in 6 and 14 but not 7**: your car uses CAN. Openhood doesn't support CAN yet.
- **No 16-pin socket at all**, or a round or odd-shaped one: older or manufacturer-specific
  connector. You'll need an adapter to a 16-pin OBD socket for your make.

Some cars have both K-line and CAN, and some have K-line on more than one ECU. The vehicle profile
says which one it talks to.

## Cars that need something extra

Known cases, add yours when you find one:

| Car | What's different |
| --- | --- |
| Many pre-1996 cars | Manufacturer connector under the hood: needs an adapter cable to OBD |
| Some BMWs, late 1990s | Need OBD pins 7 and 8 bridged. "K+DCAN" cables have a switch for this |

## For profile authors

Put anything cable-specific in the profile's `hardware` field. It's shown in the app before
connecting, and repeat it in the profile README.
