"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const emptySubscribe = () => () => {};

// Theme is only known after hydration (next-themes reads it from
// localStorage/media query on the client). Tracking mount state via
// useSyncExternalStore avoids a setState-in-effect render cascade.
function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle({
  className,
  size = "compact",
}: {
  className?: string;
  size?: "compact" | "large";
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = mounted
    ? OPTIONS.findIndex((option) => option.value === theme)
    : -1;
  // Exactly one option must stay in the Tab sequence even before hydration
  // resolves a theme — fall back to the first option.
  const tabbableIndex = activeIndex === -1 ? 0 : activeIndex;

  const selectByIndex = (index: number) => {
    setTheme(OPTIONS[index].value);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        selectByIndex((index - 1 + OPTIONS.length) % OPTIONS.length);
        break;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        selectByIndex((index + 1) % OPTIONS.length);
        break;
      case "Home":
        event.preventDefault();
        selectByIndex(0);
        break;
      case "End":
        event.preventDefault();
        selectByIndex(OPTIONS.length - 1);
        break;
      case " ":
      case "Spacebar":
        event.preventDefault();
        setTheme(OPTIONS[index].value);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "border-border bg-muted inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }, index) => {
        const isActive = mounted && theme === value;
        return (
          <button
            key={value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "focus-visible:ring-ring/50 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              size === "large"
                ? "min-h-11 flex-1 px-3 text-sm"
                : "h-7 px-2.5 text-xs",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={size === "large" ? "size-4" : "size-3.5"}
              aria-hidden="true"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
