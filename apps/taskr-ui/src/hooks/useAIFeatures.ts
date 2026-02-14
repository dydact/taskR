import { useShell } from "../context/ShellContext";

/**
 * Hook for gating AI-enhanced features in TaskR.
 * When aiEnhanced is false, TaskR operates as a vanilla task manager.
 * When aiEnhanced is true, Dydact AI features are enabled.
 */
export function useAIFeatures() {
  const { preferences } = useShell();
  const enabled = preferences.aiEnhanced;

  return {
    /** Master toggle - true if AI features are enabled */
    enabled,
    /** Show Kairos time-based suggestions */
    showKairosSuggestions: enabled,
    /** Show AI agent assignment options */
    showAgentAssignment: enabled,
    /** Show memPODS context integration */
    showMemPODSContext: enabled,
    /** Show AI-powered insights and recommendations */
    showAIInsights: enabled,
    /** Show Dydact dock and control center */
    showDydactDock: enabled,
    /** Show AI persona selector */
    showAIPersonaSelector: enabled,
  };
}

export default useAIFeatures;
