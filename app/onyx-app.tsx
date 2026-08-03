"use client";

/* User-selected previews and Supabase-hosted listing media require ordinary img elements. */
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isAllowedAlias } from "@/lib/alias-safety";
import { sanitizeAssistantText } from "@/lib/assistant-safety";
import { moderateListingText, type ListingModerationResult, type ModerationIssue } from "@/lib/content-safety";
import { sanitizeListingImage } from "@/lib/image-safety";
import {
  campusLocations,
  expiryLabel,
  formatRelativeTime,
  loadMarketplaceListings,
  loadUserProfile,
  marketplaceCategories,
  nearbyLocationSlugs,
  normalizeCategoryFilter,
  type Listing,
  type ListingStatus,
  type UserProfile,
} from "@/lib/marketplace";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type IconName =
  | "search" | "pin" | "arrow" | "lock" | "plus" | "heart" | "message"
  | "user" | "home" | "grid" | "bell" | "spark" | "shield" | "chevron"
  | "check" | "clock" | "filter" | "upload" | "share" | "flag" | "star"
  | "package" | "eye" | "menu" | "close" | "camera" | "send" | "more"
  | "bookmark" | "compare" | "pause" | "refresh" | "trash" | "settings";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    heart: <path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    spark: <><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></>,
    shield: <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    upload: <><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v5h16v-5"/></>,
    share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
    flag: <><path d="M5 22V3"/><path d="M5 4h12l-2 4 2 4H5"/></>,
    star: <path d="m12 2.5 3 6.1 6.7 1-4.8 4.7 1.1 6.7-6-3.2L6 21l1.1-6.7-4.8-4.7 6.7-1Z"/>,
    package: <><path d="m3 7 9-5 9 5-9 5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    camera: <><path d="M4 7h4l2-3h4l2 3h4v13H4Z"/><circle cx="12" cy="13" r="4"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    bookmark: <path d="M6 3h12v19l-6-4-6 4Z"/>,
    compare: <><path d="M8 7h13M16 3l5 4-5 4M16 17H3M8 13l-5 4 5 4"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18 12a6 6 0 0 0-10-4L4 12M6 12a6 6 0 0 0 10 4l4-4"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

type RouteName = "home" | "browse" | "listing" | "sell" | "messages" | "assistant" | "dashboard" | "auth" | "notifications" | "settings" | "admin" | "wanted" | "policy";
type DataState = "loading" | "ready" | "unconfigured" | "error";
type ListingDraft = {
  title: string;
  description: string;
  postType: "sale" | "wanted";
  live: boolean;
  categorySlug: string;
  locationSlug: string;
  price: number;
  condition: string;
  stock: number;
  negotiable: boolean;
  files: File[];
};

function routeName(route: string): RouteName {
  const path = route.split("?")[0];
  if (path.startsWith("/wanted/new")) return "sell";
  if (path.startsWith("/listing/")) return "listing";
  if (path.startsWith("/messages")) return "messages";
  if (path.startsWith("/assistant")) return "assistant";
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/sell")) return "sell";
  if (path.startsWith("/auth")) return "auth";
  if (path.startsWith("/notifications")) return "notifications";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/wanted")) return "wanted";
  if (["/safety", "/privacy", "/terms", "/prohibited-items", "/data-deletion", "/contact", "/status"].some((item) => path.startsWith(item))) return "policy";
  if (path.startsWith("/browse")) return "browse";
  return "home";
}

export default function OnyxApp({ initialRoute }: { initialRoute: string }) {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [route, setRoute] = useState(initialRoute);
  const [dataState, setDataState] = useState<DataState>(client ? "loading" : "unconfigured");
  const [listings, setListings] = useState<Listing[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [query, setQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("Whole campus");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCondition, setSelectedCondition] = useState("all");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [negotiableOnly, setNegotiableOnly] = useState(false);
  const [postType, setPostType] = useState<"all" | "sale" | "wanted">("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [offerListing, setOfferListing] = useState<Listing | null>(null);

  const refreshListings = useCallback(async () => {
    if (!client) return;
    try {
      setListings(await loadMarketplaceListings(client));
      setDataState("ready");
    } catch {
      setListings([]);
      setDataState("error");
    }
  }, [client]);

  const refreshIdentity = useCallback(async () => {
    if (!client) return;
    const { data } = await client.auth.getUser();
    if (!data.user) {
      setProfile(null);
      setSaved([]);
      setSelectedLocation((current) => current === "My block" || current === "Nearby" ? "Whole campus" : current);
      return;
    }
    const nextProfile = await loadUserProfile(client, data.user.id);
    setProfile(nextProfile);
    const { data: favorites } = await client.from("favorites").select("listing_id").eq("user_id", data.user.id);
    setSaved((favorites ?? []).map((item) => String(item.listing_id)));
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshListings();
      void refreshIdentity();
    }, 0);
    if (!client) return () => window.clearTimeout(timer);
    const { data } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshIdentity(), 0);
    });
    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [client, refreshIdentity, refreshListings]);

  useEffect(() => {
    if (!client) return;
    const channel = client
      .channel("marketplace:public")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_events" },
        () => void refreshListings(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, refreshListings]);

  useEffect(() => {
    const pop = () => setRoute(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const url = new URL(route, window.location.origin);
      const pathView = routeName(url.pathname);
      if (pathView !== "browse" && pathView !== "wanted") return;

      setQuery(url.searchParams.get("q") ?? "");
      setSelectedCategory(normalizeCategoryFilter(url.searchParams.get("category")));
      setSelectedCondition(["sealed","like_new","good","fair","for_parts","any_usable"].includes(url.searchParams.get("condition") ?? "") ? String(url.searchParams.get("condition")) : "all");
      setMinimumPrice((url.searchParams.get("min") ?? "").replace(/\D/g, ""));
      setMaximumPrice((url.searchParams.get("max") ?? "").replace(/\D/g, ""));
      setNegotiableOnly(url.searchParams.get("negotiable") === "1");

      const locationValue = url.searchParams.get("location");
      const exactLocation = campusLocations.find(([slug, name]) => slug === locationValue || name === locationValue);
      setSelectedLocation(locationValue === "mine" ? "My block" : locationValue === "nearby" ? "Nearby" : exactLocation?.[1] ?? "Whole campus");

      if (pathView === "wanted") setPostType("wanted");
      else {
        const requestedType = url.searchParams.get("type");
        setPostType(requestedType === "sale" || requestedType === "wanted" ? requestedType : "all");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [route]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (path: string) => {
    window.history.pushState({}, "", path);
    setRoute(path);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectedListing = useMemo(() => {
    const slug = route.split("?")[0].split("/listing/")[1];
    return listings.find((item) => item.slug === slug) ?? null;
  }, [route, listings]);

  const currentView = routeName(route);
  const effectivePostType = currentView === "wanted" ? "wanted" : postType;
  const filtered = useMemo(() => listings.filter((item) => {
    const normalizedQuery = query.trim().toLowerCase();
    const searchable = `${item.title} ${item.description} ${item.category} ${item.location} ${item.condition} ${item.seller} ${item.postType}`.toLowerCase();
    const textMatch = !normalizedQuery || normalizedQuery.split(/\s+/).every((term) => searchable.includes(term));
    const categoryMatch = selectedCategory === "all" || item.categorySlug === selectedCategory;
    const conditionMatch = selectedCondition === "all" || item.conditionSlug === selectedCondition;
    const typeMatch = effectivePostType === "all" || item.postType === effectivePostType;
    const minimum = Number(minimumPrice || 0);
    const maximum = Number(maximumPrice || Number.MAX_SAFE_INTEGER);
    const priceMatch = item.price >= minimum && item.price <= maximum;
    const negotiableMatch = !negotiableOnly || item.negotiable;
    const nearby = nearbyLocationSlugs(profile?.locationSlug);
    const locationMatch = selectedLocation === "Whole campus"
      || (selectedLocation === "Nearby" ? !profile?.locationSlug || nearby.includes(item.locationSlug)
        : selectedLocation === "My block" ? !profile?.locationSlug || item.locationSlug === profile.locationSlug
          : item.location === selectedLocation || item.locationSlug === selectedLocation);
    return textMatch && categoryMatch && conditionMatch && typeMatch && priceMatch && negotiableMatch && locationMatch;
  }), [effectivePostType, listings, maximumPrice, minimumPrice, negotiableOnly, profile?.locationSlug, query, selectedCategory, selectedCondition, selectedLocation]);

  const requireAccount = () => {
    if (!profile) {
      setToast("Sign in with a verified campus account to continue");
      go("/auth/sign-in");
      return false;
    }
    if (profile.accountStatus === "suspended" || profile.accountStatus === "banned") {
      setToast(profile.accountStatus === "banned" ? "This account has been disabled by moderation" : "This account is temporarily suspended from marketplace actions");
      go("/dashboard");
      return false;
    }
    return true;
  };

  const toggleSave = async (listingId: string) => {
    if (!requireAccount() || !client || !profile) return;
    const exists = saved.includes(listingId);
    const result = exists
      ? await client.from("favorites").delete().eq("user_id", profile.id).eq("listing_id", listingId)
      : await client.from("favorites").insert({ user_id: profile.id, listing_id: listingId });
    if (result.error) return setToast("Saved items could not be updated");
    setSaved((current) => exists ? current.filter((item) => item !== listingId) : [...current, listingId]);
    setToast(exists ? "Removed from saved items" : "Saved privately");
  };

  const toggleCompare = (listingId: string) => {
    setCompare((current) => current.includes(listingId)
      ? current.filter((item) => item !== listingId)
      : current.length < 4 ? [...current, listingId] : current);
    if (!compare.includes(listingId) && compare.length >= 4) setToast("You can compare up to four items");
  };

  const submitOffer = async (listing: Listing, amount: number, note: string) => {
    if (!requireAccount() || !client || !profile) return false;
    const { error } = await client.rpc("create_offer_for_listing", {
      p_listing_id: listing.id,
      p_amount_inr: amount,
      p_note: note,
    });
    if (error) {
      setToast("The offer could not be sent. Check availability and try again.");
      return false;
    }
    setToast("Private offer sent");
    return true;
  };

  const startConversation = async (listing: Listing) => {
    if (!requireAccount() || !client || !profile) return;
    const { data, error } = await client.rpc("start_conversation_for_listing", { p_listing_id: listing.id });
    if (error || !data) return setToast("A private conversation could not be opened");
    go(`/messages/${String(data)}`);
  };

  const reportListing = async (listing: Listing) => {
    if (!requireAccount() || !client || !profile) return;
    const details = window.prompt("Briefly describe the safety or accuracy concern. Do not include contact details or a room number.");
    if (details === null) return;
    const trimmed = details.trim();
    if (trimmed.length < 5 || trimmed.length > 1000) return setToast("Add 5–1,000 characters so moderators have enough context");
    const { error } = await client.rpc("report_marketplace_listing", {
      p_listing_id: listing.id,
      p_details: trimmed,
    });
    setToast(error ? "The report could not be submitted" : "Report submitted to the private moderation queue");
  };

  const publishListing = async (draft: ListingDraft) => {
    if (!client || !profile) throw new Error("Sign in before publishing.");
    if (profile.accountStatus === "suspended" || profile.accountStatus === "banned") {
      throw new Error(profile.accountStatus === "banned" ? "This account has been disabled by moderation." : "This account is temporarily suspended from marketplace actions.");
    }

    const localModeration = moderateListingText(draft.title,draft.description);
    if (localModeration.decision === "changes_required") {
      throw new Error(localModeration.issues.map((issue) => issue.message).join(" "));
    }
    const processedImages = await Promise.all(draft.files.map((file) => sanitizeListingImage(file)));
    let moderation: ListingModerationResult = localModeration;
    try {
      const session = (await client.auth.getSession()).data.session;
      const response = await fetch("/api/moderation/preflight", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          ...(session?.access_token ? {Authorization:`Bearer ${session.access_token}`} : {}),
        },
        body:JSON.stringify({
          title:draft.title,
          description:draft.description,
          postType:draft.postType,
          images:processedImages.map((image) => image.moderationPreview),
        }),
      });
      const payload = await response.json() as ListingModerationResult & {error?:string};
      if (!response.ok) throw new Error(payload.error || "The automated pre-check is unavailable.");
      moderation = payload;
    } catch (preflightError) {
      if (preflightError instanceof Error && /suspend|disabled|verified account/i.test(preflightError.message)) throw preflightError;
      moderation = {
        ...localModeration,
        summary:"The deterministic safety check passed. Image AI was unavailable, so human moderation is required.",
        decision:"manual_review",
        suggestions:[...localModeration.suggestions,"A human moderator will verify the images before publication."],
        scores:{...localModeration.scores,aiUnavailable:true},
      };
    }
    if (moderation.decision === "changes_required") {
      throw new Error(moderation.issues.filter((issue) => issue.severity === "block").map((issue) => issue.message).join(" ") || moderation.summary);
    }

    const { data, error } = await client.rpc("create_marketplace_listing", {
      p_post_type: draft.postType,
      p_mode: draft.live ? "live" : "standard",
      p_title: draft.title,
      p_description: draft.description,
      p_category_slug: draft.categorySlug,
      p_location_slug: draft.locationSlug,
      p_condition: draft.condition,
      p_price_inr: draft.postType === "sale" ? draft.price : null,
      p_budget_max_inr: draft.postType === "wanted" ? draft.price : null,
      p_negotiable: draft.negotiable,
      p_stock: draft.postType === "wanted" ? 1 : draft.stock,
    });
    if (error || !data) {
      if (error?.message?.includes("listing_copy_disallowed")) throw new Error("Remove vulgar, explicit, abusive, or off-platform contact content before submitting.");
      if (error?.message?.includes("account_suspended")) throw new Error("This account is suspended from marketplace actions.");
      throw new Error("The listing could not be submitted.");
    }

    const created = Array.isArray(data) ? data[0] : data;
    const listingId = String((created as { id: string }).id);
    const uploadedPaths: string[] = [];
    try {
      const moderationSignal = await client.rpc("record_listing_moderation_preflight", {
        p_listing_id:listingId,
        p_decision:moderation.decision,
        p_provider:moderation.provider,
        p_summary:moderation.summary,
        p_issues:moderation.issues,
        p_suggestions:moderation.suggestions,
        p_scores:moderation.scores,
      });
      if (moderationSignal.error) throw new Error("The moderation pre-check could not be attached to the listing.");
      for (let index = 0; index < processedImages.length; index += 1) {
        const sanitized = processedImages[index];
        const path = `${listingId}/${crypto.randomUUID()}.webp`;
        const upload = await client.storage.from("listing-images").upload(path, sanitized.blob, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: false,
        });
        if (upload.error) throw new Error("A listing image could not be uploaded.");
        uploadedPaths.push(path);
        const imageInsert = await client.from("listing_images").insert({
          listing_id: listingId,
          storage_path: path,
          alt_text: `${draft.title} photo ${index + 1}`,
          sort_order: index,
          width: sanitized.width,
          height: sanitized.height,
        });
        if (imageInsert.error) throw new Error("Image metadata could not be saved.");
      }
    } catch (uploadError) {
      if (uploadedPaths.length) await client.storage.from("listing-images").remove(uploadedPaths);
      await client.rpc("withdraw_own_listing", { p_listing_id: listingId });
      throw uploadError;
    }
    await refreshListings();
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Header current={currentView} go={go} query={query} setQuery={setQuery} location={selectedLocation} setLocation={setSelectedLocation} profile={profile} menuOpen={menuOpen} setMenuOpen={setMenuOpen}/>
    <main id="main-content">
      {currentView === "home" && <HomeView go={go} listings={listings} saved={saved} toggleSave={toggleSave} setOffer={setOfferListing} location={selectedLocation} setLocation={setSelectedLocation} dataState={dataState}/>}
      {(currentView === "browse" || currentView === "wanted") && <BrowseView go={go} listings={filtered} saved={saved} toggleSave={toggleSave} toggleCompare={toggleCompare} setOffer={setOfferListing} query={query} setQuery={setQuery} location={selectedLocation} setLocation={setSelectedLocation} category={selectedCategory} setCategory={setSelectedCategory} condition={selectedCondition} setCondition={setSelectedCondition} minimumPrice={minimumPrice} setMinimumPrice={setMinimumPrice} maximumPrice={maximumPrice} setMaximumPrice={setMaximumPrice} negotiableOnly={negotiableOnly} setNegotiableOnly={setNegotiableOnly} postType={effectivePostType} setPostType={setPostType} lockPostType={currentView === "wanted"} profileLocationSlug={profile?.locationSlug ?? null} dataState={dataState}/>}
      {currentView === "listing" && <ListingView listing={selectedListing} listings={listings} go={go} saved={selectedListing ? saved.includes(selectedListing.id) : false} onSave={() => selectedListing && void toggleSave(selectedListing.id)} onCompare={() => selectedListing && toggleCompare(selectedListing.id)} onOffer={() => selectedListing && setOfferListing(selectedListing)} onMessage={() => selectedListing && void startConversation(selectedListing)} toast={(message) => message.startsWith("Use the authenticated report") && selectedListing ? void reportListing(selectedListing) : setToast(message)}/>}
      {currentView === "sell" && <SellView wanted={route.startsWith("/wanted/new")} go={go} profile={profile} configured={Boolean(client)} onPublish={publishListing} toast={setToast}/>}
      {currentView === "messages" && <MessagesView client={client} profile={profile} route={route} go={go} toast={setToast}/>}
      {currentView === "assistant" && <AssistantView go={go} route={route} client={client} listings={listings}/>}
      {currentView === "dashboard" && <DashboardView client={client} profile={profile} listings={listings} saved={saved} route={route} go={go} refreshListings={refreshListings} toast={setToast}/>}
      {currentView === "auth" && <AuthView client={client} route={route} go={go} onAuthenticated={refreshIdentity}/>}
      {currentView === "notifications" && <NotificationsView client={client} profile={profile} go={go}/>}
      {currentView === "settings" && <SettingsView client={client} profile={profile} setProfile={setProfile} go={go} toast={setToast}/>}
      {currentView === "admin" && <AdminView client={client} profile={profile} go={go} toast={setToast}/>}
      {currentView === "policy" && <PolicyView path={route} go={go}/>}
    </main>
    <MobileNav current={currentView} go={go}/>
    {offerListing && <OfferDialog listing={offerListing} close={() => setOfferListing(null)} submit={async (amount, note) => {
      const sent = await submitOffer(offerListing, amount, note);
      if (sent) setOfferListing(null);
    }}/>}
    {compare.length > 0 && <div className="compare-tray"><span>{compare.length}/4 selected</span><button onClick={() => { setCompare([]); setCompareOpen(false); }}>Clear</button><button className="mini-primary" onClick={() => setCompareOpen(true)}>Review selection</button></div>}
    {compareOpen && <div className="modal-backdrop"><section className="compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button className="dialog-close" onClick={() => setCompareOpen(false)} aria-label="Close comparison"><Icon name="close"/></button><div className="eyebrow red">DEVICE-LOCAL COMPARISON</div><h2 id="compare-title">Compare active listings.</h2><div className="compare-grid">{listings.filter((listing) => compare.includes(listing.id)).map((listing) => <article key={listing.id}><ListingMedia listing={listing}/><strong>{listing.title}</strong><span>₹{listing.price.toLocaleString("en-IN")}</span><small>{listing.condition} · {listing.location}</small><button className="secondary-button" onClick={() => { setCompareOpen(false); go(`/listing/${listing.slug}`); }}>Open listing</button></article>)}</div><p>Selections stay only in this page session and are not sent to the server.</p></section></div>}
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite"><Icon name="check"/>{toast}</div>
  </div>;
}

function Header({ current, go, query, setQuery, location, setLocation, profile, menuOpen, setMenuOpen }: {
  current: RouteName; go: (path: string) => void; query: string; setQuery: (value: string) => void;
  location: string; setLocation: (value: string) => void; profile: UserProfile | null;
  menuOpen: boolean; setMenuOpen: (value: boolean) => void;
}) {
  return <header className="site-header">
    <button className="brand" onClick={() => go("/")} aria-label="ONYX home"><span className="brand-mark"><span/></span><span className="brand-word">Onyx</span></button>
    <nav className={`desktop-nav ${menuOpen ? "mobile-open" : ""}`} aria-label="Primary navigation">
      <button className={current === "browse" ? "active" : ""} onClick={() => go("/browse")}>Marketplace</button>
      <button className={current === "wanted" ? "active" : ""} onClick={() => go("/wanted")}>Wanted</button>
      <button className={current === "assistant" ? "active" : ""} onClick={() => go("/assistant")}>Assistant</button>
      <button className={current === "dashboard" ? "active" : ""} onClick={() => go("/dashboard")}>Dashboard</button>
    </nav>
    <div className="header-tools">
      <label className="header-search"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && go(`/browse?q=${encodeURIComponent(query)}`)} placeholder="Search campus" aria-label="Search campus marketplace"/></label>
      <label className="location-select"><Icon name="pin" size={16}/><select value={location} onChange={(event) => setLocation(event.target.value)} aria-label="Marketplace location"><option disabled={!profile?.locationSlug}>My block</option><option disabled={!profile?.locationSlug}>Nearby</option><option>Whole campus</option><optgroup label="Specific residence">{campusLocations.map(([,name]) => <option value={name} key={name}>{name}</option>)}</optgroup></select></label>
      <button className="icon-button header-bell" onClick={() => go("/notifications")} aria-label="Notifications"><Icon name="bell"/></button>
      <button className="secondary-button account-button" onClick={() => go(profile ? "/dashboard" : "/auth/sign-in")}><Icon name={profile ? "user" : "lock"} size={16}/>{profile ? profile.alias : "Sign in"}</button>
      <button className="primary-button sell-button" onClick={() => go("/sell")}><span>Sell an item</span><Icon name="arrow" size={16}/></button>
      <button className="icon-button menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}><Icon name={menuOpen ? "close" : "menu"}/></button>
    </div>
  </header>;
}

function HomeView({ go, listings, saved, toggleSave, setOffer, location, setLocation, dataState }: {
  go:(path:string)=>void; listings:Listing[]; saved:string[]; toggleSave:(id:string)=>void; setOffer:(listing:Listing)=>void;
  location:string; setLocation:(value:string)=>void; dataState:DataState;
}) {
  const [heroSearch, setHeroSearch] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [faq, setFaq] = useState<number | null>(0);
  const wanted = listings.filter((listing) => listing.postType === "wanted").slice(0, 4);
  return <>
    <section className="hero-section">
      <div className="hero-art" aria-hidden="true"><Image src="/art/gothic-moon-cathedral.webp" alt="" fill priority sizes="100vw"/></div>
      <div className="hero-scrim"/>
      <div className="hero-content page-wrap">
        <div className="eyebrow"><Icon name="shield" size={14}/>Verified students · Public aliases · Local handovers</div>
        <h1>Your campus already owns <em>what you need.</em></h1>
        <p className="hero-copy">Find useful belongings nearby, negotiate without exposing contact details, and arrange a handover at a broad public campus landmark.</p>
        <form className="hero-search" onSubmit={(event) => { event.preventDefault(); go(`/browse?q=${encodeURIComponent(heroSearch)}`); }}>
          <Icon name="search"/><input value={heroSearch} onChange={(event) => setHeroSearch(event.target.value)} placeholder="Search items or categories" aria-label="Search ONYX"/><button type="submit">Search campus <Icon name="arrow" size={16}/></button>
        </form>
        <div className="hero-actions"><button className="primary-button" onClick={() => go("/browse")}>Browse marketplace <Icon name="arrow" size={16}/></button><button className="glass-button" onClick={() => go("/sell")}><Icon name="upload" size={16}/>List something</button></div>
        <div className="hero-trust"><span><Icon name="check" size={14}/>No marketplace fee</span><span><Icon name="lock" size={14}/>Contact details hidden</span><span><Icon name="pin" size={14}/>Coarse residence only</span></div>
      </div>
      <div className="hero-side-card"><span className="live-pulse"/>ACTIVE MARKET<strong>{listings.length}</strong><small>public posts currently available</small></div>
    </section>

    {dataState === "unconfigured" && <div className="deployment-notice page-wrap"><Icon name="lock"/><span><strong>Marketplace activity is not enabled yet.</strong> The public interface contains no fabricated students, listings, or transactions.</span></div>}
    {dataState === "error" && <div className="deployment-notice error page-wrap"><Icon name="flag"/><span><strong>The marketplace is temporarily unavailable.</strong> No cached user activity is being shown.</span></div>}

    <section className="market-section page-wrap" id="marketplace">
      <SectionHeader eyebrow="Residence market" title="Nearby, useful, and accountable." copy="For-sale stock and wanted requests share one privacy-first feed." action={<button className="text-button" onClick={() => go("/browse")}>View all posts <Icon name="arrow" size={16}/></button>}/>
      <div className="location-strip" role="list" aria-label="Residence filters">{campusLocations.slice(0, 9).map(([slug, name]) => <button key={name} className={location === name ? "selected" : ""} onClick={() => go(`/browse?location=${encodeURIComponent(slug)}`)}><span>{name}</span><b>{listings.filter((listing) => listing.locationSlug === slug).length}</b></button>)}</div>
      {listings.length ? <div className="listing-grid home-grid">{listings.slice(0, 6).map((listing) => <ListingCard key={listing.id} listing={listing} go={go} saved={saved.includes(listing.id)} onSave={() => void toggleSave(listing.id)} onOffer={() => setOffer(listing)}/>)}</div> : <ArtEmptyState title="No public listings yet" copy="The first verified student can submit an item for moderation or post a wanted request. Nothing here is synthetic." action={<button className="primary-button" onClick={() => go("/sell")}>Create the first listing</button>}/>}
    </section>

    <section className="aisle-section page-wrap">
      <SectionHeader eyebrow="Browse by category" title="Everything a room needs, sorted." copy="Category totals come only from active marketplace records."/>
      <div className="aisle-grid">{marketplaceCategories.map(([slug, name, description, icon], index) => <button key={name} onClick={() => go(`/browse?category=${encodeURIComponent(slug)}`)}><span className={`aisle-icon aisle-${index}`}><Icon name={icon as IconName}/></span><span><strong>{name}</strong><small>{description}</small></span><b>{listings.filter((listing) => listing.categorySlug === slug).length}</b><Icon name="chevron" size={16}/></button>)}</div>
    </section>

    <section className="wanted-section">
      <div className="wanted-art" aria-hidden="true"><Image src="/art/red-sun-temple.webp" alt="" fill sizes="100vw"/></div>
      <div className="page-wrap wanted-layout">
        <div><div className="eyebrow red">WANTED BOARD</div><h2>Ask nearby before buying new.</h2><p>Set a budget and condition tolerance. Replies stay private and contact details remain hidden.</p><button className="bone-button" onClick={() => go("/wanted/new")}><Icon name="plus" size={16}/>Post a wanted request</button></div>
        <div className="wanted-stack">{wanted.length ? wanted.map((listing) => <button key={listing.id} onClick={() => go(`/listing/${listing.slug}`)}><span className="wanted-stamp">WANTED</span><span><strong>{listing.title}</strong><small>Up to ₹{listing.price.toLocaleString("en-IN")} · {listing.location}</small></span><span className="wanted-time"><Icon name="clock" size={14}/>{expiryLabel(listing.expiresAt)}</span><Icon name="arrow"/></button>) : <div className="wanted-empty"><Icon name="search" size={27}/><strong>No active wanted requests</strong><span>New requests will appear here after moderation.</span></div>}</div>
      </div>
    </section>

    <section className="assistant-section page-wrap">
      <div className="assistant-copy"><div className="eyebrow"><Icon name="spark" size={14}/>ONYX assistant</div><h2>Ask the market, not an imaginary catalogue.</h2><p>The assistant receives only an authorized projection of currently active inventory. With no matches, it says so.</p><ul><li><Icon name="check"/>Grounded in active inventory</li><li><Icon name="check"/>No contact details in prompts</li><li><Icon name="check"/>No write action without confirmation</li></ul><button className="secondary-button" onClick={() => go("/assistant")}>Open assistant <Icon name="arrow" size={16}/></button></div>
      <div className="assistant-panel"><div className="assistant-top"><span className="brand-mark small"><span/></span><strong>ONYX Assistant</strong><span className="mode-label">PRIVACY-BOUND</span></div><div className="assistant-answer neutral"><span className="ai-avatar"><Icon name="spark"/></span><div><p>{listings.length ? `${listings.length} active public post${listings.length === 1 ? " is" : "s are"} available for grounded search.` : "There is no active public inventory to recommend yet."}</p><small>The assistant never substitutes fabricated catalogue entries.</small></div></div><form className="assistant-input" onSubmit={(event) => { event.preventDefault(); go(`/assistant?q=${encodeURIComponent(assistantPrompt)}`); }}><input value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="What do you need?" aria-label="Ask ONYX Assistant"/><button aria-label="Open assistant"><Icon name="send" size={17}/></button></form></div>
    </section>

    <section className="steps-section"><div className="page-wrap"><SectionHeader eyebrow="How it works" title="A private deal, with honest limits." copy="Pseudonymous to other students—not technically or legally untraceable."/><div className="steps-grid">{[["01","Create an alias","Verify privately and expose only a public alias and coarse residence."],["02","Submit a listing","Images are re-encoded without embedded metadata before controlled storage."],["03","Negotiate privately","Offers and messages are authorized per participant by database policies."],["04","Meet in public","Use a broad campus landmark and never publish a room number or live location."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><Icon name={number === "01" ? "user" : number === "02" ? "package" : number === "03" ? "message" : "pin"}/><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

    <section className="trust-section"><div className="trust-art" aria-hidden="true"><Image src="/art/cathedral-courtyard.webp" alt="" fill sizes="100vw"/></div><div className="page-wrap trust-content"><div className="eyebrow red">TRUST WITHOUT OVERSHARING</div><h2>Your alias is public.<br/>Your account is accountable.</h2><p>Marketplace users do not receive your email, room number, precise location, reset tokens, internal account controls, or deployment credentials.</p><div className="trust-points"><span><Icon name="shield"/>Verified privately</span><span><Icon name="lock"/>Contact details hidden</span><span><Icon name="flag"/>Reports create a safety hold</span></div><button className="bone-button" onClick={() => go("/safety")}>Read the safety model <Icon name="arrow" size={16}/></button></div></section>

    <section className="faq-section page-wrap"><SectionHeader eyebrow="Questions" title="Quietly answered."/><div className="faq-list">{[["Is ONYX anonymous?","No. ONYX is pseudonymous to other marketplace users. The service privately verifies accounts and follows applicable legal and safety obligations."],["Who can sign up?","Anyone with a valid email address can register. Email confirmation is required before the account is treated as verified."],["Are listings pre-filled?","No. The final source contains taxonomy only. Every listing, offer, message, notification, and moderation item must come from the connected database."],["What happens to uploaded photos?","The browser decodes and re-encodes accepted images as WebP, removing embedded EXIF and location metadata before upload."],["Does ONYX hold money?","No. ONYX does not hold funds, arrange delivery, or take a marketplace percentage in this version."]].map(([question,answer], index) => <div key={question} className="faq-item"><button onClick={() => setFaq(faq === index ? null : index)} aria-expanded={faq === index}><span>{question}</span><span className={faq === index ? "faq-plus open" : "faq-plus"}><Icon name="plus"/></span></button>{faq === index && <p>{answer}</p>}</div>)}</div></section>
    <FinalCTA go={go}/><Footer go={go}/>
  </>;
}

function SectionHeader({ eyebrow, title, copy, action }: { eyebrow:string; title:string; copy?:string; action?:ReactNode }) {
  return <div className="section-header"><div><div className="eyebrow red">{eyebrow}</div><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>;
}

function ListingMedia({ listing, index = 0, className = "" }: { listing:Listing; index?:number; className?:string }) {
  const url = listing.imageUrls[index] ?? listing.imageUrls[0] ?? "";
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => setFailedUrl(""), [url]);
  const available = Boolean(url) && failedUrl !== url;
  return <span className={`listing-media ${className} ${available ? "" : "image-unavailable"}`}>
    {available
      ? <img src={url} alt={`${listing.title} photo ${index + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)}/>
      : <><Image src="/art/onyx-wave.webp" alt="" fill sizes="(max-width: 768px) 50vw, 25vw"/><span className="media-placeholder"><Icon name="camera"/><small>Image unavailable</small></span></>}
  </span>;
}

function ListingCard({ listing, go, saved, onSave, onOffer, onCompare }: { listing:Listing; go:(path:string)=>void; saved:boolean; onSave:()=>void; onOffer:()=>void; onCompare?:()=>void }) {
  return <article className="listing-card"><button className="listing-image" onClick={() => go(`/listing/${listing.slug}`)} aria-label={`View ${listing.title}`}><ListingMedia listing={listing}/>{listing.live && <span className="live-tag"><i/>LIVE · {expiryLabel(listing.expiresAt)}</span>}<span className={`post-tag ${listing.postType}`}>{listing.postType === "wanted" ? "WANTED" : "FOR SALE"}</span></button><button className={`save-button ${saved ? "saved" : ""}`} onClick={onSave} aria-label={saved ? "Remove from saved" : "Save listing"}><Icon name="heart" size={17}/></button><div className="listing-body"><div className="listing-meta"><span>{listing.condition}</span><span>{listing.location}</span></div><button className="listing-title" onClick={() => go(`/listing/${listing.slug}`)}>{listing.title}</button><div className="seller-line"><span className="tiny-avatar">{listing.seller.slice(0,1).toUpperCase()}</span><span>{listing.seller}</span>{listing.ownerVerified && <Icon name="shield" size={13}/>}<span className="rating"><Icon name="star" size={12}/>{listing.reviews ? `${listing.rating.toFixed(1)} (${listing.reviews})` : "New seller"}</span></div><div className="listing-bottom"><div><strong>{listing.postType === "wanted" ? "Up to " : ""}₹{listing.price.toLocaleString("en-IN")}</strong><small>{listing.postType === "sale" ? `${Math.max(0, listing.stock - listing.reservedStock)} available` : "maximum budget"}</small></div><div className="card-actions">{onCompare && <button onClick={onCompare} aria-label="Compare"><Icon name="compare" size={16}/></button>}<button className="offer-button" onClick={onOffer}>{listing.postType === "wanted" ? "I have one" : "Offer"}</button></div></div></div></article>;
}

function BrowseView({ go, listings, saved, toggleSave, toggleCompare, setOffer, query, setQuery, location, setLocation, category, setCategory, condition, setCondition, minimumPrice, setMinimumPrice, maximumPrice, setMaximumPrice, negotiableOnly, setNegotiableOnly, postType, setPostType, lockPostType, profileLocationSlug, dataState }: {
  go:(path:string)=>void; listings:Listing[]; saved:string[]; toggleSave:(id:string)=>void; toggleCompare:(id:string)=>void; setOffer:(listing:Listing)=>void;
  query:string; setQuery:(value:string)=>void; location:string; setLocation:(value:string)=>void; category:string; setCategory:(value:string)=>void;
  condition:string; setCondition:(value:string)=>void; minimumPrice:string; setMinimumPrice:(value:string)=>void; maximumPrice:string; setMaximumPrice:(value:string)=>void;
  negotiableOnly:boolean; setNegotiableOnly:(value:boolean)=>void; postType:"all"|"sale"|"wanted"; setPostType:(value:"all"|"sale"|"wanted")=>void;
  lockPostType:boolean; profileLocationSlug:string|null; dataState:DataState;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("Newest");
  const sorted = [...listings].sort((a,b) => sort === "Price: low" ? a.price - b.price : sort === "Price: high" ? b.price - a.price : sort === "Oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activeFilterCount = (category !== "all" ? 1 : 0) + (!lockPostType && postType !== "all" ? 1 : 0) + (condition !== "all" ? 1 : 0) + (minimumPrice ? 1 : 0) + (maximumPrice ? 1 : 0) + (negotiableOnly ? 1 : 0) + (location !== "Whole campus" ? 1 : 0);
  const resetFilters = () => {
    setCategory("all");
    if (!lockPostType) setPostType("all");
    setCondition("all");
    setMinimumPrice("");
    setMaximumPrice("");
    setNegotiableOnly(false);
    setLocation("Whole campus");
    setQuery("");
  };
  return <div className="browse-page page-wrap"><div className="browse-heading"><div><div className="eyebrow red">RESIDENCE MARKET</div><h1>{postType === "wanted" ? "Wanted near you." : "Find it before buying new."}</h1><p>{dataState === "loading" ? "Loading verified marketplace records…" : `${listings.length} active ${listings.length === 1 ? "post" : "posts"}. No sample inventory.`}</p></div><button className="primary-button" onClick={() => go(postType === "wanted" ? "/wanted/new" : "/sell")}><Icon name="plus" size={16}/>{postType === "wanted" ? "Post wanted" : "Sell an item"}</button></div><div className="browse-search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, description, seller, category, or residence"/><button onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><Icon name="filter"/>Filters <b>{activeFilterCount}</b></button></div><div className="scope-tabs">{["My block","Nearby","Whole campus"].map((item) => <button className={location === item ? "active" : ""} key={item} disabled={(item === "My block" || item === "Nearby") && !profileLocationSlug} title={!profileLocationSlug && item !== "Whole campus" ? "Sign in and select a residence to use this scope" : undefined} onClick={() => setLocation(item)}><Icon name="pin" size={14}/>{item}</button>)}</div>{!profileLocationSlug && (location === "My block" || location === "Nearby") && <p className="filter-scope-note">Sign in and choose your residence to use this location scope. Whole-campus results are shown instead.</p>}<div className="browse-layout"><aside className={filtersOpen ? "filters open" : "filters"}><div className="filter-title"><strong>Refine results</strong><button onClick={resetFilters}>Reset all</button></div>{!lockPostType && <fieldset><legend>Post type</legend>{[["all","Everything"],["sale","For sale"],["wanted","Wanted"]].map(([value,label]) => <label key={value}><input type="radio" name="post" checked={postType === value} onChange={() => setPostType(value as "all"|"sale"|"wanted")}/><span>{label}</span></label>)}</fieldset>}<fieldset><legend>Category</legend><label><input type="radio" name="category" checked={category === "all"} onChange={() => setCategory("all")}/><span>All categories</span></label>{marketplaceCategories.map(([slug,name]) => <label key={slug}><input type="radio" name="category" checked={category === slug} onChange={() => setCategory(slug)}/><span>{name}</span></label>)}</fieldset><fieldset><legend>Condition</legend>{[["all","Any condition"],["sealed","Sealed"],["like_new","Like new"],["good","Good"],["fair","Fair"],["for_parts","For parts"],["any_usable","Any usable"]].map(([value,label]) => <label key={value}><input type="radio" name="condition" checked={condition === value} onChange={() => setCondition(value)}/><span>{label}</span></label>)}</fieldset><fieldset><legend>Price or budget</legend><div className="filter-price-grid"><label><span>Minimum ₹</span><input inputMode="numeric" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value.replace(/\D/g,""))} placeholder="0"/></label><label><span>Maximum ₹</span><input inputMode="numeric" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value.replace(/\D/g,""))} placeholder="Any"/></label></div></fieldset><fieldset><legend>Offer options</legend><label><input type="checkbox" checked={negotiableOnly} onChange={(event) => setNegotiableOnly(event.target.checked)}/><span>Negotiable only</span></label></fieldset><button className="filter-done" onClick={() => setFiltersOpen(false)}>Show {listings.length} results</button></aside><div className="results-column"><div className="results-tools"><span>{listings.length} results</span><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest</option><option>Oldest</option><option>Price: low</option><option>Price: high</option></select></label></div>{sorted.length ? <div className="listing-grid">{sorted.map((listing) => <ListingCard key={listing.id} listing={listing} go={go} saved={saved.includes(listing.id)} onSave={() => void toggleSave(listing.id)} onOffer={() => setOffer(listing)} onCompare={() => toggleCompare(listing.id)}/>)}</div> : <ArtEmptyState title={dataState === "loading" ? "Loading the market" : "Nothing matches yet"} copy={dataState === "loading" ? "Only verified database records will appear." : "Broaden the location, clear a condition or price filter, or post a wanted request."} action={dataState === "loading" ? null : <button className="primary-button" onClick={resetFilters}>Clear filters</button>}/>}</div></div></div>;
}

function ListingView({ listing, listings, go, saved, onSave, onCompare, onOffer, onMessage, toast }: { listing:Listing|null; listings:Listing[]; go:(path:string)=>void; saved:boolean; onSave:()=>void; onCompare:()=>void; onOffer:()=>void; onMessage:()=>void; toast:(message:string)=>void }) {
  const [gallery, setGallery] = useState(0);
  if (!listing) return <div className="simple-page page-wrap"><ArtEmptyState title="Listing unavailable" copy="It may have expired, been paused, entered moderation, or never existed." action={<button className="primary-button" onClick={() => go("/browse")}>Return to marketplace</button>}/></div>;
  const galleryCount = Math.max(1, listing.imageUrls.length);
  return <div className="listing-page page-wrap"><button className="back-link" onClick={() => go("/browse")}><Icon name="arrow"/>Back to marketplace</button><div className="detail-grid"><div className="detail-gallery"><div className="detail-image"><ListingMedia listing={listing} index={gallery}/>{listing.live && <span className="live-tag"><i/>LIVE · {expiryLabel(listing.expiresAt)}</span>}<span className="image-counter">{gallery + 1} / {galleryCount}</span></div>{listing.imageUrls.length > 1 && <div className="thumbnail-row">{listing.imageUrls.map((url,index) => <button className={gallery === index ? "active" : ""} key={url} onClick={() => setGallery(index)}><ListingMedia listing={listing} index={index}/></button>)}</div>}</div><div className="detail-info"><div className="detail-tags"><span className={`post-tag ${listing.postType}`}>{listing.postType === "sale" ? "FOR SALE" : "WANTED"}</span><span>{listing.condition}</span><span><Icon name="pin" size={13}/>{listing.location}</span></div><h1>{listing.title}</h1><p className="detail-price">{listing.postType === "wanted" ? "Budget up to " : ""}₹{listing.price.toLocaleString("en-IN")}</p><div className="stock-line"><span className="stock-dot"/><strong>{listing.postType === "sale" ? `${Math.max(0, listing.stock - listing.reservedStock)} available` : "Active request"}</strong>{listing.negotiable && <span>Negotiable</span>}<span>{formatRelativeTime(listing.createdAt)}</span></div><div className="detail-actions"><button className="primary-button" onClick={onOffer}>{listing.postType === "wanted" ? "I have one" : "Make an offer"}</button><button className="secondary-button" onClick={onMessage}><Icon name="message"/>Message privately</button></div><div className="detail-small-actions"><button onClick={onSave}><Icon name={saved ? "heart" : "bookmark"}/>{saved ? "Saved" : "Save"}</button><button onClick={onCompare}><Icon name="compare"/>Compare</button><button onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => toast("Link copied without personal details")).catch(() => toast("Copy the page address from your browser"))}><Icon name="share"/>Share</button><button onClick={() => toast("Use the authenticated report control after signing in")}><Icon name="flag"/>Report</button></div><div className="seller-card"><span className="large-avatar">{listing.seller.slice(0,1).toUpperCase()}</span><div><small>Listed by</small><strong>{listing.seller}{listing.ownerVerified && <Icon name="shield" size={14}/>}</strong><span><Icon name="star" size={13}/>{listing.reviews ? `${listing.rating.toFixed(1)} from ${listing.reviews} handovers` : "No completed handover ratings yet"}</span></div></div><div className="safety-note"><Icon name="shield"/><div><strong>Meet at a broad public campus landmark.</strong><p>Do not share OTPs, room numbers, passwords, or advance payment. ONYX never handles money.</p></div></div></div></div><div className="description-grid"><section><h2>About this {listing.postType === "sale" ? "item" : "request"}</h2><p>{listing.description || "The owner did not add a description."}</p><dl><div><dt>Category</dt><dd>{listing.category}</dd></div><div><dt>Condition</dt><dd>{listing.condition}</dd></div><div><dt>Handover zone</dt><dd>{listing.location} common area</dd></div><div><dt>Availability</dt><dd>{listing.live ? "Time-limited live post" : "Standard post"}</dd></div></dl></section><section><h2>Similar nearby</h2>{listings.filter((item) => item.id !== listing.id && item.category === listing.category).slice(0,3).map((item) => <button className="similar-row" key={item.id} onClick={() => go(`/listing/${item.slug}`)}><ListingMedia listing={item}/><span><strong>{item.title}</strong><small>{item.location} · {item.condition}</small></span><b>₹{item.price.toLocaleString("en-IN")}</b></button>)}{!listings.some((item) => item.id !== listing.id && item.category === listing.category) && <p className="muted-copy">No other active posts in this category.</p>}</section></div></div>;
}

function SellView({ wanted, go, profile, configured, onPublish, toast }: { wanted:boolean; go:(path:string)=>void; profile:UserProfile|null; configured:boolean; onPublish:(draft:ListingDraft)=>Promise<void>; toast:(message:string)=>void }) {
  const [step, setStep] = useState(1);
  const [title,setTitle] = useState("");
  const [categorySlug,setCategorySlug] = useState<string>(marketplaceCategories[0][0]);
  const [condition,setCondition] = useState(wanted ? "any_usable" : "good");
  const [price,setPrice] = useState("");
  const [stock,setStock] = useState("1");
  const [locationSlug,setLocationSlug] = useState<string>(campusLocations[0][0]);
  const [description,setDescription] = useState("");
  const [live,setLive] = useState(true);
  const [negotiable,setNegotiable] = useState(true);
  const [photos,setPhotos] = useState<{file:File;url:string}[]>([]);
  const [error,setError] = useState("");
  const [publishing,setPublishing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((photo) => URL.revokeObjectURL(photo.url)), [photos]);
  const addPhotos = (event:ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 8 - photos.length);
    const accepted = files.filter((file) => ["image/jpeg","image/png","image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024);
    setPhotos((current) => [...current, ...accepted.map((file) => ({ file, url:URL.createObjectURL(file) }))]);
    if (accepted.length !== files.length) setError("Only JPG, PNG, or WebP images up to 8 MB are accepted.");
  };
  const next = () => {
    setError("");
    if (step === 1 && (title.trim().length < 3 || description.trim().length < 10)) return setError("Add a clear title and at least 10 characters of honest description.");
    if (step === 2 && !wanted && photos.length === 0) return setError("Add at least one current photo of the item.");
    if (step === 3 && (!price || Number(price) < 1 || (!wanted && Number(stock) < 1))) return setError("Enter a valid price or budget and stock quantity.");
    setStep((current) => Math.min(4, current + 1));
  };
  const publish = async () => {
    if (!profile) return go("/auth/sign-in");
    setPublishing(true);
    setError("");
    try {
      await onPublish({ title:title.trim(), description:description.trim(), postType:wanted ? "wanted" : "sale", live, categorySlug, locationSlug, price:Number(price), condition, stock:Number(stock), negotiable, files:photos.map((photo) => photo.file) });
      toast(`${wanted ? "Wanted request" : "Listing"} submitted for moderation`);
      go("/dashboard");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Submission failed.");
    } finally {
      setPublishing(false);
    }
  };
  if (!configured) return <div className="simple-page page-wrap"><ArtEmptyState title="Marketplace accounts are not enabled" copy="This deployment contains no local fallback accounts or fabricated publishing flow." action={<button className="secondary-button" onClick={() => go("/")}>Return home</button>}/></div>;
  if (!profile) return <div className="simple-page page-wrap"><ArtEmptyState title="Verify before publishing" copy="A verified account is required so moderation and ownership remain accountable while your public alias stays separate." action={<button className="primary-button" onClick={() => go("/auth/sign-in")}>Sign in</button>}/></div>;
  if (profile.accountStatus === "suspended" || profile.accountStatus === "banned") return <div className="simple-page page-wrap"><ArtEmptyState title={profile.accountStatus === "banned" ? "Account disabled" : "Marketplace access suspended"} copy={profile.moderationReason || "A moderator has temporarily disabled marketplace actions for this account."} action={<button className="secondary-button" onClick={() => go("/dashboard")}>View account status</button>}/></div>;
  const locationName = campusLocations.find(([slug]) => slug === locationSlug)?.[1] ?? "Campus";
  return <div className="sell-page"><div className="sell-editor"><div className="sell-top"><button className="brand" onClick={() => go("/")}><span className="brand-mark"><span/></span><span className="brand-word">Onyx</span></button><button className="close-sell" onClick={() => go("/dashboard")}><Icon name="close"/>Close</button></div><div className="sell-progress">{[1,2,3,4].map((number) => <div key={number} className={step >= number ? "active" : ""}><span>{step > number ? <Icon name="check" size={14}/> : number}</span><small>{["Basics","Photos","Price & stock","Preview"][number - 1]}</small></div>)}</div><div className="sell-form">{step === 1 && <><div className="eyebrow red">STEP 1 OF 4</div><h1>{wanted ? "What are you looking for?" : "What are you handing on?"}</h1><p>Your alias and coarse residence are public. Never include contact details or a room number.</p><label>{wanted ? "Wanted item" : "Listing title"}<input autoFocus maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Use a specific item name"/><small>{title.length}/70</small></label><div className="form-grid"><label>Category<select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>{marketplaceCategories.map(([slug,name]) => <option value={slug} key={slug}>{name}</option>)}</select></label><label>{wanted ? "Condition tolerance" : "Condition"}<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="sealed">Sealed</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option>{wanted ? <option value="any_usable">Any usable</option> : <option value="for_parts">For parts</option>}</select></label></div><label>Description<textarea value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} placeholder={wanted ? "State must-haves, acceptable wear, and timing." : "Disclose age, faults, included accessories, and reason for selling."} rows={5}/></label></>}{step === 2 && <><div className="eyebrow red">STEP 2 OF 4</div><h1>{wanted ? "A reference is optional." : "Show the real condition."}</h1><p>Accepted files are decoded, resized, and re-encoded as WebP before upload, removing embedded location metadata.</p><input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos}/><button className="upload-zone" type="button" onClick={() => inputRef.current?.click()}><span><Icon name="camera" size={28}/></span><strong>{wanted ? "Add an optional reference" : "Add current photos"}</strong><small>Up to 8 · 8 MB each · JPG, PNG, WebP</small></button><div className="photo-grid">{photos.map((photo,index) => <div key={photo.url}><img src={photo.url} alt={`Local preview ${index + 1}`}/><button type="button" onClick={() => { URL.revokeObjectURL(photo.url); setPhotos((current) => current.filter((_,itemIndex) => itemIndex !== index)); }} aria-label="Remove photo"><Icon name="close" size={15}/></button>{index === 0 && <span>COVER</span>}</div>)}</div></>}{step === 3 && <><div className="eyebrow red">STEP 3 OF 4</div><h1>{wanted ? "Set a realistic budget." : "Price it for a local handover."}</h1><div className="form-grid"><label>{wanted ? "Maximum budget in INR" : "Price in INR"}<div className="price-input"><span>₹</span><input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g,""))} placeholder="0"/></div></label>{!wanted && <label>Quantity<input type="number" min="1" max="99" value={stock} onChange={(event) => setStock(event.target.value)}/></label>}</div><label>Residence<select value={locationSlug} onChange={(event) => setLocationSlug(event.target.value)}>{campusLocations.map(([slug,name]) => <option value={slug} key={slug}>{name}</option>)}</select></label><div className="mode-cards"><button type="button" className={live ? "active" : ""} onClick={() => setLive(true)}><span><Icon name="clock"/></span><strong>Live post</strong><small>Time-limited residence-first visibility</small></button><button type="button" className={!live ? "active" : ""} onClick={() => setLive(false)}><span><Icon name="package"/></span><strong>Standard post</strong><small>Stays pending until matched, paused, or expired</small></button></div><label className="checkbox-line"><input type="checkbox" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)}/><span>{wanted ? "Open to nearby matches" : "Open to reasonable offers"}</span></label></>}{step === 4 && <><div className="eyebrow red">FINAL CHECK</div><h1>Ready for moderation.</h1><p>Submissions are not shown publicly until their database status becomes active.</p><div className="publish-preview"><div className="publish-image">{photos[0] ? <img src={photos[0].url} alt="Listing cover preview"/> : <Image src="/art/onyx-wave.webp" alt="" fill sizes="220px"/>}<span className={`post-tag ${wanted ? "wanted" : "sale"}`}>{wanted ? "WANTED" : "FOR SALE"}</span></div><div><span>{condition.replaceAll("_"," ")} · {locationName}</span><h2>{title}</h2><p>{description}</p><strong>{wanted ? "Up to " : ""}₹{Number(price).toLocaleString("en-IN")}</strong><small>{wanted ? "Maximum budget" : `${stock} in stock`} · {live ? "Live after approval" : "Standard after approval"}</small></div></div><div className="publish-checks"><span><Icon name="check"/>EXIF removed before upload</span><span><Icon name="spark"/>Vulgarity and explicit-image check</span><span><Icon name="clock"/>Human moderation required</span></div><div className="ai-precheck-note"><Icon name="shield"/><div><strong>Narrow automated safety screening</strong><p>AI checks only for high-confidence pornographic imagery and clearly readable vulgar or abusive text. It does not judge whether a photo matches the title or whether the photo is attractive, centered, bright, or professionally composed. Human moderators review every listing.</p></div></div></>}{error && <p className="form-error" role="alert">{error}</p>}<div className="sell-nav"><button className="secondary-button" disabled={step === 1 || publishing} onClick={() => setStep((current) => Math.max(1,current - 1))}>Back</button>{step < 4 ? <button className="primary-button" onClick={next}>Continue <Icon name="arrow" size={16}/></button> : <button className="primary-button" onClick={() => void publish()} disabled={publishing}>{publishing ? "Submitting safely…" : `Submit ${wanted ? "request" : "listing"}`} <Icon name="arrow" size={16}/></button>}</div></div></div><aside className="sell-art"><Image src="/art/alias-manifesto.webp" alt="Black and white statue artwork with painted graphic marks" fill sizes="42vw"/><div className="sell-art-inner"><div className="eyebrow"><Icon name="shield" size={14}/>SELLER PROMISE</div><blockquote>Show the flaws.<br/>Price it fairly.<br/><em>Hand it on.</em></blockquote></div></aside></div>;
}


type MarketplaceConversationRow = {
  conversation_id:string;
  listing_id:string;
  listing_slug:string;
  listing_title:string;
  other_alias:string;
  status:string;
  updated_at:string;
};
type ModerationThreadRow = {
  thread_id:string;
  listing_id:string;
  listing_slug:string;
  listing_title:string;
  other_alias:string;
  status:string;
  updated_at:string;
};
type ThreadSummary = {
  key:string;
  kind:"marketplace"|"moderation";
  threadId:string;
  listingId:string;
  listingSlug:string;
  listingTitle:string;
  otherAlias:string;
  status:string;
  updatedAt:string;
};
type MessageRow = { id:string; sender_id:string; body:string; created_at:string; kind:string };

function MessagesView({ client, profile, route, go, toast: notify }: { client:SupabaseClient|null; profile:UserProfile|null; route:string; go:(path:string)=>void; toast:(message:string)=>void }) {
  const [threads,setThreads] = useState<ThreadSummary[]>([]);
  const [activeKey,setActiveKey] = useState("");
  const [messages,setMessages] = useState<MessageRow[]>([]);
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const cleanPath = route.split("?")[0];
  const moderationRouteId = cleanPath.match(/^\/messages\/moderation\/([^/]+)$/)?.[1] ?? "";
  const conversationRouteId = cleanPath.match(/^\/messages\/([^/]+)$/)?.[1] ?? "";
  const routeKey = moderationRouteId
    ? `moderation:${moderationRouteId}`
    : conversationRouteId
      ? `marketplace:${conversationRouteId}`
      : "";

  const toast = (text:string) => {
    if (text !== "Use the report flow before closing a safety-sensitive thread") return notify(text);
    const selected = threads.find((thread) => thread.key === activeKey);
    if (!client || !profile || !selected || selected.kind !== "marketplace") return notify("Open a marketplace conversation before reporting it");
    const details = window.prompt("Briefly describe the safety concern. Do not include passwords, OTPs, contact details, or a room number.");
    if (details === null) return;
    const trimmed = details.trim();
    if (trimmed.length < 5 || trimmed.length > 1000) return notify("Add 5–1,000 characters so moderators have enough context");
    void client.rpc("report_private_conversation", {
      p_conversation_id: selected.threadId,
      p_details: trimmed,
    }).then(({error}) => notify(error ? "The report could not be submitted" : "Conversation report submitted privately"));
  };

  const loadThreads = useCallback(async () => {
    if (!client || !profile) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{data:conversationData},{data:moderationData}] = await Promise.all([
      client.rpc("get_my_conversation_summaries"),
      client.rpc("get_my_moderation_thread_summaries"),
    ]);
    const marketplace = ((conversationData ?? []) as MarketplaceConversationRow[]).map((row):ThreadSummary => ({
      key:`marketplace:${row.conversation_id}`,
      kind:"marketplace",
      threadId:row.conversation_id,
      listingId:row.listing_id,
      listingSlug:row.listing_slug,
      listingTitle:row.listing_title,
      otherAlias:row.other_alias,
      status:row.status,
      updatedAt:row.updated_at,
    }));
    const moderation = ((moderationData ?? []) as ModerationThreadRow[]).map((row):ThreadSummary => ({
      key:`moderation:${row.thread_id}`,
      kind:"moderation",
      threadId:row.thread_id,
      listingId:row.listing_id,
      listingSlug:row.listing_slug,
      listingTitle:row.listing_title,
      otherAlias:row.other_alias,
      status:row.status,
      updatedAt:row.updated_at,
    }));
    const next = [...marketplace,...moderation].sort(
      (left,right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
    setThreads(next);
    setActiveKey((current) => routeKey || (next.some((thread) => thread.key === current) ? current : next[0]?.key ?? ""));
    setLoading(false);
  }, [client,profile,routeKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadThreads(),0);
    return () => window.clearTimeout(timer);
  }, [loadThreads]);

  const selected = threads.find((thread) => thread.key === activeKey) ?? null;
  const accountMarketplaceLocked = profile?.accountStatus === "suspended" || profile?.accountStatus === "banned";
  const selectedClosed = selected
    ? selected.status === "closed" || (selected.kind === "marketplace" && (["completed","cancelled","expired"].includes(selected.status) || accountMarketplaceLocked))
    : false;

  useEffect(() => {
    if (!client || !selected) {
      const timer = window.setTimeout(() => setMessages([]),0);
      return () => window.clearTimeout(timer);
    }
    const table = selected.kind === "moderation" ? "moderation_messages" : "messages";
    const filterColumn = selected.kind === "moderation" ? "thread_id" : "conversation_id";
    void client
      .from(table)
      .select("id,sender_id,body,created_at")
      .eq(filterColumn,selected.threadId)
      .order("created_at",{ascending:true})
      .then(({data}) => setMessages(((data ?? []) as Omit<MessageRow,"kind">[]).map((row) => ({...row,kind:"text"}))));
    const channel = client
      .channel(`${selected.kind}:${selected.threadId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table,filter:`${filterColumn}=eq.${selected.threadId}`},(payload) => {
        const row = payload.new as Omit<MessageRow,"kind">;
        setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current,{...row,kind:"text"}]);
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client,selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior:"smooth",block:"end"});
  }, [messages.length,activeKey]);

  const openThread = (thread:ThreadSummary) => {
    setActiveKey(thread.key);
    go(thread.kind === "moderation" ? `/messages/moderation/${thread.threadId}` : `/messages/${thread.threadId}`);
  };

  const send = async () => {
    if (!client || !profile || !selected || !message.trim() || sending || selectedClosed) return;
    const text = message.trim();
    setMessage("");
    setSending(true);
    const result = selected.kind === "moderation"
      ? await client.rpc("send_listing_moderation_message",{p_listing_id:selected.listingId,p_body:text})
      : await client.rpc("send_conversation_message",{
          p_conversation_id:selected.threadId,
          p_body:text,
          p_idempotency_key:crypto.randomUUID(),
        });
    setSending(false);
    if (result.error) {
      setMessage(text);
      toast("Message could not be sent");
      return;
    }
    void loadThreads();
  };

  if (!client) return <div className="simple-page page-wrap"><ArtEmptyState title="Private messaging is not enabled" copy="No local or simulated conversation history is included." action={<button className="secondary-button" onClick={() => go("/")}>Return home</button>}/></div>;
  if (!profile) return <div className="simple-page page-wrap"><ArtEmptyState title="Sign in to see private messages" copy="Conversation membership is enforced by database row-level security." action={<button className="primary-button" onClick={() => go("/auth/sign-in")}>Sign in</button>}/></div>;

  return <div className="messages-page">
    <aside className="inbox-panel">
      <div className="inbox-head"><h1>Messages</h1><button onClick={() => void loadThreads()} aria-label="Refresh messages"><Icon name="refresh"/></button></div>
      {threads.map((thread) => <button className={`conversation-row ${activeKey === thread.key ? "active" : ""}`} key={thread.key} onClick={() => openThread(thread)}>
        <span className={`conversation-art ${thread.kind === "moderation" ? "moderation" : ""}`}><Icon name={thread.kind === "moderation" ? "shield" : "package"}/></span>
        <span><strong>{thread.listingTitle}</strong><small>{thread.otherAlias} · {thread.kind === "moderation" ? "moderation" : thread.status.replaceAll("_"," ")}</small></span>
        <time>{formatRelativeTime(thread.updatedAt)}</time>
      </button>)}
      {!loading && threads.length === 0 && <div className="inbox-empty"><Icon name="message"/><strong>No conversations</strong><span>Messages and moderation requests will appear here.</span></div>}
    </aside>
    <section className="chat-panel">
      {selected ? <>
        <div className="chat-head">
          <button className="mobile-back" onClick={() => setActiveKey("")}><Icon name="arrow"/></button>
          <span className={`conversation-art ${selected.kind === "moderation" ? "moderation" : ""}`}><Icon name={selected.kind === "moderation" ? "shield" : "package"}/></span>
          <div><strong>{selected.listingTitle}</strong><small>{selected.otherAlias} · {selected.kind === "moderation" ? "private moderation thread" : "private marketplace participant"}</small></div>
          <button onClick={() => go(`/listing/${selected.listingSlug}`)} aria-label="Open listing"><Icon name="eye"/></button>
        </div>
        <div className="chat-messages">
          <div className="privacy-banner"><Icon name="lock"/><span>Do not share contact details, room numbers, OTPs, passwords, or advance-payment credentials.</span></div>
          {selected.kind === "moderation" && <div className="moderation-banner"><Icon name="shield"/><span>This thread is for listing corrections and moderation decisions. The listing owner can reply here.</span></div>}
          {messages.map((item) => <div key={item.id} className={`bubble ${item.sender_id === profile.id ? "mine" : "theirs"}`}>
            <p>{item.body}</p>
            <time>{new Date(item.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}{item.sender_id === profile.id && <Icon name="check" size={12}/>}</time>
          </div>)}
          {messages.length === 0 && <div className="thread-empty"><Icon name="message"/><strong>No messages yet</strong><span>{selected.kind === "moderation" ? "A moderator can request a correction here." : "Start with a question about condition, availability, or a public handover time."}</span></div>}
          <div ref={endRef}/>
        </div>
        {selected.kind === "marketplace" && !selectedClosed && <div className="quick-replies"><button onClick={() => setMessage("Is this still available?")}>Ask availability</button><button onClick={() => setMessage("Could we meet at a public campus gate?")}>Suggest public meetup</button></div>}
        <div className="chat-composer">
          <span/>
          <textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={2000} disabled={selectedClosed} placeholder={selectedClosed ? (accountMarketplaceLocked && selected?.kind === "marketplace" ? "Marketplace messaging is disabled for this account." : "This thread is closed.") : "Message without sharing contact details…"}/>
          <button className="send-button" onClick={() => void send()} aria-label="Send message" disabled={sending || selectedClosed || !message.trim()}><Icon name="send"/></button>
        </div>
      </> : <ArtEmptyState title={loading ? "Loading conversations" : "No private conversations"} copy={loading ? "Membership is being verified." : "Open a listing, respond to an offer, or wait for a moderation request."} action={loading ? null : <button className="primary-button" onClick={() => go("/browse")}>Browse marketplace</button>}/>}
    </section>
    <aside className="deal-sidebar">{selected && <>
      <div className="alias-profile"><span className="large-avatar">{selected.otherAlias.slice(0,1).toUpperCase()}</span><strong>{selected.otherAlias} <Icon name="shield" size={14}/></strong><small>{selected.kind === "moderation" ? "Authorized moderation channel" : "Verified conversation participant"}</small></div>
      {selected.kind === "marketplace" && <button className="danger" onClick={() => toast("Use the report flow before closing a safety-sensitive thread")}><Icon name="flag"/>Report conversation</button>}
      <button onClick={() => go(`/listing/${selected.listingSlug}`)}><Icon name="eye"/>Open related listing</button>
      <div className="deletion-copy"><Icon name="shield"/><p><strong>Private by design</strong>Only authorized participants and safety reviewers can access the relevant thread under database policy.</p></div>
    </>}</aside>
  </div>;
}


type AssistantHistoryItem = { role:"user"|"ai"; text:string; listingIds?:string[] };

const initialAssistantHistory: AssistantHistoryItem[] = [{
  role:"ai",
  text:"Tell me what you want to buy, sell, find, or improve. I will search only active marketplace listings when your question actually requires a search.",
}];

function AssistantView({ go, route, client, listings }: { go:(path:string)=>void; route:string; client:SupabaseClient|null; listings:Listing[] }) {
  const [prompt,setPrompt] = useState(() => new URL(route, "https://local.invalid").searchParams.get("q") ?? "");
  const [loading,setLoading] = useState(false);
  const [history,setHistory] = useState<AssistantHistoryItem[]>(initialAssistantHistory);
  const suggestions = ["Find active study items near my block","Draft a wanted post","How should I describe an item fault?","Explain safe handover rules"];
  const respond = async (text:string) => {
    const submitted = text.trim();
    if (!submitted || loading) return;
    setHistory((current) => [...current,{role:"user",text:submitted}]);
    setPrompt("");
    setLoading(true);
    try {
      const token = client ? (await client.auth.getSession()).data.session?.access_token : undefined;
      const headers: Record<string,string> = { "Content-Type":"application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch("/api/assistant", { method:"POST", headers, body:JSON.stringify({ message:submitted, scope:"my-block" }) });
      const data = await response.json() as { text?:string; error?:string; listingIds?:unknown };
      const rawText = data.text || data.error || "The assistant is unavailable. Core marketplace controls remain available.";
      const listingIds = Array.isArray(data.listingIds)
        ? data.listingIds.filter((id): id is string => typeof id === "string" && listings.some((listing) => listing.id === id)).slice(0,4)
        : [];
      setHistory((current) => [...current,{role:"ai",text:sanitizeAssistantText(rawText),listingIds}]);
    } catch {
      setHistory((current) => [...current,{role:"ai",text:"The assistant is offline. No inventory claim or marketplace action was attempted.",listingIds:[]}]);
    } finally { setLoading(false); }
  };
  return <div className="assistant-page"><aside className="assistant-sidebar"><div><span className="brand-mark"><span/></span><h2>ONYX Assistant</h2><p>Inventory-grounded copilot</p></div><button className="new-chat" onClick={() => setHistory(initialAssistantHistory)}><Icon name="plus"/>New conversation</button><nav><button className="active"><Icon name="message"/>Current chat</button><button onClick={() => go("/browse")}><Icon name="search"/>Search listings</button><button onClick={() => go("/safety")}><Icon name="shield"/>Safety policy</button></nav><div className="ai-privacy"><Icon name="lock"/><p>Prompt storage is disabled at the model request. Do not enter secrets or contact details.</p></div></aside><section className="assistant-workspace"><header><div><span className="online-dot"/><strong>Marketplace mode</strong></div><span className="mode-label">READ-ONLY · CONFIRM WRITES</span></header><div className="assistant-thread"><div className="assistant-intro"><span className="ai-orb"><Icon name="spark" size={28}/></span><h1>What are you trying to find—or hand on?</h1><p>Answers stay grounded in authorized active inventory.</p><div className="prompt-grid">{suggestions.map((item) => <button key={item} onClick={() => void respond(item)} disabled={loading}><Icon name="arrow" size={15}/>{item}</button>)}</div></div>{history.map((item,index) => {
        const matches = (item.listingIds ?? []).map((id) => listings.find((listing) => listing.id === id)).filter((listing): listing is Listing => Boolean(listing));
        return <div className={`assistant-message ${item.role}`} key={`${item.role}-${index}`}>{item.role === "ai" && <span className="ai-avatar"><Icon name="spark"/></span>}<div><p>{item.role === "ai" ? sanitizeAssistantText(item.text) : item.text}</p>{matches.length > 0 && <div className="assistant-match-list">{matches.map((listing) => <button key={listing.id} className="assistant-match-card" onClick={() => go(`/listing/${listing.slug}`)}><ListingMedia listing={listing} className="assistant-match-media"/><span><strong>{listing.title}</strong><small>{listing.postType === "wanted" ? "Budget up to" : "Price"} ₹{listing.price.toLocaleString("en-IN")} · {listing.location}</small></span><Icon name="chevron" size={16}/></button>)}</div>}{item.role === "ai" && index > 0 && matches.length === 0 && <div className="ai-actions"><button onClick={() => go("/browse")}>Open marketplace</button></div>}</div></div>;
      })}{loading && <div className="assistant-message ai"><span className="ai-avatar"><Icon name="spark"/></span><div><p>Checking the marketplace…</p></div></div>}</div><div className="assistant-composer"><textarea rows={1} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void respond(prompt); } }} maxLength={1200} placeholder="Ask about inventory, pricing, listings, or safety…"/><button onClick={() => void respond(prompt)} aria-label="Send" disabled={loading}><Icon name="send"/></button><small>ONYX never claims to buy, reserve, publish, or message without a separate confirmed action.</small></div></section></div>;
}


type OwnedListing = { id:string; title:string; post_type:"sale"|"wanted"; mode:"live"|"standard"; status:ListingStatus; stock:number; reserved_stock:number; price_inr:number|null; budget_max_inr:number|null; created_at:string };
type OfferSummary = {
  offer_id:string;
  listing_id:string;
  listing_slug:string;
  listing_title:string;
  post_type:"sale"|"wanted";
  other_alias:string;
  amount_inr:number;
  status:string;
  updated_at:string;
  direction:"incoming"|"outgoing";
  conversation_id:string|null;
};

function DashboardView({ client, profile, listings, saved, route, go, refreshListings, toast }: { client:SupabaseClient|null; profile:UserProfile|null; listings:Listing[]; saved:string[]; route:string; go:(path:string)=>void; refreshListings:()=>Promise<void>; toast:(message:string)=>void }) {
  const initialTab = new URL(route,"https://local.invalid").searchParams.get("tab") === "buying" ? "buying" : "selling";
  const [tab,setTab] = useState<"selling"|"buying">(initialTab);
  const [owned,setOwned] = useState<OwnedListing[]>([]);
  const [offers,setOffers] = useState<OfferSummary[]>([]);
  const [workingOffer,setWorkingOffer] = useState("");
  const accountLocked = profile?.accountStatus === "suspended" || profile?.accountStatus === "banned";
  const load = useCallback(async () => {
    if (!client || !profile) return;
    const [{data:listingData},{data:offerData}] = await Promise.all([
      client.from("listings").select("id,title,post_type,mode,status,stock,reserved_stock,price_inr,budget_max_inr,created_at").eq("owner_id",profile.id).order("created_at",{ascending:false}),
      client.rpc("get_my_offer_summaries"),
    ]);
    setOwned((listingData ?? []) as OwnedListing[]);
    setOffers((offerData ?? []) as OfferSummary[]);
  }, [client,profile]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(),0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const next = new URL(route,"https://local.invalid").searchParams.get("tab");
    if (next === "buying" || next === "selling") setTab(next);
  }, [route]);

  const update = async (listing:OwnedListing, action:"pause"|"resume"|"sold"|"stock", stock = listing.stock) => {
    if (!client) return;
    if (accountLocked) return toast("Marketplace controls are disabled for this account");
    const {error} = await client.rpc("update_listing_inventory",{p_listing_id:listing.id,p_action:action,p_stock:stock});
    if (error) return toast("Listing could not be updated");
    await Promise.all([load(),refreshListings()]);
    toast(listing.post_type === "wanted" && action === "sold" ? "Wanted request closed" : "Listing updated");
  };

  const openOfferConversation = async (offer:OfferSummary) => {
    if (!client) return;
    if (accountLocked) return toast("Marketplace messaging is disabled for this account");
    setWorkingOffer(offer.offer_id);
    const {data,error} = await client.rpc("open_offer_conversation",{p_offer_id:offer.offer_id});
    setWorkingOffer("");
    if (error || !data) return toast("A private conversation could not be opened");
    go(`/messages/${String(data)}`);
  };

  const respondToOffer = async (offer:OfferSummary, action:"accept"|"decline"|"cancel") => {
    if (!client) return;
    if (accountLocked) return toast("Offer controls are disabled for this account");
    setWorkingOffer(offer.offer_id);
    const {data,error} = await client.rpc("respond_to_offer",{p_offer_id:offer.offer_id,p_action:action});
    setWorkingOffer("");
    if (error) return toast(`Offer could not be ${action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled"}`);
    const row = Array.isArray(data) ? data[0] : data;
    await Promise.all([load(),refreshListings()]);
    if (action === "accept" && row?.conversation_id) {
      toast(offer.post_type === "wanted" ? "Match accepted and wanted request reserved" : "Offer accepted and stock reserved");
      go(`/messages/${String(row.conversation_id)}`);
    } else {
      toast(`Offer ${action === "decline" ? "declined" : "cancelled"}`);
    }
  };

  if (!client) return <div className="simple-page page-wrap"><ArtEmptyState title="Dashboard not enabled" copy="No local dashboard data or fallback account is bundled." action={<button className="secondary-button" onClick={() => go("/")}>Return home</button>}/></div>;
  if (!profile) return <div className="simple-page page-wrap"><ArtEmptyState title="Sign in to open your dashboard" copy="Your listings, offers, and saved items are protected by account-level database policies." action={<button className="primary-button" onClick={() => go("/auth/sign-in")}>Sign in</button>}/></div>;

  const saleListings = owned.filter((item) => item.post_type === "sale");
  const wantedListings = owned.filter((item) => item.post_type === "wanted");
  const incoming = offers.filter((offer) => offer.direction === "incoming" && ["open","countered"].includes(offer.status));
  const outgoing = offers.filter((offer) => offer.direction === "outgoing" && ["open","countered"].includes(offer.status));
  const wantedResponses = incoming.filter((offer) => offer.post_type === "wanted");

  const switchTab = (next:"selling"|"buying") => {
    setTab(next);
    window.history.replaceState({},"",`/dashboard?tab=${next}`);
  };

  return <div className="dashboard-page">
    <aside className="dashboard-rail">
      <button className="brand" onClick={() => go("/")}><span className="brand-mark"><span/></span><span className="brand-word">Onyx</span></button>
      <nav>
        <span>MARKETPLACE</span>
        <button onClick={() => go("/browse")}><Icon name="home"/>Feed</button>
        <button onClick={() => go("/messages")}><Icon name="message"/>Messages{incoming.length > 0 && <b>{incoming.length}</b>}</button>
        <button onClick={() => go("/assistant")}><Icon name="spark"/>Assistant</button>
        <span>YOUR ACCOUNT</span>
        <button className="active"><Icon name="grid"/>Dashboard</button>
        <button onClick={() => go("/notifications")}><Icon name="bell"/>Notifications</button>
        <button onClick={() => go("/settings")}><Icon name="settings"/>Settings</button>
      </nav>
      <div className="rail-profile"><span className="tiny-avatar">{profile.alias.slice(0,1).toUpperCase()}</span><span><strong>{profile.alias}</strong><small>{profile.location}</small></span></div>
    </aside>
    <section className="dashboard-main">
      <header>
        <div><div className="eyebrow red">ACCOUNT OVERVIEW</div><h1>{profile.alias}</h1><p>Buy and sell from one account. Only persisted activity is shown.</p></div>
        <div className="dashboard-create-actions">
          <button className="secondary-button" disabled={profile.accountStatus === "suspended" || profile.accountStatus === "banned"} onClick={() => go("/wanted/new")}><Icon name="search"/>Post wanted request</button>
          <button className="primary-button" disabled={profile.accountStatus === "suspended" || profile.accountStatus === "banned"} onClick={() => go("/sell")}><Icon name="plus"/>List item to sell</button>
        </div>
      </header>
      {profile.accountStatus !== "active" && <div className={`account-state-banner ${profile.accountStatus}`}><Icon name={profile.accountStatus === "warned" ? "flag" : "lock"}/><div><strong>{profile.accountStatus === "warned" ? `Account warning${profile.warningCount > 1 ? `s (${profile.warningCount})` : ""}` : profile.accountStatus === "suspended" ? "Marketplace access temporarily suspended" : "Account disabled"}</strong><p>{profile.moderationReason || "A moderation action is active on this account."}{profile.suspendedUntil && profile.accountStatus === "suspended" ? ` Access is scheduled to resume ${new Date(profile.suspendedUntil).toLocaleString()}.` : ""}</p><small>You can still read notifications and moderation messages. Marketplace publishing, offers, and ordinary chat are blocked while disabled.</small></div></div>}
      <div className="view-switch"><button className={tab === "selling" ? "active" : ""} onClick={() => switchTab("selling")}>Selling</button><button className={tab === "buying" ? "active" : ""} onClick={() => switchTab("buying")}>Buying & wanted</button></div>
      {tab === "selling" ? <>
        <div className="metric-grid">{[
          ["Active sale listings",saleListings.filter((item) => item.status === "active").length,"package"],
          ["Awaiting moderation",saleListings.filter((item) => item.status === "pending_moderation").length,"clock"],
          ["Offers to answer",incoming.filter((offer) => offer.post_type === "sale").length,"message"],
          ["Reserved units",saleListings.reduce((sum,item) => sum + item.reserved_stock,0),"lock"],
        ].map(([label,value,icon]) => <article key={String(label)}><span><Icon name={icon as IconName}/></span><small>{label}</small><strong>{value}</strong></article>)}</div>
        <OwnedListingsCard title="Items you are selling" copy="Sale listings only, with persisted stock and moderation status" emptyTitle="No sale listings yet" emptyCopy="Create a sale listing; wanted requests belong under Buying & wanted." listings={saleListings} go={go} update={update}/>
        <OffersCard title="Incoming offers" copy="Accepting reserves stock and opens a private conversation" offers={incoming.filter((offer) => offer.post_type === "sale")} workingOffer={workingOffer} openConversation={openOfferConversation} respond={respondToOffer}/>
      </> : <>
        <div className="metric-grid">{[
          ["Saved items",saved.length,"bookmark"],
          ["Responses to wanted posts",wantedResponses.length,"message"],
          ["Offers you sent",outgoing.length,"send"],
          ["Wanted posts",wantedListings.length,"search"],
        ].map(([label,value,icon]) => <article key={String(label)}><span><Icon name={icon as IconName}/></span><small>{label}</small><strong>{value}</strong></article>)}</div>
        <OwnedListingsCard title="Your wanted posts" copy="Requests for things you want to buy" emptyTitle="You have not posted a wanted request" emptyCopy="Describe what you need, your condition tolerance, and maximum budget." listings={wantedListings} go={go} update={update} wanted/>
        <OffersCard title="Responses to your wanted posts" copy="Message the responder, accept a match, or decline it" offers={wantedResponses} workingOffer={workingOffer} openConversation={openOfferConversation} respond={respondToOffer}/>
        <div className="buyer-panels">
          <div className="dashboard-card"><div className="card-heading"><div><h2>Saved nearby</h2><p>Only currently active items</p></div><button onClick={() => go("/browse")}>Browse more</button></div>{listings.filter((listing) => saved.includes(listing.id)).map((listing) => <button className="saved-row" key={listing.id} onClick={() => go(`/listing/${listing.slug}`)}><ListingMedia listing={listing}/><span><strong>{listing.title}</strong><small>{listing.location} · {listing.condition}</small></span><b>₹{listing.price.toLocaleString("en-IN")}</b><Icon name="chevron"/></button>)}{!listings.some((listing) => saved.includes(listing.id)) && <p className="muted-copy">No active saved items.</p>}</div>
          <OffersCard title="Offers you sent" copy="Open offers can be messaged or cancelled" offers={outgoing} workingOffer={workingOffer} openConversation={openOfferConversation} respond={respondToOffer}/>
        </div>
      </>}
    </section>
  </div>;
}

function OwnedListingsCard({ title, copy, emptyTitle, emptyCopy, listings, go, update, wanted = false }: {
  title:string;
  copy:string;
  emptyTitle:string;
  emptyCopy:string;
  listings:OwnedListing[];
  go:(path:string)=>void;
  update:(listing:OwnedListing,action:"pause"|"resume"|"sold"|"stock",stock?:number)=>Promise<void>;
  wanted?:boolean;
}) {
  return <div className="dashboard-card">
    <div className="card-heading"><div><h2>{title}</h2><p>{copy}</p></div><button onClick={() => go(wanted ? "/wanted/new" : "/sell")}><Icon name="plus"/>{wanted ? "Post wanted" : "New sale listing"}</button></div>
    {listings.length ? <div className="listing-table"><div className="table-head"><span>Post</span><span>Status</span><span>{wanted ? "Type" : "Stock"}</span><span>Reserved</span><span>{wanted ? "Budget" : "Price"}</span><span/></div>{listings.map((listing) => <div className="table-row" key={listing.id}>
      <span className="table-product"><span className="conversation-art"><Icon name={wanted ? "search" : "package"}/></span><span><strong>{listing.title}</strong><small>{listing.mode === "live" ? "Live post" : "Standard post"} · {formatRelativeTime(listing.created_at)}</small></span></span>
      <span><b className={`status-pill ${listing.status}`}>{listing.status.replaceAll("_"," ")}</b></span>
      <span>{wanted ? "Wanted" : <span className="stock-stepper"><button disabled={listing.status === "sold"} onClick={() => void update(listing,"stock",Math.max(listing.reserved_stock,listing.stock - 1))}>−</button><b>{listing.stock}</b><button disabled={listing.status === "sold"} onClick={() => void update(listing,"stock",listing.stock + 1)}>+</button></span>}</span>
      <span>{listing.reserved_stock}</span>
      <span>₹{Number(wanted ? listing.budget_max_inr ?? 0 : listing.price_inr ?? 0).toLocaleString("en-IN")}</span>
      <span className="row-menu">{["active","reserved"].includes(listing.status) && <button onClick={() => void update(listing,"pause")} aria-label="Pause"><Icon name="pause"/></button>}{listing.status === "paused" && <button onClick={() => void update(listing,"resume")} aria-label="Resume"><Icon name="refresh"/></button>}<button disabled={listing.status === "sold" || listing.reserved_stock > 0} onClick={() => void update(listing,"sold")} aria-label={wanted ? "Close request" : "Mark sold"} title={listing.reserved_stock > 0 ? "Complete or release active reservations first" : wanted ? "Close wanted request" : "Mark sold"}><Icon name="check"/></button></span>
    </div>)}</div> : <EmptyState icon={wanted ? "search" : "package"} title={emptyTitle} copy={emptyCopy} action={<button className="primary-button" onClick={() => go(wanted ? "/wanted/new" : "/sell")}>{wanted ? "Post wanted request" : "Create sale listing"}</button>}/>}
  </div>;
}

function OffersCard({ title, copy, offers, workingOffer, openConversation, respond }: {
  title:string;
  copy:string;
  offers:OfferSummary[];
  workingOffer:string;
  openConversation:(offer:OfferSummary)=>Promise<void>;
  respond:(offer:OfferSummary,action:"accept"|"decline"|"cancel")=>Promise<void>;
}) {
  return <div className="dashboard-card offers-card">
    <div className="card-heading"><div><h2>{title}</h2><p>{copy}</p></div></div>
    {offers.length ? offers.map((offer) => <div className="offer-row" key={offer.offer_id}>
      <span className="tiny-avatar">{offer.other_alias.slice(0,1).toUpperCase()}</span>
      <span><strong>{offer.other_alias}</strong><small>{offer.listing_title} · {offer.post_type === "wanted" ? "wanted response" : "sale offer"}</small></span>
      <b>₹{offer.amount_inr.toLocaleString("en-IN")}</b>
      <span className={`status-pill ${offer.status}`}>{offer.status}</span>
      <span className="offer-actions">
        <button disabled={workingOffer === offer.offer_id} onClick={() => void openConversation(offer)}><Icon name="message" size={14}/>Message</button>
        {offer.direction === "incoming" ? <>
          <button className="accept" disabled={workingOffer === offer.offer_id} onClick={() => void respond(offer,"accept")}>Accept</button>
          <button className="danger" disabled={workingOffer === offer.offer_id} onClick={() => void respond(offer,"decline")}>Decline</button>
        </> : <button className="danger" disabled={workingOffer === offer.offer_id} onClick={() => void respond(offer,"cancel")}>Cancel</button>}
      </span>
    </div>) : <p className="muted-copy">Nothing needs action here.</p>}
  </div>;
}


function AuthView({ client, route, go, onAuthenticated }: { client:SupabaseClient|null; route:string; go:(path:string)=>void; onAuthenticated:()=>Promise<void> }) {
  const [register,setRegister] = useState(route.includes("register"));
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [alias,setAlias] = useState("");
  const [locationSlug,setLocationSlug] = useState<string>(campusLocations[0][0]);
  const [sent,setSent] = useState(false);
  const [notice,setNotice] = useState("");
  const [working,setWorking] = useState(false);
  const [showPassword,setShowPassword] = useState(false);
  const updatingPassword = route.includes("update-password");

  const submit = async (event:FormEvent) => {
    event.preventDefault();
    if (!client) return;
    setWorking(true); setNotice("");
    try {
      if (updatingPassword) {
        const {error} = await client.auth.updateUser({password});
        if (error) throw error;
        setNotice("Password updated. You can continue to your dashboard.");
        return;
      }
      if (register) {
        if (!isAllowedAlias(alias.trim())) throw new Error("Choose a respectful alias. English abuse and Hindi abuse written in English are not allowed.");
        const response = await fetch("/api/auth/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password,alias,locationSlug}) });
        const data = await response.json() as {message?:string;error?:string};
        if (!response.ok) throw new Error(data.error || "Registration is unavailable.");
        setSent(true);
      } else {
        const {error} = await client.auth.signInWithPassword({email,password});
        if (error) throw new Error("Email or password is incorrect.");
        await onAuthenticated();
        go("/dashboard");
      }
    } catch (authError) {
      setNotice(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally { setWorking(false); }
  };
  const reset = async () => {
    if (!email) return setNotice("Enter your email first.");
    setWorking(true);
    try {
      await fetch("/api/auth/request-reset", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email}) });
      setSent(true);
    } finally { setWorking(false); }
  };
  return <div className="auth-page"><section className="auth-art"><Image src="/art/alias-manifesto.webp" alt="Black and white statue artwork with painted graphic marks" fill priority sizes="55vw"/><button className="brand light" onClick={() => go("/")}><span className="brand-mark"><span/></span><span className="brand-word">Onyx</span></button><div><div className="eyebrow"><Icon name="shield" size={14}/>PSEUDONYMOUS, NOT UNACCOUNTABLE</div><blockquote>Your email stays private.<br/><em>Your alias does the talking.</em></blockquote></div><div className="auth-art-footer"><span><Icon name="lock"/>No phone number required</span><span><Icon name="pin"/>Coarse residence only</span></div></section><section className="auth-form"><button className="auth-close" onClick={() => go("/")}><Icon name="close"/>Back to marketplace</button><div className="auth-form-inner">{!client ? <div className="verify-state"><span><Icon name="lock" size={28}/></span><div className="eyebrow red">ACCOUNTS DISABLED</div><h1>No fallback login.</h1><p>This deployment is not connected to an account provider, so ONYX refuses to simulate a user session.</p></div> : sent ? <div className="verify-state"><span><Icon name="send" size={28}/></span><div className="eyebrow red">CHECK YOUR INBOX</div><h1>Continue privately.</h1><p>If the request can be completed, a verification or recovery link will arrive. The response does not reveal whether an account already exists.</p><button className="text-button" onClick={() => setSent(false)}>Use a different email</button></div> : <><div className="eyebrow red">{updatingPassword ? "SECURE RECOVERY" : register ? "CREATE YOUR ALIAS" : "WELCOME BACK"}</div><h1>{updatingPassword ? "Choose a new password." : register ? "Join your campus market." : "Sign in to ONYX."}</h1><p>{register ? "One account buys and sells. Your email is never shown publicly." : "Your session is validated by the configured identity provider."}</p><form onSubmit={submit}>{register && !updatingPassword && <><label>Public alias<input value={alias} onChange={(event) => setAlias(event.target.value.replace(/[^A-Za-z0-9_-]/g,""))} minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_-]{2,23}" title="Begin with a letter; then use letters, numbers, underscore, or hyphen" placeholder="Choose a non-identifying alias" required/><small>Begin with a letter; use letters, numbers, underscore, or hyphen. Abusive English and Romanized Hindi aliases are blocked.</small></label><label>Residence<select value={locationSlug} onChange={(event) => setLocationSlug(event.target.value)}>{campusLocations.map(([slug,name]) => <option value={slug} key={slug}>{name}</option>)}</select></label></>}{!updatingPassword && <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required/></label>}<label>{updatingPassword ? "New password" : "Password"}<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={updatingPassword ? "new-password" : register ? "new-password" : "current-password"} placeholder="At least 10 characters" required minLength={10}/><button type="button" className={showPassword ? "visible" : ""} onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}><Icon name="eye"/></button></div></label>{!register && !updatingPassword && <div className="forgot-row"><span/><button type="button" onClick={() => void reset()}>Forgot password?</button></div>}<button className="primary-button auth-submit" type="submit" disabled={working}>{working ? "Working…" : updatingPassword ? "Update password" : register ? "Create account" : "Sign in"}<Icon name="arrow"/></button></form>{!updatingPassword && <div className="auth-switch">{register ? "Already have an account?" : "New to ONYX?"}<button onClick={() => { setRegister(!register); setNotice(""); }}>{register ? "Sign in" : "Create your alias"}</button></div>}{notice && <p className="form-error" role="alert">{notice}</p>}<p className="legal-copy">By continuing you accept the Terms, Privacy, Safety, and Prohibited Items policies. Have them reviewed for the operating jurisdiction before launch.</p></>}</div></section></div>;
}

type NotificationRow = { id:string; kind:string; title:string; body_safe:string; action_path:string|null; read_at:string|null; created_at:string };

function NotificationsView({ client, profile, go }: { client:SupabaseClient|null; profile:UserProfile|null; go:(path:string)=>void }) {
  const [notes,setNotes] = useState<NotificationRow[]>([]);
  useEffect(() => { if (client && profile) void client.from("notifications").select("id,kind,title,body_safe,action_path,read_at,created_at").eq("owner_id",profile.id).order("created_at",{ascending:false}).limit(100).then(({data}) => setNotes((data ?? []) as NotificationRow[])); }, [client,profile]);
  const mark = async (ids:string[]) => {
    if (!client || !ids.length) return;
    await client.from("notifications").update({read_at:new Date().toISOString()}).in("id",ids);
    setNotes((current) => current.map((note) => ids.includes(note.id) ? {...note,read_at:new Date().toISOString()} : note));
  };
  if (!profile) return <div className="simple-page page-wrap"><ArtEmptyState title="No public notification feed" copy="Notifications are private account records and are never fabricated for signed-out visitors." action={<button className="primary-button" onClick={() => go("/auth/sign-in")}>Sign in</button>}/></div>;
  return <div className="simple-page page-wrap"><div className="simple-heading"><div><div className="eyebrow red">YOUR ACTIVITY</div><h1>Notifications</h1><p>Privacy-safe updates from persisted account activity.</p></div><button className="secondary-button" disabled={!notes.some((note) => !note.read_at)} onClick={() => void mark(notes.filter((note) => !note.read_at).map((note) => note.id))}>Mark all read</button></div><div className="notification-layout"><div className="notification-list">{notes.map((note) => <button className={note.read_at ? "read" : ""} key={note.id} onClick={() => { void mark([note.id]); if (note.action_path) go(note.action_path); }}><span className="note-icon"><Icon name={(note.kind === "message" ? "message" : note.kind === "offer" ? "package" : "bell")}/></span><span><strong>{note.title}</strong><p>{note.body_safe}</p><small>{formatRelativeTime(note.created_at)}</small></span>{!note.read_at && <i/>}</button>)}{notes.length === 0 && <EmptyState icon="bell" title="No notifications" copy="Account events will appear here when they actually occur." action={null}/>}</div><aside className="preference-card"><Icon name="bell" size={28}/><h2>Choose the noise.</h2><p>Keep marketplace alerts in-app. Reserve email for account security and explicitly selected events.</p><button onClick={() => go("/settings")}>Account settings <Icon name="arrow"/></button></aside></div></div>;
}

function SettingsView({ client, profile, setProfile, go, toast }: { client:SupabaseClient|null; profile:UserProfile|null; setProfile:(profile:UserProfile|null)=>void; go:(path:string)=>void; toast:(message:string)=>void }) {
  const [alias,setAlias] = useState(profile?.alias ?? "");
  const [locationSlug,setLocationSlug] = useState<string>(campusLocations.find(([,name]) => name === profile?.location)?.[0] ?? campusLocations[0][0]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAlias(profile?.alias ?? "");
      setLocationSlug(campusLocations.find(([,name]) => name === profile?.location)?.[0] ?? campusLocations[0][0]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);
  if (!client || !profile) return <div className="simple-page page-wrap"><ArtEmptyState title="Sign in to control account data" copy="Settings are never stored in a local fallback profile." action={<button className="primary-button" onClick={() => go("/auth/sign-in")}>Sign in</button>}/></div>;
  const save = async () => {
    const normalizedAlias = alias.trim();
    if (!isAllowedAlias(normalizedAlias)) return toast("Choose a respectful 3–24 character alias. English abuse and Hindi abuse written in English are not allowed.");
    const locationName = campusLocations.find(([slug]) => slug === locationSlug)?.[1];
    if (!locationName) return toast("That residence is unavailable");
    const {data,error} = await client.rpc("update_my_profile", { p_alias:normalizedAlias, p_location_slug:locationSlug });
    if (error || !data) {
      const message = error?.message ?? "";
      if (message.includes("alias_disallowed")) return toast("Choose a respectful alias. English abuse and Hindi abuse written in English are not allowed.");
      if (message.includes("alias_change_cooldown")) return toast("Alias changes have a 30-day cooldown");
      return toast("Profile could not be updated");
    }
    setProfile({...profile,alias:normalizedAlias,location:locationName,locationSlug,locationId:String(data)});
    toast("Profile updated");
  };
  const signOut = async () => { await client.auth.signOut(); setProfile(null); go("/"); };
  const requestDeletion = async () => {
    const {error} = await client.rpc("request_account_deletion");
    toast(error ? "Deletion request could not be created" : "Account deletion request recorded");
  };
  return <div className="simple-page page-wrap"><div className="simple-heading"><div><div className="eyebrow red">ACCOUNT CONTROL</div><h1>Settings</h1><p>Manage the public alias and coarse residence attached to your verified account.</p></div></div><div className="settings-layout"><aside><button className="active">Profile</button><button onClick={() => go("/privacy")}>Privacy policy</button><button onClick={() => go("/data-deletion")}>Data deletion</button></aside><section className="settings-card"><h2>Public marketplace profile</h2><p>Email and internal account controls never appear on public profile projections.</p><label>Display alias<input value={alias} onChange={(event) => setAlias(event.target.value.replace(/[^A-Za-z0-9_-]/g,""))} minLength={3} maxLength={24}/><small>Avoid a real name, room number, contact handle, abusive English, or Romanized Hindi abuse. Alias changes have a 30-day cooldown.</small></label><label>Primary residence<select value={locationSlug} onChange={(event) => setLocationSlug(event.target.value)}>{campusLocations.map(([slug,name]) => <option value={slug} key={slug}>{name}</option>)}</select></label><button className="primary-button" onClick={() => void save()}>Save changes</button><button className="secondary-button settings-signout" onClick={() => void signOut()}>Sign out</button><div className="danger-zone"><h3>Data controls</h3><button onClick={() => void requestDeletion()}>Request account deletion</button></div></section></div></div>;
}


type AdminListingBase = {
  id:string;
  owner_id:string;
  title:string;
  description:string;
  post_type:"sale"|"wanted";
  mode:"live"|"standard";
  status:string;
  condition:string;
  price_inr:number|null;
  budget_max_inr:number|null;
  stock:number;
  created_at:string;
  category_id:string;
  location_id:string;
};
type AdminListing = AdminListingBase & {
  ownerAlias:string;
  categoryName:string;
  locationName:string;
  imageUrls:string[];
  aiDecision:string|null;
  aiProvider:string|null;
  aiSummary:string;
  aiIssues:ModerationIssue[];
  aiSuggestions:string[];
};
type AdminReport = {
  id:string;
  reporter_id:string;
  listing_id:string|null;
  conversation_id:string|null;
  reason:string;
  details:string;
  status:string;
  created_at:string;
  targetTitle:string;
};
type AdminModerationMessage = { id:string; sender_id:string; body:string; created_at:string };
type AdminUser = {
  user_id:string;
  alias:string;
  created_at:string;
  verified:boolean;
  status:"active"|"warned"|"suspended"|"banned";
  moderation_reason:string;
  suspended_until:string|null;
  warning_count:number;
  active_listing_count:number;
  open_report_count:number;
  is_staff:boolean;
};
type AccountHistoryRow = {
  id:string;
  action:"warning"|"suspend"|"restore"|"ban";
  reason:string;
  actor_alias:string;
  suspended_until:string|null;
  created_at:string;
};

function AdminView({ client, profile, go, toast }: { client:SupabaseClient|null; profile:UserProfile|null; go:(path:string)=>void; toast:(message:string)=>void }) {
  const [authorized,setAuthorized] = useState<boolean|null>(null);
  const [staffRole,setStaffRole] = useState<"moderator"|"admin"|null>(null);
  const [tab,setTab] = useState<"listings"|"reports"|"users">("listings");
  const [items,setItems] = useState<AdminListing[]>([]);
  const [reports,setReports] = useState<AdminReport[]>([]);
  const [users,setUsers] = useState<AdminUser[]>([]);
  const [selectedId,setSelectedId] = useState("");
  const [selectedReportId,setSelectedReportId] = useState("");
  const [selectedUserId,setSelectedUserId] = useState("");
  const [moderationNote,setModerationNote] = useState("");
  const [threadMessages,setThreadMessages] = useState<AdminModerationMessage[]>([]);
  const [threadReply,setThreadReply] = useState("");
  const [reportContext,setReportContext] = useState<MessageRow[]>([]);
  const [accountHistory,setAccountHistory] = useState<AccountHistoryRow[]>([]);
  const [accountReason,setAccountReason] = useState("");
  const [userSearch,setUserSearch] = useState("");
  const [userSearchBusy,setUserSearchBusy] = useState(false);
  const [userSearchError,setUserSearchError] = useState("");
  const userSearchSequence = useRef(0);
  const [working,setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!client || !profile) { setAuthorized(false); return; }
    const {data:roles} = await client.from("user_roles").select("role").eq("user_id",profile.id).in("role",["moderator","admin"]);
    const roleNames = (roles ?? []).map((row) => String(row.role));
    if (!roleNames.length) { setAuthorized(false); return; }
    setAuthorized(true);
    setStaffRole(roleNames.includes("admin") ? "admin" : "moderator");

    const [{data:listingRows},{data:reportRows}] = await Promise.all([
      client.from("listings").select("id,owner_id,title,description,post_type,mode,status,condition,price_inr,budget_max_inr,stock,created_at,category_id,location_id").eq("status","pending_moderation").order("created_at",{ascending:true}),
      client.from("reports").select("id,reporter_id,listing_id,conversation_id,reason,details,status,created_at").in("status",["open","reviewing"]).order("created_at",{ascending:true}),
    ]);
    const bases = (listingRows ?? []) as AdminListingBase[];
    const listingIds = bases.map((item) => item.id);
    const ownerIds = [...new Set(bases.map((item) => item.owner_id))];
    const categoryIds = [...new Set(bases.map((item) => item.category_id))];
    const locationIds = [...new Set(bases.map((item) => item.location_id))];
    const reportListingIds = [...new Set(((reportRows ?? []) as Omit<AdminReport,"targetTitle">[]).map((report) => report.listing_id).filter((id):id is string => Boolean(id)))];

    const [{data:owners},{data:categories},{data:locations},{data:images},{data:reportTargets},{data:signals}] = await Promise.all([
      ownerIds.length ? client.from("profiles").select("id,alias").in("id",ownerIds) : Promise.resolve({data:[]}),
      categoryIds.length ? client.from("categories").select("id,name").in("id",categoryIds) : Promise.resolve({data:[]}),
      locationIds.length ? client.from("locations").select("id,name").in("id",locationIds) : Promise.resolve({data:[]}),
      listingIds.length ? client.from("listing_images").select("listing_id,storage_path,sort_order").in("listing_id",listingIds).order("sort_order",{ascending:true}) : Promise.resolve({data:[]}),
      reportListingIds.length ? client.from("listings").select("id,title").in("id",reportListingIds) : Promise.resolve({data:[]}),
      listingIds.length ? client.from("listing_moderation_signals").select("listing_id,decision,provider,summary,issues,suggestions").in("listing_id",listingIds) : Promise.resolve({data:[]}),
    ]);

    const ownerRows = (owners ?? []) as {id:string;alias:string}[];
    const categoryRows = (categories ?? []) as {id:string;name:string}[];
    const locationRows = (locations ?? []) as {id:string;name:string}[];
    const imageRows = (images ?? []) as {listing_id:string;storage_path:string;sort_order:number}[];
    const reportTargetRows = (reportTargets ?? []) as {id:string;title:string}[];
    const signalRows = (signals ?? []) as {listing_id:string;decision:string;provider:string;summary:string;issues:unknown;suggestions:unknown}[];
    const ownerMap = new Map<string,string>(ownerRows.map((row) => [String(row.id),String(row.alias)]));
    const categoryMap = new Map<string,string>(categoryRows.map((row) => [String(row.id),String(row.name)]));
    const locationMap = new Map<string,string>(locationRows.map((row) => [String(row.id),String(row.name)]));
    const signalMap = new Map(signalRows.map((row) => [String(row.listing_id),row]));
    const imageMap = new Map<string,string[]>();
    const signedImages = await Promise.all(imageRows.map(async (image) => {
      const {data:signed} = await client.storage.from("listing-images").createSignedUrl(String(image.storage_path),21_600);
      return {...image,url:signed?.signedUrl ?? ""};
    }));
    for (const image of signedImages) {
      if (!image.url) continue;
      const id = String(image.listing_id);
      imageMap.set(id,[...(imageMap.get(id) ?? []),image.url]);
    }
    const nextItems = bases.map((item):AdminListing => {
      const signal = signalMap.get(item.id);
      return {
        ...item,
        ownerAlias:ownerMap.get(item.owner_id) ?? "Unknown alias",
        categoryName:categoryMap.get(item.category_id) ?? "Unknown category",
        locationName:locationMap.get(item.location_id) ?? "Unknown location",
        imageUrls:imageMap.get(item.id) ?? [],
        aiDecision:signal?.decision ?? null,
        aiProvider:signal?.provider ?? null,
        aiSummary:signal?.summary ?? "",
        aiIssues:Array.isArray(signal?.issues) ? signal.issues as ModerationIssue[] : [],
        aiSuggestions:Array.isArray(signal?.suggestions) ? signal.suggestions.map(String) : [],
      };
    });
    setItems(nextItems);
    setSelectedId((current) => nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? "");

    const targetMap = new Map<string,string>(reportTargetRows.map((row) => [String(row.id),String(row.title)]));
    const nextReports: AdminReport[] = ((reportRows ?? []) as Omit<AdminReport,"targetTitle">[]).map((report) => ({
      ...report,
      targetTitle:report.listing_id ? targetMap.get(report.listing_id) ?? "Listing report" : "Private conversation report",
    }));
    setReports(nextReports);
    setSelectedReportId((current) => nextReports.some((report) => report.id === current) ? current : nextReports[0]?.id ?? "");

  }, [client,profile]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(),0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const selectedUser = users.find((user) => user.user_id === selectedUserId) ?? null;

  const searchModerationUsers = useCallback(async (query:string) => {
    if (!client || authorized !== true) return;
    const sequence = ++userSearchSequence.current;
    setUserSearchBusy(true);
    setUserSearchError("");
    const {data,error} = await client.rpc("get_moderation_users",{p_search:query.trim()});
    if (sequence !== userSearchSequence.current) return;
    setUserSearchBusy(false);
    if (error) {
      setUserSearchError("User search failed. Refresh the dashboard and try again.");
      return;
    }
    const nextUsers = (data ?? []) as AdminUser[];
    setUsers(nextUsers);
    setSelectedUserId((current) => nextUsers.some((user) => user.user_id === current) ? current : nextUsers[0]?.user_id ?? "");
  }, [authorized,client]);

  useEffect(() => {
    if (authorized !== true) return;
    const timer = window.setTimeout(() => void searchModerationUsers(userSearch),280);
    return () => window.clearTimeout(timer);
  }, [authorized,searchModerationUsers,userSearch]);

  const refreshDashboard = useCallback(async () => {
    await load();
    await searchModerationUsers(userSearch);
  }, [load,searchModerationUsers,userSearch]);

  const loadModerationThread = useCallback(async () => {
    if (!client || !selected) { setThreadMessages([]); return; }
    const {data:thread} = await client.from("moderation_threads").select("id").eq("listing_id",selected.id).maybeSingle();
    if (!thread?.id) { setThreadMessages([]); return; }
    const {data} = await client.from("moderation_messages").select("id,sender_id,body,created_at").eq("thread_id",thread.id).order("created_at",{ascending:true});
    setThreadMessages((data ?? []) as AdminModerationMessage[]);
  }, [client,selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadModerationThread(),0);
    return () => window.clearTimeout(timer);
  }, [loadModerationThread]);

  useEffect(() => {
    if (!client || !selectedReport?.conversation_id) {
      const timer = window.setTimeout(() => setReportContext([]),0);
      return () => window.clearTimeout(timer);
    }
    void client.from("messages").select("id,sender_id,body,created_at,kind").eq("conversation_id",selectedReport.conversation_id).order("created_at",{ascending:false}).limit(50).then(({data}) => setReportContext(((data ?? []) as MessageRow[]).reverse()));
  }, [client,selectedReport]);

  const loadAccountHistory = useCallback(async () => {
    if (!client || !selectedUser) { setAccountHistory([]); return; }
    const {data} = await client.rpc("get_account_moderation_history",{p_user_id:selectedUser.user_id});
    setAccountHistory((data ?? []) as AccountHistoryRow[]);
  }, [client,selectedUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccountHistory(),0);
    return () => window.clearTimeout(timer);
  }, [loadAccountHistory]);

  const moderate = async (action:"approve"|"remove") => {
    if (!client || !selected) return;
    const reason = moderationNote.trim() || (action === "approve" ? "Approved after reviewing the listing copy, images, and advisory automated signals." : "");
    if (reason.length < 3) return toast("Add a removal reason before taking action");
    setWorking(true);
    const {error} = await client.rpc("moderate_listing",{p_listing_id:selected.id,p_action:action,p_reason:reason});
    setWorking(false);
    if (error) {
      if (error.message.includes("listing_owner_suspended")) return toast("This owner is suspended; restore the account before approving a listing");
      return toast("Moderation action failed authorization");
    }
    setModerationNote("");
    await load();
    toast(`Listing ${action === "approve" ? "approved" : "removed"}`);
  };

  const sendModeratorMessage = async () => {
    if (!client || !selected || threadReply.trim().length < 2) return toast("Write the correction or question first");
    setWorking(true);
    const {error} = await client.rpc("send_listing_moderation_message",{p_listing_id:selected.id,p_body:threadReply.trim()});
    setWorking(false);
    if (error) return toast("Moderator message could not be sent");
    setThreadReply("");
    await loadModerationThread();
    toast("Private moderation message sent to the listing owner");
  };

  const updateReport = async (status:"reviewing"|"actioned"|"closed") => {
    if (!client || !selectedReport) return;
    setWorking(true);
    const {error} = await client.rpc("update_report_status",{p_report_id:selectedReport.id,p_status:status,p_note:"Reviewed in the administrator moderation console"});
    setWorking(false);
    if (error) return toast("Report status could not be updated");
    await load();
    toast(`Report marked ${status}`);
  };

  const moderateAccount = async (action:"warning"|"suspend"|"restore"|"ban",durationHours:number|null = null) => {
    if (!client || !selectedUser) return;
    const reason = accountReason.trim();
    if (reason.length < 3) return toast("Record a clear reason before changing an account");
    if ((action === "suspend" || action === "ban") && !window.confirm(`${action === "ban" ? "Permanently disable" : "Temporarily suspend"} ${selectedUser.alias}?`)) return;
    setWorking(true);
    const {error} = await client.rpc("moderate_user_account",{
      p_user_id:selectedUser.user_id,
      p_action:action,
      p_reason:reason,
      p_duration_hours:durationHours,
    });
    setWorking(false);
    if (error) {
      if (error.message.includes("admin_target_requires_admin")) return toast("Only an administrator can act on a staff account");
      if (error.message.includes("admin_required")) return toast("Only an administrator can permanently disable or restore a banned account");
      return toast("The account action could not be completed");
    }
    setAccountReason("");
    await load();
    await searchModerationUsers(userSearch);
    await loadAccountHistory();
    toast(action === "warning" ? "Warning issued" : action === "restore" ? "Account access restored" : action === "ban" ? "Account permanently disabled" : "Account temporarily suspended");
  };

  if (authorized !== true) return <div className="simple-page page-wrap"><ArtEmptyState title={authorized === null ? "Checking authorization" : "Moderator access required"} copy="This route returns no queue data unless the connected account has a database-backed moderator or administrator role." action={null}/></div>;

  const disabledAccounts = users.filter((user) => user.status === "suspended" || user.status === "banned").length;
  const warningTotal = users.reduce((total,user) => total + Number(user.warning_count || 0),0);
  const userActionDisabled = !selectedUser || (selectedUser.is_staff && staffRole !== "admin");

  return <div className="admin-page page-wrap">
    <div className="admin-command-head">
      <div><div className="eyebrow red">ROLE-PROTECTED OPERATIONS</div><h1>Moderation command center</h1><p>Review listings and reports, contact owners, issue warnings, and disable abusive accounts with a complete audit history.</p></div>
      <div className="admin-head-actions"><span className="admin-badge"><Icon name="shield"/>{staffRole === "admin" ? "Administrator" : "Moderator"}</span><button className="secondary-button" onClick={() => void refreshDashboard()}><Icon name="refresh"/>Refresh</button></div>
    </div>
    <div className="admin-metrics">
      <article><small>Pending listings</small><strong>{items.length}</strong><span>Human approval required</span></article>
      <article><small>Open reports</small><strong>{reports.length}</strong><span>Safety and accuracy</span></article>
      <article><small>Disabled accounts</small><strong>{disabledAccounts}</strong><span>Suspended or banned</span></article>
      <article><small>Warnings issued</small><strong>{warningTotal}</strong><span>Retained in history</span></article>
    </div>
    <div className="admin-tabs">
      <button className={tab === "listings" ? "active" : ""} onClick={() => setTab("listings")}>Listing review <b>{items.length}</b></button>
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Safety reports <b>{reports.length}</b></button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Account enforcement <b>{users.length}</b></button>
    </div>

    {tab === "listings" && <div className="moderation-layout">
      <aside className="moderation-queue">{items.map((item) => <button className={selectedId === item.id ? "active" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setModerationNote(""); }}>
        <span className="conversation-art"><Icon name={item.post_type === "wanted" ? "search" : "package"}/></span>
        <span><strong>{item.title}</strong><small>{item.ownerAlias} · {item.post_type} · {formatRelativeTime(item.created_at)}</small>{item.aiDecision && <i className={`ai-queue-signal ${item.aiDecision}`}>{item.aiDecision.replaceAll("_"," ")}</i>}</span>
        <Icon name="chevron"/>
      </button>)}{items.length === 0 && <EmptyState icon="check" title="Queue cleared" copy="No listings are awaiting review." action={null}/>}</aside>
      <section className="moderation-detail">{selected ? <>
        <div className="moderation-detail-head"><div><span className={`post-tag ${selected.post_type}`}>{selected.post_type === "wanted" ? "WANTED" : "FOR SALE"}</span><h2>{selected.title}</h2><p>Submitted by <strong>{selected.ownerAlias}</strong> · {formatRelativeTime(selected.created_at)}</p></div><b className="status-pill pending">{selected.status.replaceAll("_"," ")}</b></div>
        <div className="moderation-gallery">{selected.imageUrls.length ? selected.imageUrls.map((url,index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`${selected.title} moderation image ${index + 1}`} referrerPolicy="no-referrer"/></a>) : <div><Icon name="camera"/><span>No image supplied{selected.post_type === "wanted" ? " (allowed for wanted posts)" : ""}</span></div>}</div>
        <div className="moderation-facts"><span><small>Category</small><strong>{selected.categoryName}</strong></span><span><small>Residence</small><strong>{selected.locationName}</strong></span><span><small>Condition</small><strong>{selected.condition.replaceAll("_"," ")}</strong></span><span><small>{selected.post_type === "wanted" ? "Budget" : "Price"}</small><strong>₹{Number(selected.post_type === "wanted" ? selected.budget_max_inr ?? 0 : selected.price_inr ?? 0).toLocaleString("en-IN")}</strong></span></div>
        <article className="moderation-description"><small>FULL DESCRIPTION</small><p>{selected.description}</p></article>
        <article className={`ai-moderation-card ${selected.aiDecision ?? "missing"}`}>
          <div><span className="ai-orb small"><Icon name="spark"/></span><div><small>NARROW IMAGE SAFETY CHECK · ADVISORY</small><h3>{selected.aiDecision ? selected.aiDecision.replaceAll("_"," ") : "No signal recorded"}</h3></div><b>{selected.aiProvider ?? "human review"}</b></div>
          <p>{selected.aiSummary || "The automated check was unavailable or the submission bypassed the normal interface. Review all text and images manually."}</p>
          {selected.aiIssues.length > 0 && <ul>{selected.aiIssues.map((issue,index) => <li key={`${issue.code}-${index}`} className={issue.severity}><strong>{issue.severity}</strong>{issue.message}</li>)}</ul>}
          {selected.aiSuggestions.length > 0 && <div className="ai-suggestions">{selected.aiSuggestions.map((suggestion) => <span key={suggestion}>{suggestion}</span>)}</div>}
          <small>AI only screens for explicit imagery and clearly vulgar text. It does not judge title-image relevance or photo quality, and it never approves or removes a listing.</small>
        </article>
        <label className="moderation-note">Decision note<textarea rows={3} maxLength={500} value={moderationNote} onChange={(event) => setModerationNote(event.target.value)} placeholder="Record the approval basis or exact removal reason."/></label>
        <div className="moderation-actions"><button className="primary-button" disabled={working} onClick={() => void moderate("approve")}><Icon name="check"/>Approve</button><button className="secondary-button danger" disabled={working} onClick={() => void moderate("remove")}><Icon name="trash"/>Remove</button></div>
        <div className="moderation-thread">
          <div className="card-heading"><div><h2>Message listing owner</h2><p>Request clearer photos or precise copy changes without exposing contact details.</p></div><button onClick={() => go("/messages")}><Icon name="message"/>Open inbox</button></div>
          <div className="moderation-thread-messages">{threadMessages.map((item) => <div className={item.sender_id === profile?.id ? "mine" : ""} key={item.id}><strong>{item.sender_id === profile?.id ? "Moderator" : selected.ownerAlias}</strong><p>{item.body}</p><time>{formatRelativeTime(item.created_at)}</time></div>)}{threadMessages.length === 0 && <p className="muted-copy">No moderation messages yet.</p>}</div>
          <textarea rows={3} maxLength={2000} value={threadReply} onChange={(event) => setThreadReply(event.target.value)} placeholder="Example: Please replace photo 1 with a brighter, front-facing photo and remove the external contact handle from the description."/>
          <button className="secondary-button" disabled={working || threadReply.trim().length < 2} onClick={() => void sendModeratorMessage()}><Icon name="send"/>Send change request</button>
        </div>
      </> : <EmptyState icon="check" title="Nothing pending" copy="The listing queue is clear." action={null}/>}</section>
    </div>}

    {tab === "reports" && <div className="moderation-layout reports-layout">
      <aside className="moderation-queue">{reports.map((report) => <button className={selectedReportId === report.id ? "active" : ""} key={report.id} onClick={() => setSelectedReportId(report.id)}>
        <span className="conversation-art moderation"><Icon name="flag"/></span>
        <span><strong>{report.targetTitle}</strong><small>{report.reason.replaceAll("_"," ")} · {formatRelativeTime(report.created_at)}</small></span>
        <b className={`status-pill ${report.status}`}>{report.status}</b>
      </button>)}{reports.length === 0 && <EmptyState icon="shield" title="No open reports" copy="New listing and conversation reports will appear here." action={null}/>}</aside>
      <section className="moderation-detail">{selectedReport ? <>
        <div className="moderation-detail-head"><div><div className="eyebrow red">PRIVATE SAFETY REPORT</div><h2>{selectedReport.targetTitle}</h2><p>{selectedReport.reason.replaceAll("_"," ")} · {formatRelativeTime(selectedReport.created_at)}</p></div><b className={`status-pill ${selectedReport.status}`}>{selectedReport.status}</b></div>
        <article className="moderation-description"><small>REPORTER DETAILS</small><p>{selectedReport.details}</p></article>
        {selectedReport.conversation_id && <div className="reported-context"><h3>Reported conversation context</h3>{reportContext.map((item) => <div key={item.id}><strong>{item.sender_id === selectedReport.reporter_id ? "Reporter" : "Other participant"}</strong><p>{item.body}</p><time>{formatRelativeTime(item.created_at)}</time></div>)}{reportContext.length === 0 && <p className="muted-copy">No message context is available.</p>}</div>}
        <div className="moderation-actions"><button className="secondary-button" disabled={working} onClick={() => void updateReport("reviewing")}>Mark reviewing</button><button className="primary-button" disabled={working} onClick={() => void updateReport("actioned")}>Actioned</button><button className="secondary-button" disabled={working} onClick={() => void updateReport("closed")}>Close report</button></div>
      </> : <EmptyState icon="shield" title="No report selected" copy="Choose a report to review its private details." action={null}/>}</section>
    </div>}

    {tab === "users" && <div className="moderation-layout account-layout">
      <aside className="moderation-queue account-queue">
        <div className="account-search">
          <Icon name="search"/>
          <input
            aria-label="Search users by public alias"
            autoComplete="off"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search users by public alias"
          />
          {userSearchBusy && <span className="account-search-spinner" aria-label="Searching users"/>}
          {userSearch && <button type="button" className="account-search-clear" onClick={() => setUserSearch("")} aria-label="Clear user search"><Icon name="close" size={14}/></button>}
        </div>
        <div className={`account-search-meta ${userSearchError ? "error" : ""}`}>
          {userSearchError || (userSearchBusy ? "Searching moderation records…" : `${users.length} ${users.length === 1 ? "account" : "accounts"} loaded${userSearch.trim() ? " for this alias search" : ""}`)}
        </div>
        {users.map((user) => <button className={selectedUserId === user.user_id ? "active" : ""} key={user.user_id} onClick={() => { setSelectedUserId(user.user_id); setAccountReason(""); }}>
          <span className="large-avatar compact">{user.alias.slice(0,1).toUpperCase()}</span>
          <span><strong>{user.alias}{user.is_staff ? " · Staff" : ""}</strong><small>{user.active_listing_count} listings · {user.warning_count} warnings</small></span>
          <b className={`account-status ${user.status}`}>{user.status}</b>
        </button>)}
        {users.length === 0 && !userSearchBusy && <EmptyState icon="user" title="No account found" copy={userSearch.trim() ? "No public alias matches this search." : "No moderation-visible accounts are available."} action={null}/>} 
      </aside>
      <section className="moderation-detail account-detail">{selectedUser ? <>
        <div className="account-profile-head"><span className="large-avatar">{selectedUser.alias.slice(0,1).toUpperCase()}</span><div><div className="eyebrow red">ACCOUNT ENFORCEMENT</div><h2>{selectedUser.alias}</h2><p>Joined {new Date(selectedUser.created_at).toLocaleDateString()} · {selectedUser.verified ? "Verified" : "Unverified"}{selectedUser.is_staff ? " · Staff account" : ""}</p></div><b className={`account-status large ${selectedUser.status}`}>{selectedUser.status}</b></div>
        <div className="moderation-facts account-facts"><span><small>Warnings</small><strong>{selectedUser.warning_count}</strong></span><span><small>Open listings</small><strong>{selectedUser.active_listing_count}</strong></span><span><small>Open reports</small><strong>{selectedUser.open_report_count}</strong></span><span><small>Disabled until</small><strong>{selectedUser.suspended_until ? new Date(selectedUser.suspended_until).toLocaleString() : "—"}</strong></span></div>
        {selectedUser.moderation_reason && <article className="moderation-description"><small>CURRENT MODERATION REASON</small><p>{selectedUser.moderation_reason}</p></article>}
        <label className="moderation-note">Required reason<textarea rows={4} maxLength={1000} value={accountReason} onChange={(event) => setAccountReason(event.target.value)} placeholder="State the exact behaviour, evidence, policy, and expected correction. This is shown to the user and retained in the audit history."/></label>
        {userActionDisabled && <div className="admin-inline-warning"><Icon name="lock"/><span>Only an administrator can act on another staff account.</span></div>}
        <div className="account-action-grid">
          <button className="secondary-button" disabled={working || userActionDisabled} onClick={() => void moderateAccount("warning")}><Icon name="flag"/>Issue warning</button>
          <button className="secondary-button danger" disabled={working || userActionDisabled} onClick={() => void moderateAccount("suspend",24)}><Icon name="pause"/>Disable 24 hours</button>
          <button className="secondary-button danger" disabled={working || userActionDisabled} onClick={() => void moderateAccount("suspend",168)}><Icon name="pause"/>Disable 7 days</button>
          <button className="secondary-button danger" disabled={working || userActionDisabled} onClick={() => void moderateAccount("suspend",720)}><Icon name="pause"/>Disable 30 days</button>
          <button className="primary-button" disabled={working || userActionDisabled || selectedUser.status === "active"} onClick={() => void moderateAccount("restore")}><Icon name="refresh"/>Restore access</button>
          {staffRole === "admin" && <button className="secondary-button critical" disabled={working || userActionDisabled} onClick={() => void moderateAccount("ban")}><Icon name="trash"/>Permanent disable</button>}
        </div>
        <div className="account-effect-note"><Icon name="shield"/><p><strong>What disabling does</strong>Pauses or removes the user’s public listings, cancels open offers and conversations, and blocks new marketplace writes at the database boundary. The user can still sign in, read the reason, receive notifications, and use private moderation messages.</p></div>
        <div className="account-history"><div className="card-heading"><div><h2>Moderation history</h2><p>Warnings and access changes cannot be erased from the operational record.</p></div></div>{accountHistory.map((entry) => <article key={entry.id}><span className={`history-action ${entry.action}`}><Icon name={entry.action === "warning" ? "flag" : entry.action === "restore" ? "refresh" : "lock"}/></span><div><strong>{entry.action.replaceAll("_"," ")}</strong><p>{entry.reason}</p><small>By {entry.actor_alias} · {formatRelativeTime(entry.created_at)}{entry.suspended_until ? ` · Until ${new Date(entry.suspended_until).toLocaleString()}` : ""}</small></div></article>)}{accountHistory.length === 0 && <p className="muted-copy">No account actions have been recorded.</p>}</div>
      </> : <EmptyState icon="user" title="No account selected" copy="Choose an account to review its status and history." action={null}/>}</section>
    </div>}
  </div>;
}

function PolicyView({ path, go }: { path:string; go:(route:string)=>void }) {
  const key = path.split("?")[0].split("/")[1] || "safety";
  const content: Record<string,{eyebrow:string;title:string;intro:string;sections:[string,string][]}> = {
    safety:{eyebrow:"SAFETY MODEL",title:"Private by default. Accountable when it matters.",intro:"ONYX reduces unnecessary exposure while preserving reports, moderation, and applicable legal obligations.",sections:[["Public handovers only","Use a staffed gate, lobby, library entrance, or another broad campus landmark. Never publish a room number or precise live location."],["No advance-payment pressure","ONYX does not process money. Inspect the item first and never share OTPs or account credentials."],["Report before completion","A reported conversation enters restricted safety hold and leaves the normal deletion queue while authorized moderators investigate."],["Pseudonymous, not untraceable","Other students see an alias and coarse residence. The service still verifies accounts privately."]]},
    privacy:{eyebrow:"PRIVACY TEMPLATE",title:"Trust without oversharing.",intro:"This product policy is a technical draft, not legal advice. It needs qualified review for the operating jurisdiction and campus.",sections:[["Public profile","Alias, verified-student state, coarse residence, account age, and aggregate reputation."],["Private account data","Email, reset credentials, internal account controls, security metadata, and moderation history are not included in public projections."],["AI boundaries","Only an authorized active-inventory projection is sent when the assistant is explicitly invoked; model-side prompt storage is disabled."],["Deployment privacy","Production source maps are disabled, referrers are suppressed, images are metadata-stripped, and no analytics SDK is bundled."]]},
    terms:{eyebrow:"TERMS TEMPLATE",title:"Clear rules for a student-to-student market.",intro:"ONYX provides discovery and private communication. It does not own listings, arrange delivery, hold money, or guarantee transactions.",sections:[["One accountable account","Students use accurate private registration data and one public alias."],["Listings","Owners are responsible for accurate descriptions, lawful ownership, safe condition, stock, and availability."],["Handover","Participants choose whether and how to complete a deal. ONYX never asks for an OTP."],["Enforcement","Warnings, removal, suspension, bans, and appeals belong in an auditable moderation history."]]},
    "prohibited-items":{eyebrow:"MARKETPLACE RULES",title:"Some things never belong in the corridor.",intro:"Automated signals may support review, but enforcement remains authorized and auditable.",sections:[["Always prohibited","Weapons, drugs, medication, alcohol, tobacco or vapes, stolen or counterfeit goods, explicit content, animals, private data, and illegal goods."],["Academic integrity","Impersonation, leaked exams, assignment completion, and cheating services are prohibited."],["Food safety","Only eligible, sealed, unexpired shelf-stable products should be permitted under reviewed local rules."],["Electrical and mobility","Sellers must disclose known faults and lawful ownership."]]},
    "data-deletion":{eyebrow:"DELETION LIFECYCLE",title:"Deletion is a process, not an impossible promise.",intro:"ONYX should explain immediate interface removal, queued deletion, and narrow safety-hold exceptions.",sections:[["Completed conversations","Normal inbox access is revoked and content is queued for deletion within the published window."],["Minimal receipt","A narrowly scoped transaction record may be retained without message content for a disclosed period."],["Reported threads","A report made before deletion freezes only that thread in restricted moderation storage."],["Account deletion","Fresh authentication and a recorded deletion job are required; legal or safety exceptions must be disclosed."]]},
    contact:{eyebrow:"CONTACT",title:"Support without exposing a founder.",intro:"Use a role-based support address and least-privilege operational account configured outside the source package.",sections:[["Marketplace support","Use an authenticated help flow for listings, offers, access, and account settings."],["Safety reports","Attach only necessary listing or conversation context; never expose moderator identity by default."],["Campus coordination","Use a separate role-based channel with documented scope and auditing."],["No secrets in messages","Never send passwords, OTPs, API keys, precise room details, or payment credentials."]]},
    status:{eyebrow:"DEPLOYMENT READINESS",title:"No fabricated uptime or activity.",intro:"The interface shows empty states when services or records are absent. Operational monitoring must be connected before publishing service-level claims.",sections:[["Marketplace data","Active public posts come only from the database’s safe marketplace projection."],["Offers and chat","Participant membership and write access are enforced by authenticated database policies and security-definer functions."],["Assistant","Without active inventory, the assistant returns an honest no-inventory response rather than sample recommendations."],["Health check","The health endpoint exposes only a minimal status response and no configuration or deployment identity."]]},
  };
  const page = content[key] ?? content.safety;
  return <div className="policy-page"><section className="policy-hero"><div className="page-wrap"><div className="eyebrow red">{page.eyebrow}</div><h1>{page.title}</h1><p>{page.intro}</p><div><button className="bone-button" onClick={() => go("/auth/register")}>Create your alias <Icon name="arrow"/></button><button className="glass-button" onClick={() => go("/browse")}>Return to marketplace</button></div></div></section><section className="policy-body page-wrap"><nav aria-label="Policy pages">{[["/safety","Safety"],["/privacy","Privacy"],["/terms","Terms"],["/prohibited-items","Prohibited items"],["/data-deletion","Data deletion"],["/contact","Contact"],["/status","Status"]].map(([route,label]) => <button key={route} className={path.startsWith(route) ? "active" : ""} onClick={() => go(route)}>{label}</button>)}</nav><div>{page.sections.map(([title,copy],index) => <article key={title}><span>{String(index + 1).padStart(2,"0")}</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}<div className="policy-review"><Icon name="flag"/><div><strong>Before production launch</strong><p>Have qualified counsel review policies, retention windows, campus obligations, grievance handling, and the operating entity’s role-based contact details.</p></div></div></div></section><Footer go={go}/></div>;
}

function OfferDialog({ listing, close, submit }: { listing:Listing; close:()=>void; submit:(amount:number,note:string)=>Promise<void> }) {
  const [amount,setAmount] = useState(String(Math.max(1,Math.round(listing.price * 0.9))));
  const [note,setNote] = useState("");
  const [sending,setSending] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div className="offer-dialog" role="dialog" aria-modal="true" aria-labelledby="offer-title" onMouseDown={(event) => event.stopPropagation()}><button className="dialog-close" onClick={close} aria-label="Close"><Icon name="close"/></button><div className="dialog-listing"><span className="conversation-art"><Icon name="package"/></span><span><small>{listing.postType === "sale" ? "MAKE AN OFFER" : "RESPOND TO REQUEST"}</small><strong>{listing.title}</strong><p>{listing.location} · ₹{listing.price.toLocaleString("en-IN")}</p></span></div><h2 id="offer-title">Keep it fair and private.</h2><label>Your amount<div className="price-input large"><span>₹</span><input autoFocus inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g,""))}/></div></label><label>Short note · optional<textarea rows={3} maxLength={180} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Mention timing or condition questions—never contact details."/></label><div className="offer-safety"><Icon name="shield"/><span>Offers do not move money. Stock is reserved only through an authorized seller action.</span></div><button className="primary-button dialog-submit" onClick={async () => { setSending(true); await submit(Number(amount),note.trim()); setSending(false); }} disabled={!amount || sending}>{sending ? "Sending…" : "Send private offer"} <Icon name="arrow"/></button></div></div>;
}

function EmptyState({ icon, title, copy, action }: { icon:IconName; title:string; copy:string; action:ReactNode }) {
  return <div className="empty-state"><span><Icon name={icon} size={28}/></span><h2>{title}</h2><p>{copy}</p>{action}</div>;
}

function ArtEmptyState({ title, copy, action }: { title:string; copy:string; action:ReactNode }) {
  return <div className="art-empty-state"><Image src="/art/onyx-wave.webp" alt="" fill sizes="(max-width: 768px) 100vw, 900px"/><div><span><Icon name="search" size={25}/></span><h2>{title}</h2><p>{copy}</p>{action}</div></div>;
}

function FinalCTA({ go }: { go:(route:string)=>void }) {
  return <section className="final-cta"><div className="page-wrap"><div className="eyebrow">START WITHOUT OVERSHARING</div><h2>The next useful thing<br/><em>may be one corridor away.</em></h2><p>Create a public alias, verify privately, and submit one honest listing for moderation.</p><div><button className="bone-button" onClick={() => go("/auth/register")}>Create your alias <Icon name="arrow"/></button><button className="glass-button" onClick={() => go("/browse")}>Browse first</button></div></div></section>;
}

function Footer({ go }: { go:(route:string)=>void }) {
  return <footer><div className="page-wrap footer-grid"><div className="footer-brand"><button className="brand light" onClick={() => go("/")}><span className="brand-mark"><span/></span><span className="brand-word">Onyx</span></button><p>A quiet, accountable marketplace for campus life.</p><span>Verified students. Public aliases. Local handovers. Less waste.</span></div><div><strong>Marketplace</strong><button onClick={() => go("/browse")}>Active listings</button><button onClick={() => go("/wanted")}>Wanted board</button><button onClick={() => go("/sell")}>Sell an item</button><button onClick={() => go("/assistant")}>ONYX Assistant</button></div><div><strong>Account</strong><button onClick={() => go("/dashboard")}>Dashboard</button><button onClick={() => go("/messages")}>Messages</button><button onClick={() => go("/notifications")}>Notifications</button><button onClick={() => go("/settings")}>Settings</button></div><div><strong>Trust & legal</strong><button onClick={() => go("/safety")}>Safety</button><button onClick={() => go("/prohibited-items")}>Prohibited items</button><button onClick={() => go("/privacy")}>Privacy</button><button onClick={() => go("/data-deletion")}>Data deletion</button></div></div><div className="page-wrap footer-bottom"><span>© 2026 ONYX · Student to student, nothing in between.</span><span>Policy templates require legal review before launch.</span></div></footer>;
}

function MobileNav({ current, go }: { current:RouteName; go:(route:string)=>void }) {
  return <nav className="mobile-nav" aria-label="Mobile navigation"><button className={current === "home" ? "active" : ""} onClick={() => go("/")}><Icon name="home"/><span>Home</span></button><button className={current === "browse" ? "active" : ""} onClick={() => go("/browse")}><Icon name="search"/><span>Search</span></button><button className="mobile-sell" onClick={() => go("/sell")}><span><Icon name="plus"/></span><small>Sell</small></button><button className={current === "messages" ? "active" : ""} onClick={() => go("/messages")}><Icon name="message"/><span>Messages</span></button><button className={current === "dashboard" ? "active" : ""} onClick={() => go("/dashboard")}><Icon name="user"/><span>Account</span></button></nav>;
}
