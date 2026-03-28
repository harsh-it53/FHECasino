function getMinePositions(seed, mineCount) {
  const GRID_SIZE = 25;
  const indices = new Array(GRID_SIZE).fill(0).map((_, i) => i);
  const minePositions = new Array(GRID_SIZE).fill(false);
  
  let lcgState = BigInt(seed);
  const pA = 6364136223846793005n;
  const pC = 1442695040888963407n;
  const MOD_64 = 1n << 64n;

  for (let i = 0; i < mineCount; i++) {
    lcgState = (lcgState * pA + pC);
    // JS BigInt doesn't automatically wrap to 64-bit, we must manually wrap it
    lcgState = BigInt.asUintN(64, lcgState);
    
    const remaining = GRID_SIZE - i;
    const j = i + Number(lcgState % BigInt(remaining));
    
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
    
    minePositions[indices[i]] = true;
  }
  return minePositions.map((v, i) => v ? i : -1).filter(v => v !== -1);
}

console.log(JSON.stringify({
  seed0: getMinePositions(0n, 3)
}));
