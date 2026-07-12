import type { StudioSuggestion } from "@/lib/studio/contracts";

import styles from "./Studio.module.css";

export function SuggestionsPanel({ suggestions, onDecision, onSelect }: {
  suggestions: StudioSuggestion[];
  onDecision: (suggestion: StudioSuggestion, status: "accepted" | "ignored") => void;
  onSelect: (segmentId: string) => void;
}) {
  return <section className={styles.suggestions} aria-labelledby="suggestions-title">
    <div className={styles.suggestionsHeading}><p id="suggestions-title">AI Suggestions</p><span>{suggestions.length}</span></div>
    {suggestions.length === 0 ? <p className={styles.suggestionsEmpty}>Nothing needs your attention right now.</p> : <div className={styles.suggestionList}>
      {suggestions.map((suggestion) => <article key={suggestion.id} className={styles.suggestion}>
        <div className={styles.suggestionMeta}><span data-confidence={suggestion.confidence}>{suggestion.confidence} evidence</span></div>
        <button className={styles.suggestionTitle} type="button" onClick={() => suggestion.segmentId && onSelect(suggestion.segmentId)}>{suggestion.title}</button>
        <p>{suggestion.explanation}</p>
        <div className={styles.suggestionActions}><button type="button" onClick={() => onDecision(suggestion, "accepted")}>Accept</button><button type="button" onClick={() => onDecision(suggestion, "ignored")}>Ignore</button></div>
      </article>)}
    </div>}
  </section>;
}
