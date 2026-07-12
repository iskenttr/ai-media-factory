export interface VisualDiffResult { meanAbsoluteError: number; changedPixelRatio: number; regressed: boolean }

export function visualDiff(before: Uint8Array, after: Uint8Array, changeThreshold = 24, regressionThreshold = 0.12): VisualDiffResult {
  if (before.length !== after.length || before.length === 0) throw new Error("visual_diff_shape_mismatch");
  let absolute = 0;
  let changed = 0;
  for (let index = 0; index < before.length; index += 1) {
    const delta = Math.abs(before[index] - after[index]);
    absolute += delta;
    if (delta >= changeThreshold) changed += 1;
  }
  const changedPixelRatio = changed / before.length;
  return {
    meanAbsoluteError: Number((absolute / before.length).toFixed(3)),
    changedPixelRatio: Number(changedPixelRatio.toFixed(4)),
    regressed: changedPixelRatio > regressionThreshold,
  };
}
