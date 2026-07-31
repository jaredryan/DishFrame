import {
  Home,
  BookOpen,
  Layers,
  ChefHat,
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
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];
