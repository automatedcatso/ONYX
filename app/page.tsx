import OnyxApp from "./onyx-app";
import { initialRoute, type RouteSearchParams } from "@/lib/initial-route";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  return <OnyxApp initialRoute={initialRoute("/", await searchParams)} />;
}
