import OnyxApp from "../onyx-app";
import { initialRoute, type RouteSearchParams } from "@/lib/initial-route";

export default async function RoutedPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const { path } = await params;
  return <OnyxApp initialRoute={initialRoute(`/${path.join("/")}`, await searchParams)} />;
}
