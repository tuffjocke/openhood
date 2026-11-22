# Which adapter do I need?

Short answer: **pick your car in Openhood and it tells you.** Behind that answer are two kinds of
adapter, and the car's profile decides which one works:

| | ELM327-type adapter | KKL cable |
| --- | --- | --- |
| What it is | A small adapter with its own chip that speaks every standard OBD protocol | A plain USB cable that passes the K-line straight through |
| Cars | Any car with standard OBD-II: petrol from about 2001 and diesel from about 2004 in Europe, 1996 in the US, CAN cars included | K-line cars only, mostly up to about 2008 |
| Reads | Standard fault codes and live data, plus the Volvo 850, S70, V70 and C70 ABS, airbag and instruments, every module on 2004 and newer Volvos, and the Saab Trionic 7 and 8 engines | Standard codes **and** manufacturer-specific profiles (like the Land Rover Td5 and SLABS, older VW and Audi engines, Saab Trionic 7 and BMW DS2 modules) |
| Connects by | USB, or Bluetooth | USB |
| Price | About €20 to €40 | About €20 |

So: **most people want an ELM327-type adapter.** People with a car that has its own profile, or
who want to add one for an older car, want a KKL cable. Owning both is fine: Openhood works out
which one you plugged in.

## ELM327-type adapters

ELM327 is the name of a chip by Elm Electronics. Almost every cheap OBD adapter runs a copy of its
firmware, with very mixed quality. Common advice from the OBD community:

- **Genuine STN-based adapters** (the OBDLink range from ScanTool.net) are the most reliable, and cost
  more.
- **Among clones**, ones sold as "v1.5" with a **PIC18F25K80** chip are the usual recommendation.
  Many "v2.1" clones leave out commands and drop answers.
- If an adapter connects but readings stop or come back garbled, the adapter is the first suspect.

**The ones we name** (in the app under "What to buy", from `core/adapters.ts`): Vgate iCar Pro 2S and
Veepeak OBDCheck BLE as budget Bluetooth picks, OBDLink EX for USB, OBDLink MX+ as the best. They come
from independent reviews ([iamcarhacker.com](https://iamcarhacker.com/best-elm327-obd2-adapters/),
[OBDLink's own comparison](https://support.obdsol.com/support/solutions/articles/43000713351)), not from
our testing. The app says "not tested with Openhood yet" for each until a car report names it. The
links are shop searches by product name, never affiliate links.

How to connect it:

- **USB adapter:** plug it in, press **Read my car**, choose it in the list.
- **Bluetooth Low Energy adapter** (often sold as "BLE" or "Bluetooth 4.0"): press **Bluetooth adapter**
  and choose it in the list. Works in Chrome on Android and on computers.
- **Classic Bluetooth adapter** (needs pairing, often with PIN 1234 or 0000): pair it with your computer
  in the system settings first. It then shows up in the list when you press **Read my car**.
- **Wi-Fi adapters don't work.** Browsers can't open the kind of connection they need.
- **iPhone and iPad:** no browser there can talk to adapters yet, by Apple's choice.

Openhood finds the adapter's speed by itself (it tries 38400, 115200 and 9600 baud).

## The KKL cable

A "dumb" **KKL cable**, sold as **VAG-COM KKL 409.1**, with an **FTDI FT232RL** chip. About €20.

- Look for "FT232RL" in the title, and only that chip.
- Get the plain version. Avoid the ones with a 4-way switch (made for Fiat ECU Scan).
- Avoid **CH340** chips: they often can't do the timing the wake-up needs.
- It doesn't matter that the listing says VW/Audi. The cable just passes the K-line through. (It is
  also exactly the cable older VW and Audi engines need.)
- If an older VW or Audi stops part way through a read, the cable's USB delay may be too long for
  KWP1281, where every byte is answered. On Windows you can lower the FTDI "latency timer" to 1 ms
  in the port's advanced settings.
- An ELM327 adapter is not a KKL cable, even when its listing mentions FT232RL.

**USB-C laptop or phone?** These cables and most USB adapters only come with USB-A. Add a small
USB-A (female) to USB-C (male) adapter. On a phone, make sure it says OTG.

**Clone chips:** many "FTDI" chips in cheap cables are copies. They usually work. If the cable
doesn't show up in the list, the chip is the first suspect.

## Which connection does my car use?

Look into the 16-pin socket (usually under the dashboard, driver's side). Number the pins like
this, looking at the socket:

```
  1  2  3  4  5  6  7  8
   9 10 11 12 13 14 15 16
```

- **Metal contact in position 7**: your car has a K-line. Both kinds of adapter can work.
  Some cars (often Asian and older European) wake up with a slower 5-baud signal; Openhood tries
  that automatically, it just takes a few extra seconds.
- **Contacts in 6 and 14 but not 7**: your car uses CAN. You need an ELM327-type adapter.
- **No 16-pin socket at all**, or a round or odd-shaped one: older or manufacturer-specific
  connector. You'll need an adapter to a 16-pin socket for your make.

Some cars have both K-line and CAN, and some have K-line on more than one ECU. The vehicle profile
says which one it talks to.

## Cars that need something extra

Known cases, add yours when you find one:

| Car | What's different |
| --- | --- |
| Many pre-1996 cars | Manufacturer connector under the hood: needs an adapter cable to OBD |
| Some BMWs, late 1990s | Need OBD pins 7 and 8 bridged. "K+DCAN" cables have a switch for this |

## For profile authors

- Say which adapters your profile runs on in `adapters`, the recommended one first. Use `["kkl"]`
  for anything manufacturer-specific (own wake-up, security unlock, local identifiers). Add
  `"elm327"` only if every request is standard OBD-II, since that's all those adapters reliably pass.
- Put anything else hardware-specific in the profile's `hardware` field. It's shown in the app before
  connecting. Repeat it in the profile README.
