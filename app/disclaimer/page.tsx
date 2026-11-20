import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Disclaimer. Openhood",
  description: "Openhood is free software, provided as is. What that means in plain words.",
};

/** Same points as the Disclaimer section of the README. Keep the two in step. */
export default function Disclaimer() {
  return (
    <InfoPage title="Disclaimer">
      <p className="prose-lede">
        Openhood is a free, community-made hobby project, not a dealer or workshop tool. In plain words:
      </p>
      <ul>
        <li>
          <strong>Use it at your own risk, with the car parked.</strong> It is provided as is, without any warranty.
        </li>
        <li>
          <strong>Car profiles are made by volunteers,</strong> often with AI help, and many have not been tested on a real
          car yet. The app marks those as experimental.
        </li>
        <li>
          <strong>Explanations are guidance, not a diagnosis.</strong> They tell you what a code usually means and what to
          check first. Before you spend money or rely on the car being safe, ask a mechanic.
        </li>
        <li>
          <strong>Openhood only reads.</strong> The one exception is clearing fault codes, which only erases them. It
          doesn&rsquo;t fix anything, and it can reset the checks an emissions test looks at. Openhood asks before it
          clears.
        </li>
        <li>
          <strong>Nothing personal is collected.</strong> Everything stays in your browser. Test reports and car reports
          are only sent if you choose to, as public posts on GitHub that you can read before posting.
        </li>
      </ul>
      <p>
        Openhood is open source under the{" "}
        <a href="https://github.com/tuffjocke/openhood/blob/main/LICENSE">GPL-3.0 licence</a>, including its sections 15
        (no warranty) and 16 (limitation of liability).
      </p>
    </InfoPage>
  );
}
