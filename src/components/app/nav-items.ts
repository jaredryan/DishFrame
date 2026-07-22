import {
  Home,
  BookOpen,
  Layers,
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
  { href: "/help", label: "Help", icon: HelpCircle },
];
