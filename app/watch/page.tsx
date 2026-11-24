import type { Metadata } from "next";
import { Watch } from "@/components/Watch";

export const metadata: Metadata = { title: "Openhood live view" };

/** What an agent reads through the MCP server, live. Served by the MCP server itself (cli/watch-server.ts). */
export default function WatchPage() {
  return <Watch />;
}
