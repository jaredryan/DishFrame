"use client";

import * as React from "react";
import {
  markOnboardingGuideState,
  resetOnboardingGuideState,
} from "@/lib/preferences/actions";
import type {
  OnboardingGuideKey,
  OnboardingGuideStatus,
  OnboardingState,
} from "@/lib/preferences/onboarding-guides";

type OnboardingContextValue = {
  state: OnboardingState;
  guideStatus: (guideKey: OnboardingGuideKey) => OnboardingGuideStatus | null;
  markGuide: (
    guideKey: OnboardingGuideKey,
    status: OnboardingGuideStatus,
  ) => void;
  resetGuide: (guideKey: OnboardingGuideKey) => void;
};

// Deliberately `undefined`, not a fake "everything completed" fallback —
// see `useOnboarding` below. A silent default previously masked a missing
// provider by making every CoachMark render nothing, which could quietly
// disable onboarding in production if the (app)/(cook) layouts' wiring
// ever broke without anyone noticing.
const OnboardingContext = React.createContext<
  OnboardingContextValue | undefined
>(undefined);

/**
 * Seeded once from server-fetched `UserPreference.onboardingState`
 * (PRODUCT_SPEC.md §92.5) and updated optimistically here so a guide never
 * flickers back on before its server round trip resolves; the mutation is
 * still persisted server-side, not local-storage-only, so completion state
 * is shared across devices (BUILD_PLAN.md Slice 20 manual QA target).
 */
export function OnboardingProvider({
  initialState,
  children,
}: {
  initialState: OnboardingState;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<OnboardingState>(initialState);

  const markGuide = React.useCallback(
    (guideKey: OnboardingGuideKey, status: OnboardingGuideStatus) => {
      setState((prev) => ({ ...prev, [guideKey]: status }));
      void markOnboardingGuideState(guideKey, status);
    },
    [],
  );

  const resetGuide = React.useCallback((guideKey: OnboardingGuideKey) => {
    setState((prev) => {
      const next = { ...prev };
      delete next[guideKey];
      return next;
    });
    void resetOnboardingGuideState(guideKey);
  }, []);

  const guideStatus = React.useCallback(
    (guideKey: OnboardingGuideKey) => state[guideKey] ?? null,
    [state],
  );

  const value = React.useMemo(
    () => ({ state, guideStatus, markGuide, resetGuide }),
    [state, guideStatus, markGuide, resetGuide],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

/**
 * Throws when rendered outside an `OnboardingProvider`, deliberately — a
 * component that reads onboarding state genuinely needs a real one (see the
 * module comment above). Isolated component tests must wrap `render` calls
 * in `<OnboardingProvider initialState={{}}>` (see dish-editor.test.tsx,
 * cooking-mode-shell.test.tsx, session-review-form.test.tsx,
 * nutrition-fields.test.tsx for the pattern) rather than relying on a
 * silent default.
 */
export function useOnboarding(): OnboardingContextValue {
  const context = React.useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
