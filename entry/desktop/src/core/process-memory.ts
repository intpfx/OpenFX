export interface ProcessMemorySnapshot {
  physicalFootprintBytes: number | null;
  ioAcceleratorVirtualBytes: number | null;
  ioAcceleratorRegionCount: number | null;
}

export interface ProcessMemorySample {
  index: number;
  snapshot: ProcessMemorySnapshot;
}

export interface ProcessMemorySamplingResult {
  passed: boolean;
  reason: string | null;
  baseline: ProcessMemorySample | null;
  peak: ProcessMemorySnapshot | null;
  final: ProcessMemorySample | null;
  failure: ProcessMemorySample | null;
}

export interface ProcessMemorySamplingOptions {
  sampleCount: number;
  sampleIntervalMs: number;
  ioAcceleratorRegionGrowthLimit: number;
  ioAcceleratorVirtualGrowthLimitBytes: number;
  physicalFootprintGrowthLimitBytes: number;
  delay(milliseconds: number): Promise<void>;
  sample(index: number): Promise<ProcessMemorySnapshot>;
}

interface CompleteProcessMemorySnapshot extends ProcessMemorySnapshot {
  physicalFootprintBytes: number;
  ioAcceleratorVirtualBytes: number;
  ioAcceleratorRegionCount: number;
}

const BINARY_UNIT_BYTES = {
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
} as const;

export function parseVmmapSummary(text: string): ProcessMemorySnapshot {
  const physicalMatch = text.match(
    /^[ \t]*Physical footprint:[ \t]*(\d+(?:\.\d+)?)[ \t]*([KMG])[ \t]*$/m,
  );
  const ioAcceleratorMatch = text.match(
    /^[ \t]*IOAccelerator[ \t]+(\d+(?:\.\d+)?)[ \t]*([KMG])(?:[ \t]+\d+(?:\.\d+)?[ \t]*[KMG])*[ \t]+(\d+)[ \t]*$/m,
  );

  return {
    physicalFootprintBytes: physicalMatch
      ? toBinaryBytes(physicalMatch[1], physicalMatch[2])
      : null,
    ioAcceleratorVirtualBytes: ioAcceleratorMatch
      ? toBinaryBytes(ioAcceleratorMatch[1], ioAcceleratorMatch[2])
      : null,
    ioAcceleratorRegionCount: ioAcceleratorMatch
      ? parseNonNegativeInteger(ioAcceleratorMatch[3])
      : null,
  };
}

export async function runProcessMemorySampling(
  options: ProcessMemorySamplingOptions,
): Promise<ProcessMemorySamplingResult> {
  let baseline: ProcessMemorySample | null = null;
  let peak: CompleteProcessMemorySnapshot | null = null;
  let final: ProcessMemorySample | null = null;
  let failure: ProcessMemorySample | null = null;
  let reason: string | null = null;

  for (let index = 0; index <= options.sampleCount; index += 1) {
    if (index > 0) await options.delay(options.sampleIntervalMs);

    let snapshot: ProcessMemorySnapshot;
    try {
      snapshot = await options.sample(index);
    } catch (error) {
      return {
        passed: false,
        reason: `memory sample ${index} failed: ${errorMessage(error)}`,
        baseline,
        peak,
        final,
        failure,
      };
    }

    const current = { index, snapshot };
    if (index === 0) baseline = current;
    final = current;
    if (!isCompleteMemorySnapshot(snapshot)) {
      return {
        passed: false,
        reason: index === 0
          ? "vmmap baseline is missing required fields"
          : `vmmap sample ${index} is missing required fields`,
        baseline,
        peak,
        final,
        failure: current,
      };
    }

    if (index === 0) {
      peak = { ...snapshot };
      continue;
    }
    peak = maxMemorySnapshot(peak!, snapshot);
    const sampleFailure = memoryGrowthFailure(
      baseline!.snapshot as CompleteProcessMemorySnapshot,
      snapshot,
      options,
    );
    if (!failure && sampleFailure) {
      failure = current;
      reason = sampleFailure;
    }
  }

  return {
    passed: failure === null,
    reason,
    baseline,
    peak,
    final,
    failure,
  };
}

function memoryGrowthFailure(
  baseline: CompleteProcessMemorySnapshot,
  sample: CompleteProcessMemorySnapshot,
  limits: Pick<
    ProcessMemorySamplingOptions,
    | "ioAcceleratorRegionGrowthLimit"
    | "ioAcceleratorVirtualGrowthLimitBytes"
    | "physicalFootprintGrowthLimitBytes"
  >,
): string | null {
  const failures: string[] = [];
  const regionDelta = sample.ioAcceleratorRegionCount -
    baseline.ioAcceleratorRegionCount;
  const virtualDelta = sample.ioAcceleratorVirtualBytes -
    baseline.ioAcceleratorVirtualBytes;
  const footprintDelta = sample.physicalFootprintBytes -
    baseline.physicalFootprintBytes;
  if (regionDelta > limits.ioAcceleratorRegionGrowthLimit) {
    failures.push(
      `IOAccelerator region delta ${regionDelta} > ${limits.ioAcceleratorRegionGrowthLimit}`,
    );
  }
  if (virtualDelta > limits.ioAcceleratorVirtualGrowthLimitBytes) {
    failures.push(
      `IOAccelerator virtual delta ${virtualDelta} > ${limits.ioAcceleratorVirtualGrowthLimitBytes}`,
    );
  }
  if (footprintDelta > limits.physicalFootprintGrowthLimitBytes) {
    failures.push(
      `physical footprint delta ${footprintDelta} > ${limits.physicalFootprintGrowthLimitBytes}`,
    );
  }
  return failures.length > 0 ? failures.join("; ") : null;
}

function maxMemorySnapshot(
  left: CompleteProcessMemorySnapshot,
  right: CompleteProcessMemorySnapshot,
): CompleteProcessMemorySnapshot {
  return {
    physicalFootprintBytes: Math.max(
      left.physicalFootprintBytes,
      right.physicalFootprintBytes,
    ),
    ioAcceleratorVirtualBytes: Math.max(
      left.ioAcceleratorVirtualBytes,
      right.ioAcceleratorVirtualBytes,
    ),
    ioAcceleratorRegionCount: Math.max(
      left.ioAcceleratorRegionCount,
      right.ioAcceleratorRegionCount,
    ),
  };
}

function isCompleteMemorySnapshot(
  snapshot: ProcessMemorySnapshot,
): snapshot is CompleteProcessMemorySnapshot {
  return snapshot.physicalFootprintBytes !== null &&
    snapshot.ioAcceleratorVirtualBytes !== null &&
    snapshot.ioAcceleratorRegionCount !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toBinaryBytes(value: string, unit: string): number | null {
  if (!(unit in BINARY_UNIT_BYTES)) return null;
  const parsed = Number(value);
  const bytes = parsed * BINARY_UNIT_BYTES[unit as keyof typeof BINARY_UNIT_BYTES];
  return Number.isFinite(bytes) ? bytes : null;
}

function parseNonNegativeInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
