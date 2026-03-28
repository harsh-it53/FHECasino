function getMinePositions(seed: bigint, mineCount: number): boolean[] {
    const GRID_SIZE = 25;
    const indices: number[] = new Array(GRID_SIZE).fill(0).map((_, i) => i);
    const minePositions = new Array(GRID_SIZE).fill(false);

    let lcgState = seed;
    const pA = 6364136223846793005n;
    const pC = 1442695040888963407n;
    const MOD_64 = 1n << 64n;

    for (let i = 0; i < mineCount; i++) {
        lcgState = ((lcgState * pA + pC) % MOD_64 + MOD_64) % MOD_64;
        const remaining = GRID_SIZE - i;
        const j = i + Number(lcgState % BigInt(remaining));

        const tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;

        minePositions[indices[i]] = true;
    }
    return minePositions;
}

const mineP1 = getMinePositions(0n, 3);
console.log("Seed 0n, Mines:", mineP1.map((v, i) => v ? i : -1).filter(v => v !== -1));

const combinedSeed = 1018894101185570n ^ 7n; // from CoFHE mock taskManager mockStorage
const mineP2 = getMinePositions(combinedSeed, 3);
console.log("CombinedSeed, Mines:", mineP2.map((v, i) => v ? i : -1).filter(v => v !== -1));

export { };
