import {
  Home,
  BookOpen,
  Layers,
  ChefHat,
  CalendarRange,
  ShoppingCart,
  Share2,
  Users,
  Settings,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const APP_NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/parts", label: "Parts", icon: Layers },
  // PRODUCT_SPEC.md §26.6: active/recent Cooking Sessions must be reachable
  // without searching the source Recipe/Part first.
  { href: "/cook", label: "Cook", icon: ChefHat },
  // Slice 21 structural audit: Meal Plans, Grocery Lists, Share, and Tasters
  // were completed (Slices 12/15/16-17/9) but had no primary-nav entry —
  // reachable only by direct URL or an onboarding-guide replay.
  { href: "/meal-plans", label: "Meal Plans", icon: CalendarRange },
  { href: "/grocery-lists", label: "Grocery Lists", icon: ShoppingCart },
  { href: "/share", label: "Share", icon: Share2 },
  { href: "/tasters", label: "Tasters", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];
