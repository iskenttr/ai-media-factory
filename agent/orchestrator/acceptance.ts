export interface AcceptanceEvidence {
  renderPassed: boolean;
  renderSkippedByContract: boolean;
  criticalErrorCount: number;
  maximumCriticalErrors: number;
  renderArtifactsComplete: boolean;
}

export function acceptanceEvidencePassed(evidence: AcceptanceEvidence) {
  const artifactGatePassed = evidence.renderSkippedByContract || evidence.renderArtifactsComplete;
  return evidence.renderPassed
    && evidence.criticalErrorCount <= evidence.maximumCriticalErrors
    && artifactGatePassed;
}
