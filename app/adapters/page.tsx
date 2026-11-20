import type { Metadata } from "next";
import { AdapterPicks } from "@/components/AdapterPicks";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Which adapter do I need? Openhood",
  description: "The two kinds of adapter Openhood works with, what to buy and what to avoid.",
};

/** The short, plain version of docs/hardware.md. Keep the two in step. */
export default function Adapters() {
  return (
    <InfoPage title="Which adapter do I need?">
      <p className="prose-lede">Pick your car on the start page and Openhood says which kind. These are the ones to buy.</p>

      <AdapterPicks />

      <h2>Good to know</h2>
      <ul>
        <li>
          <strong>No affiliate links.</strong> We earn nothing from these. The picks come from independent reviews.
        </li>
        <li>
          <strong>Buying something else?</strong> Avoid Wi-Fi adapters, and the cheapest no-name &ldquo;v2.1&rdquo; copies.
        </li>
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
