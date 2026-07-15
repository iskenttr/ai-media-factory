export type WorkerStage = () => Promise<boolean>;

export interface RoundRobinScheduler {
  runNext(): Promise<boolean>;
}

export function createRoundRobinScheduler(stages: readonly WorkerStage[]): RoundRobinScheduler {
  if (stages.length === 0) throw new Error("worker_stages_required");

  let nextStageIndex = 0;

  return {
    async runNext() {
      for (let offset = 0; offset < stages.length; offset += 1) {
        const stageIndex = (nextStageIndex + offset) % stages.length;
        if (await stages[stageIndex]()) {
          nextStageIndex = (stageIndex + 1) % stages.length;
          return true;
        }
      }
      return false;
    },
  };
}
