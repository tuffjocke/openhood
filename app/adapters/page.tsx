import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Which adapter do I need? Openhood",
  description: "The two kinds of adapter Openhood works with, what to buy and what to avoid.",
};

/** The short, plain version of docs/hardware.md. Keep the two in step. */
export default function Adapters() {
  return (
    <InfoPage title="Which adapter do I need?">
      <p className="prose-lede">
        Pick your car on the start page and Openhood tells you which one. There are two kinds, and neither costs
        much.
      </p>

      <h2>ELM327-type adapter: for most cars</h2>
      <p>
        A small plug with its own chip that speaks the standard diagnostic language of every car: petrol cars from about
        2001 and diesels from about 2004 in Europe, and from 1996 in the US. About €20 to €40. It reads the standard
        fault codes and live data.
      </p>
      <ul>
        <li>
          <strong>Best:</strong> an adapter from the OBDLink range. They cost more and simply work.
        </li>
        <li>
          <strong>Budget:</strong> among cheap copies, ones sold as &ldquo;v1.5&rdquo; with a PIC18F25K80 chip are the
          usual advice. Many &ldquo;v2.1&rdquo; copies drop answers.
        </li>
        <li>
          <strong>USB or Bluetooth both work.</strong> Adapters that need pairing (often with PIN 1234 or 0000) must be
          paired with your computer first.
        </li>
        <li>
          <strong>Wi-Fi adapters don&rsquo;t work</strong> with a browser.
        </li>
      </ul>

      <h2>KKL cable: for cars with their own profile</h2>
      <p>
        A plain USB cable that passes the older single-wire connection straight through. Openhood needs it for cars it
        knows in detail, like the Land Rover Td5, because those use the maker&rsquo;s own language. About €20. It only
        works on older cars, mostly up to about 2008.
      </p>
      <ul>
        <li>
          Sold as <strong>KKL 409.1</strong> or &ldquo;VAG-COM KKL&rdquo;. It doesn&rsquo;t matter that the listing says VW or
          Audi.
        </li>
        <li>
          Look for an <strong>FTDI FT232RL</strong> chip. Avoid CH340 chips and versions with a 4-way switch.
        </li>
      </ul>

      <h2>Good to know</h2>
      <ul>
        <li>
          <strong>USB-C laptop or phone?</strong> Most adapters have the older, larger USB plug. Add a small USB-C adapter;
          for a phone it should say OTG.
        </li>
        <li>
          <strong>Which browser?</strong> Chrome or Edge on a computer, or Chrome on Android. iPhones and iPads can&rsquo;t
          talk to adapters from a browser.
        </li>
        <li>
          <strong>Own both?</strong> Fine. Openhood works out which one you plugged in.
        </li>
        <li>
          <strong>It connects but readings stop or look wrong?</strong> With cheap adapters, the adapter is the first
          suspect.
        </li>
      </ul>
      <p>
        More detail, including pin numbers and odd cars, is in the{" "}
        <a href="https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md">full hardware guide</a>.
      </p>
    </InfoPage>
  );
}
